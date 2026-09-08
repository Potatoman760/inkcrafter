import type { GameState } from '@/state/GameState';

interface PendingCompletion {
  stateVariable: string;
  result: string;
}

let pending: PendingCompletion | null = null;

/** A live first-time visit becomes a memory only at its authored return choice. */
export const EstateMemories = {
  launched(stateVariable: string, result: string): void {
    pending = { stateVariable, result };
  },

  completeAtReturn(state: GameState, choiceText: string): boolean {
    if (!pending || choiceText.trim() !== 'Return to the villa') return false;
    const completion = pending;
    pending = null;
    try {
      const raw = state.engine.getVariable(completion.stateVariable);
      const ledger = JSON.parse(String(raw)) as { completed?: unknown };
      if (!ledger || !Array.isArray(ledger.completed) || !ledger.completed.every(value => typeof value === 'string')) return false;
      ledger.completed = [...new Set([...ledger.completed, completion.result])];
      state.engine.setVariable(completion.stateVariable, JSON.stringify(ledger));
      return true;
    } catch (error) {
      console.error('Could not record the completed villa memory.', error);
      return false;
    }
  },

  cancel(): void { pending = null; },
};
