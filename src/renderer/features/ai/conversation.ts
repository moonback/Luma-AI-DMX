import { create } from 'zustand';
import type { AiExecutionReport, AiProposal } from '../../../core/ai/actions';

/**
 * Conversation of the AI Director, kept outside the page so it survives a change of workspace. Each exchange carries
 * only what really happened (the proposal as validated by the main process, the execution report it returned, the
 * error it raised); its state is derived, never stored.
 */
export interface Exchange {
  id: string;
  prompt: string;
  at: number;
  proposal?: AiProposal;
  /** Indexes of the actions the operator left out of the plan. */
  excluded: number[];
  report?: AiExecutionReport;
  /** The request failed (provider down, budget…) or was cancelled while analysing. */
  error?: string;
  cancelled?: boolean;
  applying?: boolean;
  applyError?: string;
}

export type ExchangeState = 'analysing' | 'error' | 'cancelled' | 'question' | 'nothing' | 'awaiting' | 'applying' | 'success' | 'partial' | 'failed';

/** Indexes of the actions that would run if the plan were applied now. */
export const runnableIndexes = (ex: Exchange): number[] =>
  (ex.proposal?.actions ?? []).flatMap((a, i) => (a.status !== 'rejected' && !ex.excluded.includes(i) ? [i] : []));

export function exchangeState(ex: Exchange): ExchangeState {
  if (ex.report) {
    const r = ex.report;
    if (!r.executed.length) return 'failed';
    return r.skipped.length || r.verification.mismatches.length ? 'partial' : 'success';
  }
  if (ex.applyError) return 'failed';
  if (ex.applying) return 'applying';
  if (ex.cancelled) return 'cancelled';
  if (ex.error) return 'error';
  if (!ex.proposal) return 'analysing';
  if (runnableIndexes(ex).length) return 'awaiting';
  return ex.proposal.question ? 'question' : 'nothing';
}

interface ConversationState {
  exchanges: Exchange[];
  add(prompt: string): string;
  /** Ignored when the exchange is gone (conversation cleared while the request was running). */
  patch(id: string, p: Partial<Exchange>): void;
  clear(): void;
}

export const useConversation = create<ConversationState>((set) => ({
  exchanges: [],
  add: (prompt) => {
    const id = crypto.randomUUID();
    set((s) => ({ exchanges: [...s.exchanges, { id, prompt, at: Date.now(), excluded: [] }] }));
    return id;
  },
  patch: (id, p) => set((s) => (s.exchanges.some((x) => x.id === id) ? { exchanges: s.exchanges.map((x) => (x.id === id ? { ...x, ...p } : x)) } : s)),
  clear: () => set({ exchanges: [] }),
}));
