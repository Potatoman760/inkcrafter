import Phaser from "phaser";

const PAD_X = 16;
const PAD_Y = 10;
const GAP = 10;

/** Turn any ordinary Ink global into compact player-facing text. */
export function variableValueText(value: unknown): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number" || typeof value === "string") return String(value);
  if (value !== null && value !== undefined) {
    const rendered = String(value);
    if (rendered !== "[object Object]") return rendered;
  }
  return "—";
}

/** Small top-left HUD panel used by the knot-scoped `# display:` tag. */
export class VariableDisplay {
  private readonly background: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;
  private readonly value: Phaser.GameObjects.Text;
  private readonly container: Phaser.GameObjects.Container;
  private hasValue = false;
  private chromeVisible = true;

  constructor(scene: Phaser.Scene) {
    this.background = scene.add.graphics();
    this.label = scene.add.text(PAD_X, PAD_Y, "", {
      fontFamily: "system-ui, sans-serif",
      fontSize: "20px",
      color: "#ffd98a",
      fontStyle: "bold",
    });
    this.value = scene.add.text(PAD_X, PAD_Y, "", {
      fontFamily: "system-ui, sans-serif",
      fontSize: "20px",
      color: "#f2f2f2",
    });
    this.container = scene.add
      .container(16, 16, [this.background, this.label, this.value])
      .setDepth(400)
      .setVisible(false);
  }

  show(label: string, value: unknown): void {
    this.hasValue = true;
    this.label.setText(`${label}:`);
    this.value.setText(variableValueText(value)).setX(PAD_X + this.label.width + GAP);

    const width = this.value.x + this.value.width + PAD_X;
    const height = Math.max(this.label.height, this.value.height) + PAD_Y * 2;
    this.background.clear();
    this.background.fillStyle(0x0a0c14, 0.82);
    this.background.fillRoundedRect(0, 0, width, height, 10);
    this.background.lineStyle(2, 0x5a6b8c, 0.8);
    this.background.strokeRoundedRect(0, 0, width, height, 10);
    this.refreshVisibility();
  }

  hide(): void {
    this.hasValue = false;
    this.refreshVisibility();
  }

  setChromeVisible(visible: boolean): void {
    this.chromeVisible = visible;
    this.refreshVisibility();
  }

  private refreshVisibility(): void {
    this.container.setVisible(this.hasValue && this.chromeVisible);
  }
}
