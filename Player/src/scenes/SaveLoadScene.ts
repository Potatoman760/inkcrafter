import Phaser from "phaser";
import { GAME_WIDTH, GAME_HEIGHT, SAVE, SceneKey } from "@/config/gameConfig";
import { getGameState } from "@/state/registry";
import {
  manualPageId,
  savePages,
  SaveManager,
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

  constructor() {
    super(SceneKey.SaveLoad);
  }

  create(data: SaveLoadData): void {
    this.origin = data.origin;
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
          label: data.label,
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
    this.add
      .text(textX, y, rowLabel, {
        fontFamily: "system-ui, sans-serif",
        fontSize: "15px",
        color: "#e8edf8",
        wordWrap: { width: textWidth },
        maxLines: 1,
      })
      .setOrigin(0, 0.5);

    makeButton(this, saveX, y, UI_TEXT.saveMenuSave, () => this.onSave(slot), {
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

  private onSave(slot: string): void {
    const state = getGameState(this);
    SaveManager.save(slot, state, state.sceneMeta.speaker || UI_TEXT.saveMenuDefaultLabel);
    this.render(); // refresh timestamps/labels
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
    this.scene.stop();
    this.scene.resume(this.origin);
  }
}
