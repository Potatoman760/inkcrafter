import Phaser from "phaser";
import { GAME_WIDTH, GAME_HEIGHT, SAVE, SceneKey } from "@/config/gameConfig";
import { getGameState } from "@/state/registry";
import {
  manualPageId,
  savePages,
  SaveManager,
  saveTitle,
  type SavePageId,
  type SlotInfo,
} from "@/save/SaveManager";
import type { VNScene } from "@/scenes/VNScene";
import { makeButton } from "@/ui/Button";
import { formatUiText, UI_TEXT } from "@/config/uiText";
import { setControllerActions } from "@/input/FocusNavigation";

export interface SaveLoadData {
  /** The scene that launched this overlay, paused beneath it. */
  origin: SceneKey;
}

/**
 * One slot row.
 *
 * Every x in the row is derived from the plate's own edges rather than written
 * as an offset from the centre of the screen: the two were independent numbers,
 * and the Load button had drifted 25px past the right edge of the plate it is
 * supposed to sit in. The description is wrapped to whatever is left over, so a
 * long save label runs out of room instead of running under the buttons.
 */
const GRID = {
  top: 160,
  cardWidth: 560,
  cardHeight: 72,
  columnGap: 18,
  rowGap: 10,
  padding: 14,
  buttonWidth: 78,
  buttonHeight: 40,
  buttonGap: 8,
} as const;

/**
 * Unified, modal Menu overlay: per-slot Save and Load, plus Resume and Return to
 * Title. Launched on top of (and pausing) either the VN scene or the main menu.
 */
export class SaveLoadScene extends Phaser.Scene {
  private origin!: SceneKey;
  private page: SavePageId = manualPageId(1);
  /**
   * The row whose name is being typed, if any.
   *
   * `writable` is carried rather than recomputed because committing has to know
   * whether an empty slot may be written into, and by then the `SlotInfo` the
   * row was drawn from is gone.
   */
  private editing: { slot: string; writable: boolean } | null = null;
  private nameField: { element: Phaser.GameObjects.DOMElement; input: HTMLInputElement } | null = null;

  constructor() {
    super(SceneKey.SaveLoad);
  }

  create(data: SaveLoadData): void {
    this.origin = data.origin;
    // Phaser destroyed the old display list when this scene stopped, so the
    // stale references left behind point at nothing.
    this.editing = null;
    this.nameField = null;
    setControllerActions(this, {
      back: () => this.close(),
      previousPage: () => this.changePage(-1),
      nextPage: () => this.changePage(1),
    });

    // The scene beneath was paused with the pointer still over the button that
    // opened this one. A paused scene's input plugin is inactive, so the
    // pointerout that would have cleared its hand cursor never arrives and the
    // cursor stays a pointer over the whole overlay — which reads as though
    // everything on it were clickable. Closing is fine by comparison: stopping
    // a scene shuts its input down, and that does reset the cursor.
    this.input.resetCursor();

    // The menu is an overlay rather than a destination, so Escape means the
    // same thing as Resume whether it was opened from the story or the title
    // screen. Phaser tears this scene's keyboard listeners down when it stops,
    // so reopening the menu does not accumulate handlers.
    this.input.keyboard?.on("keydown-ESC", this.close, this);

    this.render();
  }

  private render(): void {
    // The field is a real DOM node living beside the canvas rather than on it,
    // and `removeAll` only unlists its game object. Without this it would stay
    // on screen, over a menu that has been redrawn underneath it.
    this.nameField?.element.destroy();
    this.nameField = null;
    this.children.removeAll();

    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.72).setOrigin(0);

    this.add
      .text(GAME_WIDTH / 2, 42, UI_TEXT.saveMenuTitle, {
        fontFamily: "Georgia, serif",
        fontSize: "46px",
        color: "#ffd98a",
      })
      .setOrigin(0.5);

    this.renderPageTabs();

    const state = getGameState(this);
    for (const [at, info] of SaveManager.listPage(this.page, state).entries()) {
      const column = at % 2;
      const row = Math.floor(at / 2);
      const x =
        GAME_WIDTH / 2 +
        (column === 0 ? -(GRID.cardWidth + GRID.columnGap) / 2 : (GRID.cardWidth + GRID.columnGap) / 2);
      const y = GRID.top + row * (GRID.cardHeight + GRID.rowGap);
      this.renderSlotCard(info, x, y);
    }

    const bottomY = GAME_HEIGHT - 70;
    makeButton(this, GAME_WIDTH / 2 - 170, bottomY, UI_TEXT.saveMenuResume, () => this.close(), {
      width: 260,
      height: 52,
    });
    makeButton(this, GAME_WIDTH / 2 + 170, bottomY, UI_TEXT.saveMenuReturnToTitle, () => this.returnToTitle(), {
      width: 260,
      height: 52,
    });

  }

  private renderPageTabs(): void {
    const pages = savePages();
    const width = 88;
    const gap = 8;
    const span = pages.length * width + (pages.length - 1) * gap;
    let x = GAME_WIDTH / 2 - span / 2 + width / 2;

    for (const page of pages) {
      const label =
        page === "auto"
          ? UI_TEXT.saveMenuPageAuto
          : page === "quick"
            ? UI_TEXT.saveMenuPageQuick
            : page.slice("manual-".length);
      makeButton(
        this,
        x,
        96,
        label,
        () => {
          this.page = page;
          this.render();
        },
        {
          width,
          height: 38,
          fontSize: "16px",
          selected: page === this.page,
        },
      );
      x += width + gap;
    }
  }

  private changePage(direction: -1 | 1): void {
    // Slot ids carry their page, so an open field could never match a row on
    // the page being turned to. Abandoning it is also the honest reading of
    // walking away from it.
    this.editing = null;

    const pages = savePages();
    const at = pages.indexOf(this.page);
    this.page = pages[(at + direction + pages.length) % pages.length]!;
    this.render();
  }

  private renderSlotCard(info: SlotInfo, x: number, y: number): void {
    const { slot, data } = info;
    // A save from an earlier draft of the story is offered, and said so — most
    // edits leave one perfectly loadable, and discarding a playthrough over a
    // reworded line would be worse than the risk of a rough landing.
    const desc = data
      ? formatUiText(UI_TEXT.saveMenuDescription, {
          label: saveTitle(data),
          date: new Date(data.timestamp).toLocaleString(),
          stale: info.stale ? UI_TEXT.saveMenuOlderDraft : "",
        })
      : UI_TEXT.saveMenuEmptySlot;

    const left = x - GRID.cardWidth / 2;
    const right = x + GRID.cardWidth / 2;

    // Right to left: Load hugs the plate's inner edge, Save sits beside it, and
    // the description gets what is left between the two.
    const loadX = right - GRID.padding - GRID.buttonWidth / 2;
    const saveX = loadX - GRID.buttonWidth - GRID.buttonGap;
    const textX = left + GRID.padding;
    const textWidth = saveX - GRID.buttonWidth / 2 - GRID.buttonGap - textX;

    // Backing plate + slot description on the left.
    this.add
      .rectangle(x, y, GRID.cardWidth, GRID.cardHeight, 0x10141f, 0.85)
      .setStrokeStyle(2, 0x5a6b8c, 0.6);
    const manualPage = info.page.startsWith("manual-")
      ? Number(info.page.slice("manual-".length))
      : null;
    const visibleSlot =
      manualPage === null
        ? info.index
        : (manualPage - 1) * SAVE.slotsPerPage + info.index;
    const template =
      info.page === "auto"
        ? UI_TEXT.saveMenuAutoSlot
        : info.page === "quick"
          ? UI_TEXT.saveMenuQuickSlot
          : UI_TEXT.saveMenuSlot;
    const rowLabel = formatUiText(template, { slot: visibleSlot, description: desc });

    // A save can be named because it exists, or because this row is one the
    // player could write into and name on the way. Auto and Quick rows qualify
    // on the first count alone: a checkpoint worth keeping is worth saying why.
    const writable = info.writable && this.origin === SceneKey.VN;
    const nameable = data !== null || writable;

    if (this.editing?.slot === slot) {
      this.renderNameField(textX, y, textWidth, data?.name ?? "");
    } else {
      this.add
        .text(textX, y, rowLabel, {
          fontFamily: "system-ui, sans-serif",
          fontSize: "15px",
          color: "#e8edf8",
          wordWrap: { width: textWidth },
          // Two lines, because a slot the player named themselves is usually
          // longer than the speaker's name this used to show, and on one line
          // the name pushed the date off the end of the row entirely. The plate
          // is 72px tall and the text is centred in it, so the second line
          // costs nothing that was being used.
          maxLines: 2,
        })
        .setOrigin(0, 0.5);

      // The hit area is the whole description column rather than the glyphs,
      // so a short label does not mean a target the width of three words.
      if (nameable) {
        this.add
          .rectangle(textX, y, textWidth, GRID.cardHeight - 8, 0x000000, 0)
          .setOrigin(0, 0.5)
          .setInteractive({ useHandCursor: true })
          .on("pointerup", () => {
            this.editing = { slot, writable };
            this.render();
          });
      }
    }

    makeButton(this, saveX, y, UI_TEXT.saveMenuSave, () => this.onSave(slot, data?.name), {
      width: GRID.buttonWidth,
      height: GRID.buttonHeight,
      fontSize: "15px",
      enabled: info.writable && this.origin === SceneKey.VN,
    });
    makeButton(this, loadX, y, UI_TEXT.saveMenuLoad, () => this.onLoad(slot), {
      width: GRID.buttonWidth,
      height: GRID.buttonHeight,
      fontSize: "15px",
      enabled: data !== null,
    });
  }

  /**
   * The name field, drawn where the row's description was.
   *
   * A real input rather than keys gathered by Phaser: this is somebody typing a
   * phrase of their own, which wants a caret, selection, paste, and a native
   * keyboard on a tablet.
   */
  private renderNameField(textX: number, y: number, width: number, current: string): void {
    const input = document.createElement("input");
    input.type = "text";
    input.value = current;
    input.maxLength = SAVE.maxNameLength;
    input.autocomplete = "off";
    input.spellcheck = false;
    input.placeholder = UI_TEXT.saveNamePlaceholder;
    input.setAttribute("aria-label", UI_TEXT.saveNameLabel);
    input.style.cssText =
      `width:${width}px;height:34px;box-sizing:border-box;padding:2px 10px;pointer-events:auto;` +
      "background:#0a0e1a;border:1px solid #8fb3ff;border-radius:4px;color:#f2f2f2;" +
      "font:400 16px system-ui,sans-serif;outline:none;caret-color:#8fb3ff;";

    // `add.dom` places by centre; the text it stands in for is left-aligned.
    const element = this.add.dom(textX + width / 2, y, input);
    this.nameField = { element, input };

    input.addEventListener("keydown", (event) => {
      // The menu listens for Escape, and the story beneath it for Enter and
      // Space. None of the three should reach anything while this is open.
      event.stopPropagation();
      if (event.key === "Enter") {
        event.preventDefault();
        this.commitName();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        this.stopEditing();
      }
    });
    queueMicrotask(() => {
      // Selected rather than merely focused, so a row that already has a name
      // can be replaced by typing instead of cleared first.
      if (this.nameField?.input === input) {
        input.focus();
        input.select();
      }
    });
  }

  /** What is in the open field, or nothing if it was never opened. */
  private typedName(slot: string): string | undefined {
    return this.editing?.slot === slot ? (this.nameField?.input.value ?? "") : undefined;
  }

  /**
   * Enter: the row is done being named.
   *
   * A slot that holds a save is renamed, which never touches the position in
   * it. An empty one is written, because a name typed into an empty row is only
   * ever the name of the save about to go there, and making the player reach
   * for Save afterwards would be asking twice.
   */
  private commitName(): void {
    const editing = this.editing;
    if (!editing) return;

    const name = this.typedName(editing.slot) ?? "";
    this.editing = null;

    if (SaveManager.exists(editing.slot)) SaveManager.rename(editing.slot, name);
    else if (editing.writable) this.writeSave(editing.slot, name);

    this.render();
  }

  /** Escape: the row goes back to being text, and nothing is written. */
  private stopEditing(): void {
    if (!this.editing) return;
    this.editing = null;
    this.render();
  }

  /**
   * Save writes the slot, taking the name from the row's own field when it is
   * open and otherwise preserving the name already committed to that row.
   * Enter redraws the menu after committing a rename, so without the latter a
   * following Save click would replace the newly named save with an unnamed
   * one. An explicitly blank open field still wins and clears the name.
   */
  private onSave(slot: string, currentName?: string): void {
    const name = this.typedName(slot) ?? currentName;
    this.editing = null;
    this.writeSave(slot, name);
    this.render(); // refresh timestamps/labels
  }

  private writeSave(slot: string, name?: string): void {
    const state = getGameState(this);
    SaveManager.save(slot, state, state.sceneMeta.speaker || UI_TEXT.saveMenuDefaultLabel, name);
  }

  private onLoad(slot: string): void {
    const state = getGameState(this);
    const data = SaveManager.load(slot, state);
    if (!data) return;
    if (!SaveManager.apply(state, data)) return;

    this.scene.stop();
    if (this.origin === SceneKey.VN) {
      this.scene.resume(SceneKey.VN);
      (this.scene.get(SceneKey.VN) as VNScene).applyLoadedState();
    } else {
      // Loaded from the main menu: drop straight into the VN scene.
      this.scene.stop(this.origin);
      this.scene.start(SceneKey.VN, { mode: "resume" });
    }
  }

  private returnToTitle(): void {
    this.scene.stop();
    if (this.origin === SceneKey.VN) {
      this.scene.stop(SceneKey.VN);
      this.scene.start(SceneKey.MainMenu);
    } else {
      this.scene.resume(this.origin);
    }
  }

  private close(): void {
    // Escape and the controller's Back both arrive here, and while a row is
    // being named the innermost thing they can mean is that field.
    if (this.editing) {
      this.stopEditing();
      return;
    }

    this.scene.stop();
    this.scene.resume(this.origin);
  }
}
