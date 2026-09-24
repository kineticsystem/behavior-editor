// Promise-based modal dialogs: `await prompt(...)` instead of window.prompt.

import { type ReactNode, useEffect, useRef, useState } from 'react';
import { create } from 'zustand';

interface DialogState {
  content?: ReactNode;
  open(content: ReactNode): void;
  close(): void;
}

export const useDialog = create<DialogState>((set) => ({
  open: (content) => set({ content }),
  close: () => set({ content: undefined }),
}));

export function DialogHost() {
  const content = useDialog((s) => s.content);
  const close = useDialog((s) => s.close);
  if (!content) return null;
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal" role="dialog" aria-modal="true" onKeyDown={(e) => e.key === 'Escape' && close()}>
        {content}
      </div>
    </div>
  );
}

export interface Field {
  name: string;
  label: string;
  value?: string;
  placeholder?: string;
  hint?: string;
  validate?: (value: string, all: Record<string, string>) => string | undefined;
}

function PromptForm(props: {
  title: string;
  fields: Field[];
  submit: string;
  done: (values?: Record<string, string>) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(props.fields.map((f) => [f.name, f.value ?? ''])),
  );
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => {
    first.current?.focus();
    first.current?.select();
  }, []);
  const errors = props.fields.map((f) => f.validate?.(values[f.name], values));
  const valid = errors.every((e) => !e);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) props.done(values);
      }}
      onKeyDown={(e) => e.key === 'Escape' && props.done()}
    >
      <h2>{props.title}</h2>
      {props.fields.map((f, i) => (
        <label key={f.name} className="field">
          <span>{f.label}</span>
          <input
            ref={i === 0 ? first : undefined}
            value={values[f.name]}
            placeholder={f.placeholder}
            spellCheck={false}
            onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
          />
          {errors[i] ? <small className="field-error">{errors[i]}</small> : f.hint && <small>{f.hint}</small>}
        </label>
      ))}
      <div className="modal-actions">
        <button type="button" onClick={() => props.done()}>Cancel</button>
        <button type="submit" className="primary" disabled={!valid}>{props.submit}</button>
      </div>
    </form>
  );
}

export function prompt(title: string, fields: Field[], submit = 'OK'): Promise<Record<string, string> | undefined> {
  return new Promise((resolve) => {
    const done = (values?: Record<string, string>) => {
      useDialog.getState().close();
      resolve(values);
    };
    useDialog.getState().open(<PromptForm title={title} fields={fields} submit={submit} done={done} />);
  });
}

function ConfirmForm(props: { title: string; message: ReactNode; action: string; done: (ok: boolean) => void }) {
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => button.current?.focus(), []);
  return (
    <div>
      <h2>{props.title}</h2>
      <p>{props.message}</p>
      <div className="modal-actions">
        <button onClick={() => props.done(false)}>Cancel</button>
        <button ref={button} className="danger" onClick={() => props.done(true)}>{props.action}</button>
      </div>
    </div>
  );
}

export function confirm(title: string, message: ReactNode, action = 'Delete'): Promise<boolean> {
  return new Promise((resolve) => {
    const done = (ok: boolean) => {
      useDialog.getState().close();
      resolve(ok);
    };
    useDialog.getState().open(<ConfirmForm title={title} message={message} action={action} done={done} />);
  });
}

/** Opens arbitrary dialog content; the content calls the given close function. */
export function openDialog(render: (close: () => void) => ReactNode) {
  useDialog.getState().open(render(() => useDialog.getState().close()));
}

export const ID_PATTERN = /^[A-Za-z_][\w.-]*$/;
