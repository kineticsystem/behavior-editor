// The cog in the header and its popover of preferences.

import { useEffect, useRef, useState } from 'react';
import { type Theme, useSettings } from '../settings';
import { Icon } from './icons';

const THEMES: { value: Theme; label: string; hint: string }[] = [
  { value: 'auto', label: 'Auto', hint: 'Follow the system setting' },
  { value: 'light', label: 'Light', hint: 'Always light' },
  { value: 'dark', label: 'Dark', hint: 'Always dark' },
];

export function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const theme = useSettings((s) => s.theme);
  const update = useSettings((s) => s.update);
  const root = useRef<HTMLDivElement>(null);

  // Close on a click outside, or on Escape.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="settings" ref={root}>
      <button className={`icon-button ${open ? 'active' : ''}`} title="Settings" aria-haspopup="dialog"
        aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name="cog" />
      </button>
      {open && (
        <div className="settings-popover" role="dialog" aria-label="Settings">
          <h2>Settings</h2>
          <div className="setting">
            <span className="setting-label">Theme</span>
            <div className="segmented" role="radiogroup" aria-label="Theme">
              {THEMES.map((t) => (
                <button key={t.value} role="radio" aria-checked={theme === t.value} title={t.hint}
                  className={theme === t.value ? 'active' : ''} onClick={() => update({ theme: t.value })}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
