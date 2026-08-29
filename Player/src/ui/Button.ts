import Phaser from "phaser";
import { PlayerSettings } from "@/settings/PlayerSettings";
import { registerFocusable } from "@/input/FocusNavigation";

export interface ButtonOptions {
  width?: number;
  height?: number;
  fontSize?: string;
  enabled?: boolean;
  /** Draw as the currently selected member of a button group. */
  selected?: boolean;
  /** Optional label shown beneath the button while it is hovered. */
  tooltip?: string;
}

/**
 * A simple reusable text button (rounded rect + centred label) used by the menu
 * and save/load screens. Returns the container so callers can reposition it.
 */
export function makeButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  onClick: () => void,
  opts: ButtonOptions = {},
): Phaser.GameObjects.Container {
  const width = opts.width ?? 320;
  const height = opts.height ?? 60;
  const enabled = opts.enabled ?? true;
  const contrast = PlayerSettings.values.highContrast;
  const baseFill = opts.selected ? 0x425b91 : contrast ? 0x090d18 : 0x1b2238;

  const bg = scene.add.graphics();
  const draw = (fill: number) => {
    bg.clear();
    // Disabled controls need to read as unavailable, not merely as a darker
    // version of the same blue button. They also receive no interactive hit
    // area below, so the visual state and behaviour agree.
    bg.fillStyle(enabled ? fill : 0x34363d, enabled ? 0.95 : 0.9);
    bg.fillRoundedRect(-width / 2, -height / 2, width, height, 12);
    bg.lineStyle(contrast ? 3 : 2, enabled ? (contrast ? 0xb9d0ff : 0x5a6b8c) : 0x60636b, enabled ? 0.9 : 0.65);
    bg.strokeRoundedRect(-width / 2, -height / 2, width, height, 12);
  };
  draw(baseFill);

  const label = scene.add
    .text(0, 0, text, {
      fontFamily: "system-ui, sans-serif",
      fontSize: opts.fontSize ?? "22px",
      color: enabled ? "#f2f2f2" : "#777b84",
    })
    .setOrigin(0.5);

  const children: Phaser.GameObjects.GameObject[] = [bg, label];
  let focused = false;
  let tooltip: Phaser.GameObjects.Container | undefined;
  if (opts.tooltip) {
    const tipLabel = scene.add
      .text(0, 15, opts.tooltip, {
        fontFamily: "system-ui, sans-serif",
        fontSize: "16px",
        color: "#f2f2f2",
      })
      .setOrigin(0.5);
    const tipWidth = tipLabel.width + 20;
    const tipBg = scene.add.graphics();
    tipBg.fillStyle(0x101525, 0.98);
    tipBg.fillRoundedRect(-tipWidth / 2, 0, tipWidth, 30, 7);
    tipBg.lineStyle(1, 0x5a6b8c, 0.9);
    tipBg.strokeRoundedRect(-tipWidth / 2, 0, tipWidth, 30, 7);
    tooltip = scene.add.container(0, height / 2 + 7, [tipBg, tipLabel]).setVisible(false);
    children.push(tooltip);
  }

  const container = scene.add.container(x, y, children);
  container.setSize(width, height);

  if (enabled) {
    container.setInteractive({ useHandCursor: true });
    container.on("pointerover", () => {
      draw(0x2a3354);
      tooltip?.setVisible(true);
    });
    container.on("pointerout", () => {
      draw(focused ? 0x2a3354 : baseFill);
      tooltip?.setVisible(false);
    });
    container.on("pointerdown", () => {
      tooltip?.setVisible(false);
      onClick();
    });
    registerFocusable(scene, {
      object: container,
      activate: onClick,
      onFocus: (value) => {
        focused = value;
        draw(value ? 0x2a3354 : baseFill);
        tooltip?.setVisible(value);
      },
    });
  }

  return container;
}
