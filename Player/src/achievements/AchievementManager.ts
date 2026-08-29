import type { AchievementDocument } from "@/bundle/spec/bundle/achievementDoc";
import { achievementMatches } from "@/bundle/spec/bundle/achievementDoc";
import type { StoryEngine } from "@/narrative/StoryEngine";
import { desktopBridge } from "@/platform/desktop";
import { PlayerStorage } from "@/platform/Storage";

const STORAGE_PREFIX = "mc:achievements:";

/**
 * Turns authored Ink-global conditions into durable Steam unlocks.
 *
 * Earning is recorded before Steam is contacted. That makes an unlock survive
 * an offline session or a temporary Steam API failure; refresh points such as
 * loading a save retry every locally earned achievement that Steam has not yet
 * acknowledged. Browser builds keep the same record and simply have no bridge
 * to send it through.
 */
export class AchievementManager {
  private readonly storageKey: string;
  private readonly earned = new Set<string>();
  private readonly synced = new Set<string>();
  private readonly syncing = new Set<string>();
  private readonly disposeObservers: Array<() => void> = [];

  constructor(
    private readonly engine: StoryEngine,
    private readonly document: AchievementDocument,
    projectId: string,
    private readonly volatile: boolean,
  ) {
    this.storageKey = `${STORAGE_PREFIX}${projectId}`;
    if (!volatile) this.readEarned();
    this.observeReferencedVariables();
    this.syncEarned();
  }

  /** Re-evaluate the restored/current state and retry pending Steam unlocks. */
  refresh(): void {
    if (this.volatile) return;
    for (const variable of new Set(this.document.achievements.map((one) => one.variable))) {
      if (variable) this.evaluate(variable, this.engine.getVariable(variable));
    }
    this.syncEarned();
  }

  destroy(): void {
    for (const dispose of this.disposeObservers) dispose();
    this.disposeObservers.length = 0;
  }

  private observeReferencedVariables(): void {
    for (const variable of new Set(this.document.achievements.map((one) => one.variable))) {
      if (!variable) continue;
      try {
        this.disposeObservers.push(
          this.engine.observeVariable(variable, (value) => this.evaluate(variable, value)),
        );
      } catch (error) {
        console.warn(`Achievement variable "${variable}" is not declared in this story.`, error);
      }
    }
  }

  private evaluate(variable: string, actual: unknown): void {
    if (this.volatile) return;
    for (const achievement of this.document.achievements) {
      if (
        achievement.variable !== variable ||
        !achievement.apiName ||
        !achievementMatches(actual, achievement.comparison, achievement.value)
      ) continue;

      if (!this.earned.has(achievement.apiName)) {
        this.earned.add(achievement.apiName);
        PlayerStorage.setItem(this.storageKey, JSON.stringify([...this.earned]));
      }
      this.sync(achievement.apiName);
    }
  }

  private readEarned(): void {
    try {
      const parsed: unknown = JSON.parse(PlayerStorage.getItem(this.storageKey) ?? "[]");
      if (!Array.isArray(parsed)) return;
      for (const value of parsed) {
        if (typeof value === "string" && /^[A-Za-z0-9_]+$/.test(value)) this.earned.add(value);
      }
    } catch {
      // A corrupt convenience record must never prevent the story from loading.
    }
  }

  private syncEarned(): void {
    for (const apiName of this.earned) this.sync(apiName);
  }

  private sync(apiName: string): void {
    const bridge = desktopBridge();
    if (!bridge || this.synced.has(apiName) || this.syncing.has(apiName)) return;
    this.syncing.add(apiName);
    void bridge.steam.unlockAchievement(apiName).then((unlocked) => {
      if (unlocked) this.synced.add(apiName);
    }).catch((error: unknown) => {
      console.warn(`Could not unlock Steam achievement ${apiName}.`, error);
    }).finally(() => this.syncing.delete(apiName));
  }
}
