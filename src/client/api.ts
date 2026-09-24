import type { WorkspaceResponse } from '../server/api';
import type { NativeResult } from '../server/native';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `${res.status} ${res.statusText}`);
  return data as T;
}

export const api = {
  workspace: () => request<WorkspaceResponse>('/api/workspace'),
  save: (path: string, content: string) =>
    request<{ ok: true }>(`/api/file?path=${encodeURIComponent(path)}`, { method: 'PUT', body: content }),
  remove: (path: string) => request<{ ok: true }>(`/api/file?path=${encodeURIComponent(path)}`, { method: 'DELETE' }),
  validate: (files: { path: string; content: string }[]) =>
    request<NativeResult>('/api/validate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ files }),
    }),
};
