import { PlayerStorage } from "@/platform/Storage";

const PREFIX = "inkcrafter-player:adult-confirmed:";
const confirmedThisSession = new Set<string>();

/** One-time adult confirmation, scoped to the game the reader accepted. */
export const AdultConfirmation = {
  hasConfirmed(projectId: string): boolean {
    return confirmedThisSession.has(projectId) || PlayerStorage.getItem(key(projectId)) === "yes";
  },

  confirm(projectId: string): void {
    confirmedThisSession.add(projectId);
    try {
      PlayerStorage.setItem(key(projectId), "yes");
    } catch (error) {
      // Restricted browser storage must not trap an eligible reader on the
      // declaration during this launch. The in-memory record still holds.
      console.error("Could not remember adult confirmation.", error);
    }
  },
};

function key(projectId: string): string {
  return `${PREFIX}${projectId}`;
}
