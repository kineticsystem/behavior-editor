// The state of the editor: one zustand store made of the slices in this
// folder. See types.ts for what each slice holds.

import { create } from 'zustand';
import { documentsSlice } from './documents';
import { navigationSlice } from './navigation';
import type { State } from './types';
import { uiSlice } from './ui';

export const useStore = create<State>()((...a) => ({
  ...documentsSlice(...a),
  ...navigationSlice(...a),
  ...uiSlice(...a),
}));

export { contentOf, defaultTree, hasDirtyFiles, isDirty, serialized, workspaceFingerprint } from './documents';
export type { FileState, HistoryEntry, Peek, SaveResult, Selection, State } from './types';
