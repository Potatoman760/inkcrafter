import Phaser from "phaser";
import { InkList } from "inkjs";
import { GAME_HEIGHT, GAME_WIDTH, SceneKey } from "@/config/gameConfig";
import { getGameState } from "@/state/registry";
import type { GameState } from "@/state/GameState";
import type { ExportedItem } from "@/bundle/spec/bundle/catalogue";
import { makeButton } from "@/ui/Button";
import { formatUiText, UI_TEXT } from "@/config/uiText";
import { setControllerActions } from "@/input/FocusNavigation";

export interface CharacterData {
  /** The paused scene beneath this modal panel. */
  origin: SceneKey;
}

const PANEL_WIDTH = GAME_WIDTH * 0.4;
const PANEL_X = GAME_WIDTH - PANEL_WIDTH;
const CONTENT_X = PANEL_X + 34;
const CONTENT_TOP = 92;
const CONTENT_BOTTOM = GAME_HEIGHT - 88;
const CONTENT_HEIGHT = CONTENT_BOTTOM - CONTENT_TOP;
const CONTENT_WIDTH = PANEL_WIDTH - 68;
const SCROLL_STEP = 44;

/**
 * A modal, scrollable summary of player-visible stats and inventory. Hidden
 * story vars deliberately never enter this screen.
 * The VN scene is paused beneath it, so only this panel can receive input.
 */
export class CharacterScene extends Phaser.Scene {
  private origin!: SceneKey;
  private content!: Phaser.GameObjects.Container;
  private maxScroll = 0;
  private scroll = 0;

  constructor() {
    super(SceneKey.Character);
  }

  create(data: CharacterData): void {
    this.origin = data.origin;
    setControllerActions(this, {
      back: () => this.close(),
      previousPage: () => this.scrollBy(-CONTENT_HEIGHT * 0.8),
      nextPage: () => this.scrollBy(CONTENT_HEIGHT * 0.8),
    });
    this.input.resetCursor();
    this.input.keyboard?.on("keydown-ESC", this.close, this);
    this.input.keyboard?.on("keydown-UP", () => this.scrollBy(-SCROLL_STEP), this);
    this.input.keyboard?.on("keydown-DOWN", () => this.scrollBy(SCROLL_STEP), this);

    // This transparent full-canvas object makes the modal intent explicit even
    // if the origin changes later: nothing behind the panel can be clicked.
    this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.45)
      .setOrigin(0)
      .setInteractive();

    this.add
      .rectangle(PANEL_X, 0, PANEL_WIDTH, GAME_HEIGHT, 0x101525, 0.98)
      .setOrigin(0)
      .setStrokeStyle(2, 0x5a6b8c, 0.9);

    this.add.text(CONTENT_X, 26, UI_TEXT.characterTitle, {
      fontFamily: "system-ui, sans-serif",
      fontSize: "32px",
      fontStyle: "bold",
      color: "#f2f2f2",
    });

    this.buildContent(getGameState(this));

    makeButton(
      this,
      PANEL_X + PANEL_WIDTH / 2,
      GAME_HEIGHT - 44,
      UI_TEXT.characterClose,
      () => this.close(),
      { width: 180, height: 50, fontSize: "19px" },
    );

    this.input.on(
      Phaser.Input.Events.POINTER_WHEEL,
      (pointer: Phaser.Input.Pointer, _over: Phaser.GameObjects.GameObject[], _dx: number, dy: number) => {
        if (pointer.x >= PANEL_X) this.scrollBy(dy);
      },
    );
  }

  private buildContent(state: GameState): void {
    this.content = this.add.container(CONTENT_X, CONTENT_TOP);
    let y = 0;

    const heading = (label: string): void => {
      this.content.add(
        this.add.text(0, y, label, {
          fontFamily: "system-ui, sans-serif",
          fontSize: "22px",
          fontStyle: "bold",
          color: "#cfd8ee",
        }),
      );
      y += 38;
    };

    const line = (label: string, muted = false): void => {
      const text = this.add.text(8, y, label, {
        fontFamily: "system-ui, sans-serif",
        fontSize: "18px",
        color: muted ? "#8e9ab5" : "#f2f2f2",
        wordWrap: { width: CONTENT_WIDTH - 16 },
      });
      this.content.add(text);
      y += text.height + 12;
    };

    heading(UI_TEXT.characterStats);
    const stats = state.bundle.catalogue.stats;
    if (stats.length === 0) {
      line(UI_TEXT.characterNoStats, true);
    } else {
      for (const stat of stats) {
        const label = stat.display.trim() || stat.name;
        line(
          formatUiText(UI_TEXT.characterStatValue, {
            label,
            value: displayValue(state.engine.getVariable(stat.name)),
          }),
        );
      }
    }

    y += 18;
    heading(UI_TEXT.characterInventory);
    const carried = inventoryItems(state);
    if (carried.length === 0) {
      line(UI_TEXT.characterEmptyInventory, true);
    } else {
      let category = "";
      for (const item of carried) {
        const nextCategory = item.category.trim();
        if (nextCategory.length > 0 && nextCategory !== category) {
          category = nextCategory;
          line(category, true);
        }
        line(formatUiText(UI_TEXT.characterInventoryItem, { item: item.display.trim() || item.name }));
      }
    }

    this.maxScroll = Math.max(0, y - CONTENT_HEIGHT);

    const maskShape = this.add.graphics().fillStyle(0xffffff).fillRect(
      PANEL_X,
      CONTENT_TOP,
      PANEL_WIDTH,
      CONTENT_HEIGHT,
    );
    this.content.setMask(maskShape.createGeometryMask());
    maskShape.setVisible(false);

    if (this.maxScroll > 0) {
      this.add
        .text(PANEL_X + PANEL_WIDTH - 30, CONTENT_BOTTOM - 24, UI_TEXT.characterScrollMarker, {
          fontFamily: "system-ui, sans-serif",
          fontSize: "20px",
          color: "#8e9ab5",
        })
        .setOrigin(0.5);
    }
  }

  private scrollBy(delta: number): void {
    if (this.maxScroll === 0) return;
    this.scroll = Phaser.Math.Clamp(this.scroll + delta, 0, this.maxScroll);
    this.content.y = CONTENT_TOP - this.scroll;
  }

  private close(): void {
    this.scene.stop();
    this.scene.resume(this.origin);
  }
}

function displayValue(value: unknown): string {
  if (typeof value === "boolean") return value ? UI_TEXT.characterYes : UI_TEXT.characterNo;
  if (typeof value === "number" || typeof value === "string") return String(value);
  return UI_TEXT.characterMissingValue;
}

/** Match the live Ink list's qualified item names back to exported labels. */
function inventoryItems(state: GameState): ExportedItem[] {
  const catalogue = state.bundle.catalogue;
  const value = state.engine.getVariable(catalogue.inventoryVariable);
  if (!(value instanceof InkList)) return [];

  const owned = new Set(
    value.orderedItems.map(({ Key }) => `${Key.originName ?? ""}.${Key.itemName ?? ""}`),
  );
  return catalogue.items.filter((item) => owned.has(`${item.list}.${item.name}`));
}
