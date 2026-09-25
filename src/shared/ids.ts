// The IDs of trees and node types, and of the attributes added by hand.

/** A valid ID: letters, digits, _ . and -, not starting with a digit. */
export const ID_PATTERN = /^[A-Za-z_][\w.-]*$/;

/** Why `id` cannot be used as a new ID, or undefined if it can. */
export function idError(id: string, existing: Iterable<string> = [], what = 'tree'): string | undefined {
  if (!ID_PATTERN.test(id)) return 'Letters, digits, _ . - only; not starting with a digit';
  for (const e of existing) if (e === id) return `A ${what} with this ID already exists`;
  return undefined;
}

/** The file name for a new tree: as typed, or derived from the tree ID, e.g. pick_object.xml. */
export function fileNameFor(typed: string, treeId: string): string {
  let name = typed.trim() || treeId.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
  if (!name.toLowerCase().endsWith('.xml')) name += '.xml';
  return name;
}

/** Why `path` cannot be the path of a new file, or undefined if it can. */
export function filePathError(path: string, existing: Iterable<string> = []): string | undefined {
  if (!/^[\w.\-/]+\.xml$/i.test(path) || path.split('/').includes('..') || path.startsWith('/')) return 'Use a relative .xml path';
  for (const e of existing) if (e === path) return 'This file already exists';
  return undefined;
}
