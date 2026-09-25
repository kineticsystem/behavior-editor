// The label of a node in a tree: its category badge, its ID and its name. The
// tree editor and the execution view draw their rows with it, so that they look
// the same.

import type { BTNode, NodeCategory } from '../../shared/types';
import { CategoryBadge } from './icons';

/** Attributes that are bookkeeping, not settings: left out of the tooltip. */
const HIDDEN = new Set(['_uid', '_fullpath']);

export function NodeLabel({ node, category }: { node: BTNode; category?: NodeCategory }) {
  if (node.id === 'SubTree') {
    return (
      <>
        <CategoryBadge category="SubTree" />
        <span className="node-id">{node.attrs.ID || <i className="muted">no tree</i>}</span>
        {node.attrs.name && <span className="node-name">“{node.attrs.name}”</span>}
      </>
    );
  }
  return (
    <>
      <CategoryBadge category={category} />
      <span className="node-id">{node.id}</span>
      {node.attrs.name && node.attrs.name !== node.id && <span className="node-name">“{node.attrs.name}”</span>}
    </>
  );
}

/** The attributes of a node, one per line, for the tooltip of its row. */
export function attrsTooltip(node: BTNode): string | undefined {
  const entries = Object.entries(node.attrs).filter(([k, v]) =>
    !HIDDEN.has(k) && !(node.id === 'SubTree' && k === 'ID') && !(k === 'name' && v === node.id));
  return entries.length ? entries.map(([k, v]) => `${k} = ${v}`).join('\n') : undefined;
}
