import Phaser from 'phaser';
import { registerFocusable } from '@/input/FocusNavigation';

export const ESTATE_COLORS = { ink: 0x152820, gold: 0xc9a86c, paper: 0xe9d9b7, muted: '#b5b5a2', cream: '#f5e9cc' };
export interface EstateControl { object: Phaser.GameObjects.Container; focus: (value: boolean) => void; activate: () => void }

/** Estate-only brass, ink and parchment controls, with shared controller focus. */
export function estateButton(scene: Phaser.Scene, x: number, y: number, label: string, action: () => void,
  options: { width?: number; height?: number; enabled?: boolean; selected?: boolean; subtle?: boolean; compact?: boolean } = {}): EstateControl {
  const { width = 240, height = 42, enabled = true, selected = false, subtle = false, compact = false } = options;
  const object = scene.add.container(x, y).setSize(width, height);
  const plate = scene.add.graphics();
  const text = scene.add.text(0, 0, label, { fontFamily: 'Georgia, serif', fontSize: `${compact ? 12 : 18}px`, color: enabled ? ESTATE_COLORS.cream : '#a8a58e' }).setOrigin(0.5);
  if (text.width > width - 22) text.setScale((width - 22) / text.width);
  object.add([plate, text]);
  let hovered = false, focused = false;
  const draw = (): void => {
    const lit = hovered || focused;
    plate.clear().fillStyle(0x080e09, 0.35).fillRoundedRect(-width / 2 + 2, -height / 2 + 3, width, height, 3);
    plate.fillStyle(!enabled ? 0x343b30 : selected ? 0x675130 : lit ? 0x3d5037 : ESTATE_COLORS.ink, subtle && !lit ? 0.7 : 0.98)
      .fillRoundedRect(-width / 2, -height / 2, width, height, 3)
      .lineStyle(lit ? 2 : 1, !enabled ? 0x686b56 : lit ? 0xffdda0 : ESTATE_COLORS.gold, enabled ? 1 : 0.5)
      .strokeRoundedRect(-width / 2, -height / 2, width, height, 3);
    if (selected || lit) plate.fillStyle(ESTATE_COLORS.gold).fillTriangle(-width / 2 + 7, 0, -width / 2 + 11, -4, -width / 2 + 11, 4);
  };
  const focus = (value: boolean): void => { focused = value; draw(); };
  const activate = (): void => { if (enabled && object.active) action(); };
  if (enabled) {
    object.setInteractive({ useHandCursor: true }).on('pointerover', () => { hovered = true; draw(); })
      .on('pointerout', () => { hovered = false; draw(); }).on('pointerdown', activate);
    registerFocusable(scene, { object, activate, onFocus: focus });
  }
  draw();
  return { object, focus, activate };
}

export function estatePanel(scene: Phaser.Scene, x: number, y: number, width: number, height: number, paper = false): void {
  const g = scene.add.graphics();
  g.fillStyle(0x090c08, 0.35).fillRoundedRect(x + 5, y + 6, width, height, 4)
    .fillStyle(paper ? ESTATE_COLORS.paper : ESTATE_COLORS.ink, paper ? 1 : 0.96).fillRoundedRect(x, y, width, height, 4)
    .lineStyle(1, ESTATE_COLORS.gold, 0.85).strokeRoundedRect(x, y, width, height, 4)
    .lineStyle(1, paper ? 0x99815c : 0x667157, 0.55).strokeRect(x + 6, y + 6, width - 12, height - 12);
  for (const [cx, cy] of [[x + 13, y + 13], [x + width - 13, y + 13], [x + 13, y + height - 13], [x + width - 13, y + height - 13]]) g.fillStyle(ESTATE_COLORS.gold).fillCircle(cx!, cy!, 2);
}
