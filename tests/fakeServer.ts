// An in-memory stand-in for the server's API, for the tests of the client:
// the same answers as src/server/api.ts, ETags and preconditions included.

import { vi } from 'vitest';
import type { ApiError as ApiErrorClass, Expected } from '../src/client/api';
import { etagOf } from '../src/server/files';

// The ApiError of the real module, given by makeFakeApi: this module must not
// import the client API, which the tests mock with it.
let ApiError: typeof ApiErrorClass;

export const disk = new Map<string, string>();
export const server = { root: '/robot/behaviors' };

function check(path: string, expected: Expected) {
  const content = disk.get(path);
  if (expected === null && content !== undefined) throw new ApiError(412, `${path} already exists`, { etag: etagOf(content) });
  if (expected !== null && expected !== '*') {
    if (content === undefined) throw new ApiError(412, `${path} was deleted`);
    if (etagOf(content) !== expected) throw new ApiError(412, `${path} was changed on disk`, { etag: etagOf(content) });
  }
}

/** Makes the fake API, throwing the given ApiError like the real one. */
export function makeFakeApi(errorClass: typeof ApiErrorClass) {
  ApiError = errorClass;
  return fakeApi;
}

export const fakeApi = {
  workspace: vi.fn(async () => ({
    root: server.root,
    files: [...disk].map(([path, content]) => ({ path, content, etag: etagOf(content) })),
    nativeValidator: false,
  })),
  save: vi.fn(async (path: string, content: string, expected: Expected) => {
    check(path, expected);
    disk.set(path, content);
    return { etag: etagOf(content) };
  }),
  remove: vi.fn(async (path: string, expected: string) => {
    check(path, expected);
    disk.delete(path);
    return { ok: true };
  }),
  openFolder: vi.fn(async (path: string) => {
    server.root = path;
    return { root: path };
  }),
  folders: vi.fn(),
  validate: vi.fn(),
};

export function resetServer(files: Record<string, string>) {
  disk.clear();
  for (const [path, content] of Object.entries(files)) disk.set(path, content);
  server.root = '/robot/behaviors';
  vi.clearAllMocks();
}
