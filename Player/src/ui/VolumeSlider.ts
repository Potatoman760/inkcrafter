import Phaser from "phaser";
import { formatUiText, UI_TEXT } from "@/config/uiText";
import { registerFocusable } from "@/input/FocusNavigation";

const DEFAULT_TRACK_WIDTH = 390;
const TRACK_HEIGHT = 8;
const KNOB_RADIUS = 12;

/** A labelled, draggable zero-to-one volume control. */
export class VolumeSlider {
  readonly container: Phaser.GameObjects.Container;

  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly valueLabel: Phaser.GameObjects.Text;
  private value: number;
  private readonly trackWidth: number;
  private focused = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    label: string,
    value: number,
    onChange: (value: number) => void,
    width = DEFAULT_TRACK_WIDTH,
  ) {
    this.value = value;

    const nameLabel = scene.add
      .text(-width / 2, -24, label, {
        fontFamily: "system-ui, sans-serif",
        fontSize: "20px",
        color: "#f2f2f2",
      })
      .setOrigin(0, 0.5);

    this.valueLabel = scene.add
      .text(width / 2, -24, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "18px",
        color: "#aebbd6",
      })
      .setOrigin(1, 0.5);

    this.graphics = scene.add.graphics();
    const hitArea = scene.add
      .zone(0, 10, width, 44)
      .setInteractive({ useHandCursor: true });

    const choose = (_pointer: Phaser.Input.Pointer, localX: number): void => {
      const next = Math.max(0, Math.min(1, localX / width));
      onChange(next);
      this.setValue(next);
    };
    hitArea.on(Phaser.Input.Events.POINTER_DOWN, choose);
    hitArea.on(
      Phaser.Input.Events.POINTER_MOVE,
      (pointer: Phaser.Input.Pointer, localX: number) => {
        if (pointer.isDown) choose(pointer, localX);
      },
    );

    this.container = scene.add.container(x, y, [this.graphics, nameLabel, this.valueLabel, hitArea]);
    this.container.setSize(width, 70);
    registerFocusable(scene, {
      object: this.container,
      activate: () => undefined,
      adjust: (direction) => {
        const next = Math.max(0, Math.min(1, this.value + direction * 0.05));
        onChange(next);
        this.setValue(next);
      },
      onFocus: (focused) => {
        this.focused = focused;
        this.draw();
      },
    });
    this.trackWidth = width;
    this.draw();
  }

  setValue(value: number): void {
    this.value = Math.round(Math.max(0, Math.min(1, value)) * 20) / 20;
    this.draw();
  }

  private draw(): void {
    const left = -this.trackWidth / 2;
    const filled = this.trackWidth * this.value;
    const knobX = left + filled;

    this.graphics.clear();
    if (this.focused) {
      this.graphics.lineStyle(2, 0xb9d0ff, 1);
      this.graphics.strokeRoundedRect(left - 14, -42, this.trackWidth + 28, 82, 10);
    }
    this.graphics.fillStyle(0x343b50, 1);
    this.graphics.fillRoundedRect(left, 10 - TRACK_HEIGHT / 2, this.trackWidth, TRACK_HEIGHT, 4);
    if (filled > 0) {
      this.graphics.fillStyle(0x8aa7e8, 1);
      this.graphics.fillRoundedRect(left, 10 - TRACK_HEIGHT / 2, filled, TRACK_HEIGHT, 4);
    }
    this.graphics.fillStyle(0xe9efff, 1);
    this.graphics.fillCircle(knobX, 10, KNOB_RADIUS);
    this.graphics.lineStyle(2, 0x5a6b8c, 1);
    this.graphics.strokeCircle(knobX, 10, KNOB_RADIUS);

    this.valueLabel.setText(
      formatUiText(UI_TEXT.settingsVolumeValue, { value: Math.round(this.value * 100) }),
    );
  }
}
