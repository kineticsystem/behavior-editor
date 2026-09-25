// The tree running on the server, as it reports it: see ../execution.ts.

import { failedNodeUid, parseExecutedTree, parseFeedback } from '../execution';
import type { ExecutionSlice, Slice } from './types';

export const executionSlice: Slice<ExecutionSlice> = (set, get) => ({
  executionShown: false,

  startExecution(treeId) {
    set({ execution: { treeId, statuses: {}, messages: [], startedAt: Date.now() }, executionShown: true });
  },

  applyFeedback(message) {
    const execution = get().execution;
    if (!execution || execution.result) return;
    const feedback = parseFeedback(message);
    if (!feedback) {
      set({ execution: { ...execution, messages: [...execution.messages, message] } });
      return;
    }
    set({
      execution: {
        ...execution,
        tree: feedback.tree !== undefined ? parseExecutedTree(feedback.tree) ?? execution.tree : execution.tree,
        statuses: { ...execution.statuses, ...feedback.nodes },
      },
    });
  },

  endExecution(result) {
    const execution = get().execution;
    if (!execution) return;
    const crashed = result.ok ? undefined : failedNodeUid(result.message);
    set({ execution: { ...execution, result, crashed, endedAt: Date.now() } });
    if (!get().executionShown) {
      get().toast(`${execution.treeId}: ${result.ok ? 'succeeded' : result.outcome === 'canceled' ? 'stopped' : 'failed'}`,
        result.ok ? 'info' : 'error');
    }
  },

  showExecution(shown) {
    set({ executionShown: shown && !!get().execution });
  },
});
