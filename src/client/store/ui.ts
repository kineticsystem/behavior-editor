// View state that is not part of any file: collapsed rows, the clipboard, toasts.

import type { Slice, Toast, UiSlice } from './types';

let toastId = 0;

/** How long a toast stays, in milliseconds. */
const TOAST_DURATION: Record<Toast['kind'], number> = { info: 2500, error: 6000 };

export const uiSlice: Slice<UiSlice> = (set, get) => ({
  collapsed: {},
  openSubtrees: {},
  toasts: [],

  setCollapsed(uids, collapsed) {
    const next = { ...get().collapsed };
    for (const uid of uids) {
      if (collapsed) next[uid] = true;
      else delete next[uid];
    }
    set({ collapsed: next });
  },

  toggleSubtree(key) {
    const next = { ...get().openSubtrees };
    if (next[key]) delete next[key];
    else next[key] = true;
    set({ openSubtrees: next });
  },

  setClipboard(node) {
    set({ clipboard: node ? structuredClone(node) : undefined });
  },

  toast(message, kind = 'info') {
    const id = ++toastId;
    set({ toasts: [...get().toasts, { id, kind, message }] });
    setTimeout(() => set({ toasts: get().toasts.filter((t) => t.id !== id) }), TOAST_DURATION[kind]);
  },

  resetUi() {
    set({ collapsed: {}, openSubtrees: {} });
  },
});
