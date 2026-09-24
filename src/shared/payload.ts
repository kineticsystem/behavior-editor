// The payload of an objective: the entries of the global blackboard that a tree
// reads, which a BehaviorTree.ROS2 server fills from the payload of the goal.

import type { BTNode } from './types';
import { findTree, type Workspace } from './workspace';

/** Attributes that are text, not ports or scripts. */
const TEXT_ATTRIBUTES = new Set(['ID', 'name', '_description']);

/** `{@key}` in a port, e.g. joint_names="{@joints}". */
const PORT_REFERENCE = /\{@([A-Za-z_]\w*)\}/g;
/** `@key` in a script, e.g. _skipIf="@speed > 1". */
const SCRIPT_REFERENCE = /@([A-Za-z_]\w*)/g;

function isScript(node: BTNode, attribute: string): boolean {
  return attribute.startsWith('_') || ((node.id === 'Script' || node.id === 'ScriptCondition') && attribute === 'code');
}

/**
 * The global blackboard entries that a tree reads, in the order they first
 * appear, including those of the trees its SubTrees include.
 */
export function payloadKeys(ws: Workspace, treeId: string): string[] {
  const keys = new Set<string>();
  const visited = new Set<string>();
  const visitTree = (id: string) => {
    if (visited.has(id)) return;
    visited.add(id);
    const ref = findTree(ws, id);
    if (ref) ref.tree.children.forEach(visitNode);
  };
  const visitNode = (node: BTNode) => {
    for (const [attribute, value] of Object.entries(node.attrs)) {
      if (TEXT_ATTRIBUTES.has(attribute)) continue;
      const pattern = isScript(node, attribute) ? SCRIPT_REFERENCE : PORT_REFERENCE;
      for (const match of value.matchAll(pattern)) keys.add(match[1]);
    }
    if (node.id === 'SubTree' && node.attrs.ID) visitTree(node.attrs.ID);
    node.children.forEach(visitNode);
  };
  visitTree(treeId);
  return [...keys];
}

/**
 * The payload text for the given values: a YAML map, one `key: value` line per
 * entry that has a value. Values are YAML too, e.g. `[joint1, joint2]` or `3.0`.
 */
export function payloadText(values: Record<string, string>): string {
  return Object.entries(values)
    .filter(([, value]) => value.trim() !== '')
    .map(([key, value]) => `${key}: ${value.trim()}`)
    .join('\n');
}
