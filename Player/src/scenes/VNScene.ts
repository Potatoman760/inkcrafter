import Phaser from "phaser";
import { GAME_WIDTH, GAME_HEIGHT, MINIGAME_SCENES, SceneKey } from "@/config/gameConfig";
import { getGameState } from "@/state/registry";
import { getAssetIndex } from "@/bundle/registry";
import type { GameState } from "@/state/GameState";
import { SaveManager } from "@/save/SaveManager";
import { MediaLayer } from "@/media/MediaLayer";
import { MusicPlayer } from "@/audio/MusicPlayer";
import { DialogueBox } from "@/ui/DialogueBox";
import { ChoiceMenu } from "@/ui/ChoiceMenu";
import { makeButton } from "@/ui/Button";
import { QuickMenu } from "@/ui/QuickMenu";
import { VariableDisplay } from "@/ui/VariableDisplay";
import { History } from "@/state/History";
import type { StoryLine } from "@/narrative/StoryEngine";
import { assertNever } from "@/util/exhaustive";
import { UI_TEXT } from "@/config/uiText";
import { setControllerActions } from "@/input/FocusNavigation";

/**
 * How fast skipping walks the story.
 *
 * Fast enough to get somewhere, slow enough that the lines going past are
 * legible — a reader skipping is usually looking for a place they recognise,
 * not staring at a blank box until it stops.
 */
const SKIP_STEP_MS = 100;

/**
 * How much wheel delta buys one step.
 *
 * About one notch of a mouse wheel, which reports 100 or so per notch on every
 * browser worth naming. Small enough that a notch always registers, large
 * enough that a trackpad's stream of ones and twos does not run away.
 */
const WHEEL_STEP = 50;

/** Compact, evenly spaced controls along the top-right edge. */
const TOOLBAR = {
  size: 48,
  gap: 10,
  right: 16,
  y: 36,
} as const;

function toolbarX(fromRight: number): number {
  return GAME_WIDTH - TOOLBAR.right - TOOLBAR.size / 2 - fromRight * (TOOLBAR.size + TOOLBAR.gap);
}

export interface VNSceneData {
  /** Preview starts from a restored pre-paragraph checkpoint and advances normally. */
  mode: "new" | "preview" | "resume";
}

/**
 * The core visual-novel loop. Advances the ink story on click/space, applies
 * each line's tags to the media layer and stats, renders choices, commits
 * authored autosave checkpoints, and exposes a toolbar for save/load/menu.
 */
export class VNScene extends Phaser.Scene {
  private state!: GameState;
  private media!: MediaLayer;
  private music!: MusicPlayer;
  private dialogue!: DialogueBox;
  private choices!: ChoiceMenu;
  private variableDisplay!: VariableDisplay;
  private mapButton?: Phaser.GameObjects.Container;
  private characterButton?: Phaser.GameObjects.Container;
  private menuButton?: Phaser.GameObjects.Container;
  /** True while the reader is looking at the art with everything else out of the way. */
  private uiHidden = false;
  /** Wheel delta banked since the last step it paid for. */
  private wheeled = 0;
  private quick!: QuickMenu;
  private readonly history = new History();
  private skipTimer?: Phaser.Time.TimerEvent;
  private ended = false;
  /** A # autosave event waiting for the next complete displayed frame. */
  private autosavePending = false;
  /** Holds input while an encrypted video needed by the next line is being prepared. */
  private advancing = false;
  /** True only while a minigame overlay, rather than an ordinary menu, owns the pause. */
  private minigameActive = false;
  private minigameBlankLine = false;

  constructor() {
    super(SceneKey.VN);
  }

  create(data: VNSceneData): void {
    this.state = getGameState(this);
    setControllerActions(this, {
      accept: () => this.onAdvanceInput(),
      back: () => this.goBack(),
      menu: () => this.openMenu(),
      secondary: () => this.quickSave(),
      tertiary: () => this.toggleChrome(),
    });
    this.ended = false;
    this.autosavePending = false;
    this.advancing = false;
    this.minigameActive = false;
    this.minigameBlankLine = false;

    this.cameras.main.setBackgroundColor("#05060a");
    this.media = new MediaLayer(this, getAssetIndex(this));
    this.music = new MusicPlayer(this, getAssetIndex(this));
    // Audio outlives the scene that started it, because it belongs to the
    // game's sound manager rather than to the display list. Nothing stops the
    // story's music or active cues on the way back to the title unless this does.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.music.destroy();
      this.media.destroy();
    });
    this.events.on(Phaser.Scenes.Events.RESUME, this.onSceneResume, this);
    this.dialogue = new DialogueBox(this);
    this.choices = new ChoiceMenu(this);
    // Stats remain private by default. A story can opt one live value into this
    // compact HUD for a single knot with `# display:`.
    this.variableDisplay = new VariableDisplay(this);
    this.buildToolbar();

    // A full-screen, transparent "advance zone" beneath the UI. Because Phaser
    // input is top-only by default, clicks on the higher-depth toolbar/choice
    // buttons go to those buttons, while clicks anywhere else advance dialogue.
    this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0)
      .setOrigin(0)
      .setDepth(-10)
      .setInteractive()
      .on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
        // Only the left button advances. The right one is the art's.
        if (pointer.leftButtonDown()) this.onAdvanceInput();
      });
    // The wheel, as the two things a reader already does with the mouse: down
    // is the click, up is Back. Nothing new happens — both route into the
    // methods the button and the click already use.
    this.input.on(
      Phaser.Input.Events.POINTER_WHEEL,
      (_pointer: Phaser.Input.Pointer, _over: unknown, _deltaX: number, deltaY: number) =>
        this.onWheel(deltaY),
    );
    this.input.keyboard?.on("keydown-SPACE", this.onAdvanceInput, this);
    this.input.keyboard?.on("keydown-ENTER", this.onAdvanceInput, this);
    // The other way in, and the only one on a keyboard. Held to the same
    // meaning as the right button: press it again to bring everything back.
    this.input.keyboard?.on("keydown-H", () => this.toggleChrome(), this);

    // Right-click anywhere, not just where nothing else is listening: the whole
    // point is to get the panel covering the picture out of the way, and the
    // panel is exactly what the pointer is usually over.
    this.input.mouse?.disableContextMenu();
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      if (pointer.rightButtonDown()) this.toggleChrome();
    });

    if (data.mode === "resume") {
      void this.rebuildAndShow();
    } else {
      this.proceed();
    }
    this.refreshMapButton();
  }

  /** Re-render the saved visual frame and the line the player was reading. */
  private async rebuildAndShow(): Promise<void> {
    const meta = this.state.sceneMeta;
    await this.media.rebuildFrom(meta, this.state.emphasis());
    this.music.restore(meta.music?.name, meta.music?.variant ?? null);
    this.dialogue.setLine(meta.speaker, meta.lastText);
    this.refreshVariableDisplay();

    // A frame left at a choice point has the choices waiting inside ink but
    // nothing on screen: the buttons are not part of the saved frame, they are
    // what the story offers next. Without putting them back, stepping back onto
    // a decision — or loading any save made at one — shows the line and no way
    // to answer it.
    if (!this.state.engine.canContinue && this.state.engine.choices.length > 0) {
      this.showChoices();
    }
  }

  /** Public hook used by SaveLoadScene after applying a load over this scene. */
  applyLoadedState(): void {
    this.stopSkipping();
    this.autosavePending = false;
    this.history.clear();
    this.ended = false;
    this.choices.clear();
    void this.rebuildAndShow();
    this.refreshMapButton();
    this.quick.refresh();
  }

  /**
   * Travel to a location chosen on the map: jump the story to its knot, clear
   * the current frame, and render from the new scene. Called by MapScene.
   */
  jumpTo(path: string): void {
    this.stopSkipping();
    this.autosavePending = false;
    // Travelling is a jump; the frames behind it are somewhere else entirely.
    this.history.clear();
    this.ended = false;
    this.choices.clear();
    this.media.clearSprites();
    this.state.clearStage();
    if (!this.state.engine.goTo(path)) {
      // Nowhere to go. The frame the reader was looking at is still on screen,
      // so leaving it there is the least destructive thing to do.
      this.refreshMapButton();
      return;
    }
    this.proceed();
    this.refreshMapButton();
    this.quick.refresh();
  }

  // --- input ---

  /**
   * One step per notch, whatever the device sends.
   *
   * A mouse wheel reports one large delta per notch; a trackpad reports a
   * stream of small ones, and acting on each would run a single flick through a
   * dozen lines. So the deltas are banked and spent a step at a time, and a
   * change of direction starts again rather than spending what the other
   * direction had banked.
   */
  private onWheel(deltaY: number): void {
    if (deltaY === 0) return;
    if (Math.sign(deltaY) !== Math.sign(this.wheeled)) this.wheeled = 0;
    this.wheeled += deltaY;
    if (Math.abs(this.wheeled) < WHEEL_STEP) return;
    this.wheeled = 0;

    // With everything hidden, neither direction is legible — so both ask for
    // the words back, which is the answer a click gives for the same reason.
    if (this.uiHidden) {
      this.toggleChrome();
      return;
    }

    if (deltaY > 0) this.onAdvanceInput();
    else this.goBack();
  }

  private onAdvanceInput(): void {
    // With everything hidden there is nothing to read, so a click asks for the
    // words back rather than for the next ones — otherwise a reader admiring
    // the art advances past a line they never saw.
    if (this.uiHidden) {
      this.toggleChrome();
      return;
    }
    // Taking the story back by hand is the obvious way to stop skipping, and
    // the reader will try it before they look for the button again.
    if (this.skipping) {
      this.stopSkipping();
      return;
    }
    if (this.choices.isOpen) return;
    // At a dead end (story reached -> END) there is nothing to advance to; stay
    // on the current scene. The player can still travel via the map or use the
    // menu to return to the title.
    if (this.ended) return;
    if (this.dialogue.isTyping) {
      this.dialogue.skip();
      return;
    }
    this.remember();
    this.proceed();
  }

  // --- story loop ---

  /** Move to the next piece of content: a line, a choice point, or the end. */
  private proceed(): void {
    if (this.advancing) return;
    this.advancing = true;
    void this.advance().catch((error: unknown) => {
      console.error("Could not prepare the next story frame.", error);
    }).finally(() => {
      this.advancing = false;
    });
  }

  private async advance(): Promise<void> {
    if (this.state.engine.canContinue) {
      const line = this.state.engine.continue();
      // Which map is showing follows where the story now is, read *after* the
      // line is in hand. ink moves its pointer past a line as it hands it over,
      // so this reports the line after the one about to be shown — which is the
      // same knot except at a knot's last line, where it is already the next
      // one. Reading before `continue()` is worse and not symmetrical: the
      // divert at the end of a knot has not been followed yet, so a story that
      // walks from one knot into another never reports arriving at all.
      //
      // Not driven by a tag either: the maps claim the knots they belong to, so
      // the ink says nothing about maps, and a knot nobody claims leaves the
      // showing map alone.
      this.state.followMap(line.knot);
      await this.presentLine(line);
    } else if (this.state.engine.choices.length > 0) {
      this.presentChoices();
    } else {
      this.endStory();
    }
  }

  private async presentLine(line: StoryLine): Promise<void> {
    this.state.enterKnot(line.knot);
    let minigame: string | null = null;
    let mapRequested = false;
    let word: { variable: string; label: string } | null = null;
    for (const cmd of line.tags) {
      this.state.trackTag(cmd, line.knot);
      switch (cmd.kind) {
        case "bg":
          if (cmd.name === null) this.media.clearBackground();
          else
            await this.media.setBackground(
              cmd.name,
              cmd.variant,
              cmd.once ?? false,
              cmd.flipped ?? false,
              cmd.loop ?? null
            );
          break;
        case "show":
          this.media.showSprite(cmd.name, cmd.variant, cmd.slot, cmd.flipped);
          break;
        case "music":
          // `stop` carries the fade; a tag naming a track never does, so there
          // is nothing to pass on the other branch.
          if (cmd.name === null) this.music.stop(cmd.fade);
          else this.music.play(cmd.name, cmd.variant, cmd.loop === true);
          break;
          break;
        case "anim":
          if (cmd.name === null) this.media.clearAnims();
          else await this.media.showAnim(cmd.name, cmd.variant, cmd.flipped, cmd.loop ?? null);
          break;
        case "hide":
          this.media.hideSprite(cmd.name);
          break;
        case "clear":
          this.media.clearBackground();
          this.media.clearSprites();
          this.media.clearAnims();
          break;
        case "stat":
          this.state.stats.apply(cmd.stat, cmd.op, cmd.value);
          break;
        case "npc":
          this.state.npcs.apply(cmd.id, cmd.attr, cmd.op, cmd.value);
          break;
        case "autosave":
          // Ink attaches a standalone tag to the next continuation. Wait until
          // that continuation has produced a complete frame before serialising
          // it, so a load never lands between the tag and what it introduced.
          this.autosavePending = true;
          break;
        case "minigame":
          // An event rather than scene metadata. Launch only after the tagged
          // line has finished drawing, so its words introduce the encounter.
          minigame ??= cmd.name;
          break;
        case "map":
          mapRequested = cmd.open === true;
          break;
        case "word":
          // Asked after the line has drawn, like a minigame: the reader should
          // see the word used before being offered the chance to change it.
          word ??= { variable: cmd.variable, label: cmd.label };
          break;
        case "speaker":
        case "display":
        case "active":
          break; // tracked into sceneMeta above
        default:
          assertNever(cmd);
      }
    }
    this.refreshVariableDisplay();
    // The map button reflects mapEnabled, which the tags above may have changed.
    this.refreshMapButton();
    // So does who the frame leans on — and unlike the commands above it cannot
    // be settled inside the loop, because a line may name its speaker before or
    // after the characters it puts on screen. Both orders are already written.
    // The line's own text goes in because the name may be in the prose rather
    // than in a tag, and `sceneMeta.lastText` is still the previous line here.
    this.media.setEmphasis(this.state.emphasis(line.text));

    // A tag-only line (no text) just advances to the next beat.
    if (line.text.length === 0 && minigame === null && !mapRequested && word === null) {
      await this.advance();
      return;
    }
    this.state.sceneMeta.lastText = line.text;
    if (line.text.length > 0) this.dialogue.setLine(this.state.sceneMeta.speaker, line.text);
    if (minigame !== null) {
      this.launchMinigame(minigame, line.text.length === 0);
      return;
    }
    if (word !== null) {
      // Not a suspended tag the way a minigame is: the story has already said
      // the line, and there is nothing waiting on the answer. The reader
      // closes the field and carries on from where they were.
      this.stopSkipping();
      this.scene.launch(SceneKey.Word, { ...word, origin: SceneKey.VN });
      this.scene.pause();
      return;
    }
    this.commitPendingAutosave(this.state.sceneMeta.speaker || line.text.slice(0, 24));
    // Opening is a one-shot event, not saved presentation state. Returning or
    // loading this frame must not trap the player in a reopening map overlay.
    if (mapRequested) this.openMap();
  }

  private launchMinigame(name: string, blankLine: boolean): void {
    this.stopSkipping();
    this.minigameActive = true;
    this.minigameBlankLine = blankLine;
    const kind = this.state.bundle.minigames.minigames.find((game) => game.name === name)?.kind;
    // A tag naming nothing in the catalogue still has to land somewhere, and
    // Combat is the one that explains itself when handed a game it cannot run.
    this.scene.launch(kind ? MINIGAME_SCENES[kind] : SceneKey.Combat, { name, mode: "story" });
    this.scene.pause();
  }

  /** Ordinary overlays resume VN too; only a minigame completes a suspended tag. */
  private onSceneResume(): void {
    if (!this.minigameActive) return;
    this.minigameActive = false;
    this.commitPendingAutosave(
      this.state.sceneMeta.speaker || this.state.sceneMeta.lastText.slice(0, 24),
    );
    if (this.minigameBlankLine) {
      this.minigameBlankLine = false;
      this.proceed();
    }
  }

  private presentChoices(): void {
    this.commitPendingAutosave(UI_TEXT.choiceSaveLabel);
    this.showChoices();
  }

  /**
   * Put the pending choices on screen.
   *
   * Apart from `presentChoices` because arriving at a decision and *returning*
   * to one are different events: the first is a new stopping point worth
   * recording, the second is a frame that was already saved once and does not
   * deserve a second write every time somebody steps back onto it.
   */
  private showChoices(): void {
    this.choices.present(this.state.engine.choices, (index) => {
      // Remembered before the choice is taken, so Back returns to the choice
      // itself rather than to the line before it — undoing a decision is most
      // of what anyone wants this for.
      this.remember();
      this.state.engine.choose(index);
      this.proceed();
    });
    // Freshly built, so they know nothing about being hidden yet.
    this.applyChrome();
  }

  private endStory(): void {
    // Dead end: keep the last line and current scene on screen, just stop
    // advancing. Don't navigate away. (The previous line is already shown.)
    this.ended = true;
    this.dialogue.markEndOfContent();
    this.commitPendingAutosave(
      this.state.sceneMeta.speaker ||
        this.state.sceneMeta.lastText.slice(0, 24) ||
        UI_TEXT.autosaveDefaultLabel,
    );
    this.quick.refresh();
  }

  /**
   * Put the interface out of the way, or bring it back.
   *
   * A skip is stopped on the way out: lines would go on turning over behind the
   * picture the reader stopped to look at, and the control that would end it is
   * the first thing to disappear.
   */
  private toggleChrome(): void {
    if (!this.uiHidden) this.stopSkipping();
    this.uiHidden = !this.uiHidden;
    this.applyChrome();
  }

  /**
   * Everything that sits over the art, shown or hidden from one place.
   *
   * Each control is told every time rather than toggled, so a button rebuilt
   * while hidden does not come back on its own.
   */
  private applyChrome(): void {
    const shown = !this.uiHidden;
    this.dialogue.setVisible(shown);
    this.quick.setVisible(shown);
    this.choices.setVisible(shown);
    this.mapButton?.setVisible(shown);
    this.characterButton?.setVisible(shown);
    this.menuButton?.setVisible(shown);
    this.variableDisplay.setChromeVisible(shown);
  }

  /** Draw the currently requested live value, or remove it at a knot boundary. */
  private refreshVariableDisplay(): void {
    const display = this.state.sceneMeta.display ?? null;
    if (!display) {
      this.variableDisplay.hide();
      return;
    }
    this.variableDisplay.show(display.label, this.state.engine.getVariable(display.variable));
  }

  // --- quick menu ---

  /**
   * Keep the frame the story is about to leave.
   *
   * The bar is only redrawn when this makes a difference — the first frame of a
   * run turns Back on, and every one after it changes nothing anybody can see.
   * Skipping calls this ten times a second.
   */
  private remember(): void {
    const had = this.history.canGoBack;
    this.history.push(this.state);
    if (!had) this.quick.refresh();
  }

  private goBack(): void {
    this.stopSkipping();
    if (!this.history.back(this.state)) return;

    this.ended = false;
    this.choices.clear();
    this.rebuildAndShow();
    this.refreshMapButton();
    this.quick.refresh();
  }

  private quickSave(): void {
    this.stopSkipping();
    SaveManager.quickSave(
      this.state,
      this.state.sceneMeta.speaker || this.state.sceneMeta.lastText.slice(0, 24),
    );
    // Q.Load was disabled until there was something to load.
    this.quick.refresh();
  }

  private quickLoad(): void {
    this.stopSkipping();
    const data = SaveManager.loadLatestQuick(this.state);
    if (!data || !SaveManager.apply(this.state, data)) return;

    // The frames behind a load belong to a different reading of the story;
    // stepping back into them would be a jump, not an undo.
    this.history.clear();
    this.autosavePending = false;
    this.ended = false;
    this.choices.clear();
    this.rebuildAndShow();
    this.refreshMapButton();
    this.quick.refresh();
  }

  // --- skipping ---

  private get skipping(): boolean {
    return this.skipTimer !== undefined;
  }

  private toggleSkip(): void {
    if (this.skipping) this.stopSkipping();
    else this.startSkipping();
  }

  private startSkipping(): void {
    // Nothing to skip to: a dead end stays where it is, and a choice is the
    // thing skipping exists to stop at.
    if (this.skipping || this.ended || this.choices.isOpen) return;

    this.skipTimer = this.time.addEvent({
      delay: SKIP_STEP_MS,
      loop: true,
      callback: () => this.skipStep(),
    });
    this.quick.refresh();
    // Stepped at once rather than after the first delay, so the button responds
    // to the press that started it.
    this.skipStep();
  }

  private stopSkipping(): void {
    if (!this.skipping) return;
    this.skipTimer?.remove();
    this.skipTimer = undefined;
    this.quick.refresh();
  }

  /**
   * One step of a skip: finish the line on screen, take the next one.
   *
   * Each line is revealed in full rather than left mid-typewriter, so what goes
   * past is readable and a reader can stop on something they recognise.
   */
  private skipStep(): void {
    this.remember();
    this.proceed();
    this.dialogue.skip();

    // A choice is the point of the whole feature. A dead end is nowhere left
    // to go.
    if (this.choices.isOpen || this.ended) this.stopSkipping();
  }

  private commitPendingAutosave(label: string): void {
    if (!this.autosavePending) return;
    this.autosavePending = false;
    SaveManager.autosave(this.state, label);
  }

  // --- toolbar ---

  private buildToolbar(): void {
    // Explicit depth so buttons stay above the background image, which is added
    // later (lazily, on the first `# bg:` tag) and shares depth 0.
    this.menuButton = makeButton(this, toolbarX(0), TOOLBAR.y, UI_TEXT.toolbarMenuIcon, () => this.openMenu(), {
      width: TOOLBAR.size,
      height: 44,
      fontSize: "22px",
      tooltip: UI_TEXT.toolbarMenuLabel,
    }).setDepth(400);
    this.characterButton = makeButton(
      this,
      toolbarX(2),
      TOOLBAR.y,
      UI_TEXT.toolbarCharacterIcon,
      () => this.openCharacter(),
      {
        width: TOOLBAR.size,
        height: 44,
        fontSize: "22px",
        tooltip: UI_TEXT.toolbarCharacterLabel,
      },
    ).setDepth(400);
    this.refreshMapButton();

    this.quick = new QuickMenu(this, [
      {
        label: () => UI_TEXT.quickBack,
        onClick: () => this.goBack(),
        enabled: () => this.history.canGoBack,
      },
      {
        label: () => (this.skipping ? UI_TEXT.quickStop : UI_TEXT.quickSkip),
        onClick: () => this.toggleSkip(),
        enabled: () => !this.ended,
      },
      { label: () => UI_TEXT.quickSave, onClick: () => this.quickSave() },
      {
        label: () => UI_TEXT.quickLoad,
        onClick: () => this.quickLoad(),
        enabled: () => SaveManager.loadLatestQuick(this.state) !== null,
      },
    ]);
  }

  /**
   * (Re)build the Map button so its enabled/disabled appearance tracks
   * `sceneMeta.mapEnabled` — the story disables the map during cutscenes via
   * `# map: off`.
   */
  private refreshMapButton(): void {
    this.mapButton?.destroy();
    const enabled = this.state.sceneMeta.mapEnabled;
    this.mapButton = makeButton(this, toolbarX(1), TOOLBAR.y, UI_TEXT.toolbarMapIcon, () => this.openMap(), {
      width: TOOLBAR.size,
      height: 44,
      fontSize: "22px",
      tooltip: UI_TEXT.toolbarMapLabel,
      enabled,
    })
      .setDepth(400)
      .setVisible(!this.uiHidden);
  }

  private openMap(): void {
    if (!this.state.sceneMeta.mapEnabled) return;
    this.stopSkipping();
    this.scene.launch(SceneKey.Map, { origin: SceneKey.VN });
    this.scene.pause();
  }

  private openCharacter(): void {
    this.stopSkipping();
    this.scene.launch(SceneKey.Character, { origin: SceneKey.VN });
    this.scene.pause();
  }

  private openMenu(): void {
    this.stopSkipping();
    this.scene.launch(SceneKey.SaveLoad, { origin: SceneKey.VN });
    this.scene.pause();
  }
}
