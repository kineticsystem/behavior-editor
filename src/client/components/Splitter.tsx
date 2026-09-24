// Drag handles between panels, and the sizes they set, remembered by this
// browser.

import { useEffect, useRef, useState } from 'react';

/** A size in pixels kept in localStorage under `key`. */
export function useStoredSize(key: string, fallback: number): [number, (value: number) => void] {
  const [size, setSize] = useState(() => {
    try {
      const v = Number(localStorage.getItem(key));
      return v > 0 ? v : fallback;
    } catch {
      return fallback;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, String(Math.round(size)));
    } catch { /* The size is only a convenience. */ }
  }, [key, size]);
  return [size, setSize];
}

/**
 * A handle between two panels. `columns` resizes widths (a vertical bar),
 * `rows` heights (a horizontal bar). `grow` is +1 when dragging right or down
 * makes the panel bigger, -1 when it makes it smaller. The size stays between
 * `min` and `max`, and leaves at least `reserve` pixels of the parent to the
 * other panels.
 */
export function Splitter({ direction, value, onChange, grow, min, max = Infinity, reserve = 0, label }: {
  direction: 'columns' | 'rows';
  value: number;
  onChange: (value: number) => void;
  grow: 1 | -1;
  min: number;
  max?: number;
  reserve?: number;
  label: string;
}) {
  const start = useRef<{ at: number; value: number; limit: number }>(undefined);
  const horizontal = direction === 'columns';

  const limit = (el: HTMLElement) => {
    const parent = el.parentElement;
    const room = parent ? (horizontal ? parent.clientWidth : parent.clientHeight) - reserve : Infinity;
    return Math.max(min, Math.min(max, room));
  };
  const clamp = (v: number, upper: number) => Math.min(upper, Math.max(min, v));
  /**
   * The size the panel has on screen, which is less than `value` when a small
   * window squeezes it: dragging starts from there, or the first pixels of a
   * drag would change nothing visible.
   */
  const shown = (el: HTMLElement) => {
    const panel = grow > 0 ? el.previousElementSibling : el.nextElementSibling;
    if (!panel) return value;
    const box = panel.getBoundingClientRect();
    return Math.min(value, horizontal ? box.width : box.height);
  };

  return (
    <div
      className={`splitter ${direction}`}
      role="separator"
      aria-label={label}
      aria-orientation={horizontal ? 'vertical' : 'horizontal'}
      aria-valuenow={Math.round(value)}
      tabIndex={0}
      onPointerDown={(e) => {
        start.current = { at: horizontal ? e.clientX : e.clientY, value: shown(e.currentTarget), limit: limit(e.currentTarget) };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!start.current) return;
        const delta = (horizontal ? e.clientX : e.clientY) - start.current.at;
        onChange(clamp(start.current.value + grow * delta, start.current.limit));
      }}
      onPointerUp={() => { start.current = undefined; }}
      onKeyDown={(e) => {
        const keys = horizontal ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown'];
        const i = keys.indexOf(e.key);
        if (i < 0) return;
        e.preventDefault();
        const step = (i === 1 ? 1 : -1) * grow * (e.shiftKey ? 64 : 16);
        onChange(clamp(shown(e.currentTarget) + step, limit(e.currentTarget)));
      }}
    />
  );
}
