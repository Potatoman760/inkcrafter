import Phaser from "phaser";

export interface FocusTarget {
  object: Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Transform & Phaser.GameObjects.Components.Visible;
  activate: () => void;
  onFocus?: (focused: boolean) => void;
  /** Horizontal adjustment for sliders and similar controls. */
  adjust?: (direction: -1 | 1) => void;
  preferred?: boolean;
}

export interface ControllerActions {
  accept?: () => void;
  back?: () => void;
  menu?: () => void;
  secondary?: () => void;
  tertiary?: () => void;
  previousPage?: () => void;
  nextPage?: () => void;
}

const managers = new WeakMap<Phaser.Scene, FocusManager>();

export function registerFocusable(scene: Phaser.Scene, target: FocusTarget): () => void {
  return manager(scene).register(target);
}

export function setControllerActions(scene: Phaser.Scene, actions: ControllerActions): void {
  manager(scene).actions = actions;
}

export function focusPreferred(scene: Phaser.Scene): void {
  manager(scene).focusPreferred();
}

class FocusManager {
  actions: ControllerActions = {};
  private readonly scene: Phaser.Scene;
  private readonly targets = new Set<FocusTarget>();
  private current: FocusTarget | null = null;
  private previous = new Array<boolean>(16).fill(false);
  private axisX = 0;
  private axisY = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.update, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
  }

  register(target: FocusTarget): () => void {
    this.targets.add(target);
    const remove = (): void => {
      if (this.current === target) this.setCurrent(null);
      this.targets.delete(target);
    };
    target.object.once(Phaser.GameObjects.Events.DESTROY, remove);
    return remove;
  }

  focusPreferred(): void {
    this.setCurrent(this.available().find((target) => target.preferred) ?? null);
  }

  private update(): void {
    const pad = [...(navigator.getGamepads?.() ?? [])].find((one): one is Gamepad => one !== null);
    if (!pad) return;

    const x = axis(pad.axes[0] ?? 0, button(pad, 14), button(pad, 15));
    const y = axis(pad.axes[1] ?? 0, button(pad, 12), button(pad, 13));
    if (x !== 0 && this.axisX === 0) this.move(x, 0);
    if (y !== 0 && this.axisY === 0) this.move(0, y);
    this.axisX = x;
    this.axisY = y;

    if (pressed(pad, 0, this.previous)) {
      if (this.current && this.isAvailable(this.current)) this.current.activate();
      else this.actions.accept?.();
    }
    if (pressed(pad, 1, this.previous)) this.actions.back?.();
    if (pressed(pad, 2, this.previous)) this.actions.secondary?.();
    if (pressed(pad, 3, this.previous)) this.actions.tertiary?.();
    if (pressed(pad, 4, this.previous)) this.actions.previousPage?.();
    if (pressed(pad, 5, this.previous)) this.actions.nextPage?.();
    if (pressed(pad, 9, this.previous)) this.actions.menu?.();
    for (let index = 0; index < this.previous.length; index += 1) {
      this.previous[index] = button(pad, index);
    }
  }

  private move(dx: number, dy: number): void {
    const available = this.available();
    if (available.length === 0) return;
    if (!this.current || !this.isAvailable(this.current)) {
      this.setCurrent(available.find((target) => target.preferred) ?? available[0]!);
      return;
    }
    if (dx !== 0 && this.current.adjust) {
      this.current.adjust(dx < 0 ? -1 : 1);
      return;
    }

    const from = centre(this.current.object);
    let best: { target: FocusTarget; score: number } | null = null;
    for (const target of available) {
      if (target === this.current) continue;
      const to = centre(target.object);
      const x = to.x - from.x;
      const y = to.y - from.y;
      if ((dx < 0 && x >= -1) || (dx > 0 && x <= 1) || (dy < 0 && y >= -1) || (dy > 0 && y <= 1)) continue;
      const primary = Math.abs(dx !== 0 ? x : y);
      const cross = Math.abs(dx !== 0 ? y : x);
      const score = primary + cross * 2.5;
      if (!best || score < best.score) best = { target, score };
    }
    if (best) this.setCurrent(best.target);
  }

  private available(): FocusTarget[] {
    return [...this.targets].filter((target) => this.isAvailable(target));
  }

  private isAvailable(target: FocusTarget): boolean {
    return target.object.active && target.object.visible && target.object.scene === this.scene;
  }

  private setCurrent(target: FocusTarget | null): void {
    if (this.current === target) return;
    this.current?.onFocus?.(false);
    this.current = target;
    this.current?.onFocus?.(true);
  }

  private destroy(): void {
    this.setCurrent(null);
    this.targets.clear();
    managers.delete(this.scene);
  }
}

function manager(scene: Phaser.Scene): FocusManager {
  const existing = managers.get(scene);
  if (existing) return existing;
  const created = new FocusManager(scene);
  managers.set(scene, created);
  return created;
}

function centre(
  object: Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Transform & Phaser.GameObjects.Components.Visible,
): Phaser.Math.Vector2 {
  const bounded = object as typeof object & { getBounds?: () => Phaser.Geom.Rectangle };
  const bounds = bounded.getBounds?.();
  return bounds
    ? new Phaser.Math.Vector2(bounds.centerX, bounds.centerY)
    : new Phaser.Math.Vector2(object.x, object.y);
}

function button(pad: Gamepad, index: number): boolean {
  return pad.buttons[index]?.pressed ?? false;
}

function pressed(pad: Gamepad, index: number, previous: readonly boolean[]): boolean {
  return button(pad, index) && !previous[index];
}

function axis(value: number, negative: boolean, positive: boolean): number {
  if (negative || value < -0.55) return -1;
  if (positive || value > 0.55) return 1;
  return 0;
}
