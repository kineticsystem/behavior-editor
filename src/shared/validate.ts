// Static checks of behavior files, mirroring what BehaviorTree.CPP 4 checks
// when it loads a tree, plus a few that it only reports at runtime (missing
// input ports, badly typed literals). The editor runs these on every change;
// the native validator in validator/ is the authoritative second opinion.

import { childrenRange, COMMON_ATTRIBUTES } from './builtins';
import type { BehaviorTreeDef, BTNode, Issue, NodeModel, ParsedFile, PortModel, Severity } from './types';
import { buildWorkspace, categoryOf, modelOf, subtreeRefs, type Workspace } from './workspace';
import { models as docModels, trees as docTrees } from './xml';

const NODE_STATUS = ['SUCCESS', 'FAILURE', 'RUNNING', 'IDLE', 'SKIPPED'];
const BOOLEANS = ['true', 'false', 'TRUE', 'FALSE', 'True', 'False', '1', '0'];

/** Whether a port value is a blackboard reference such as {target}. */
export function isBlackboardRef(value: string): boolean {
  return /^\{.*\}$/.test(value.trim());
}

function literalTypeError(port: PortModel, value: string): string | undefined {
  const type = (port.type ?? '').replace(/^std::/, '');
  const v = value.trim();
  if (/^(unsigned( int)?|uint\d*_t|size_t|unsigned long)$/.test(type)) {
    if (!/^\d+$/.test(v)) return `expects an unsigned integer (${port.type})`;
  } else if (/^(int|long|int\d*_t|short)$/.test(type)) {
    if (!/^[-+]?\d+$/.test(v)) return `expects an integer (${port.type})`;
  } else if (/^(double|float)$/.test(type)) {
    if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(v)) return `expects a number (${port.type})`;
  } else if (type === 'bool') {
    if (!BOOLEANS.includes(v)) return 'expects a boolean (true or false)';
  } else if (type === 'BT::NodeStatus') {
    if (!NODE_STATUS.includes(v)) return `expects one of ${NODE_STATUS.join(', ')}`;
  }
  return undefined;
}

class Checker {
  issues: Issue[] = [];
  constructor(private ws: Workspace) {}

  add(severity: Severity, file: string, message: string, extra: Partial<Issue> = {}) {
    this.issues.push({ severity, file, message, source: 'editor', ...extra });
  }

  run() {
    for (const f of this.ws.files) this.checkFile(f);
    this.checkDuplicateTrees();
    this.checkModelConflicts();
    this.checkRecursion();
    return this.issues;
  }

  checkFile(f: ParsedFile) {
    if (!f.doc) {
      this.add('error', f.path, f.error?.message ?? 'The file cannot be read', { line: f.error?.line });
      return;
    }
    const { rootAttrs } = f.doc;
    const trees = docTrees(f.doc);
    const format = rootAttrs.BTCPP_format;
    if (format === undefined) {
      if (trees.length) this.add('warning', f.path, '<root> has no BTCPP_format="4" attribute');
    } else if (format !== '4') {
      this.add('error', f.path, `BTCPP_format="${format}" is not supported: BehaviorTree.CPP 4 reads format 4 only`);
    }

    const main = rootAttrs.main_tree_to_execute;
    if (main !== undefined) {
      if (!trees.some((t) => t.id === main)) {
        const elsewhere = this.ws.trees.get(main)?.[0];
        if (elsewhere) {
          this.add('warning', f.path, `main_tree_to_execute "${main}" is defined in ${elsewhere.file}, not in this file`);
        } else {
          this.add('error', f.path, `main_tree_to_execute refers to the unknown tree "${main}"`);
        }
      }
    } else if (trees.length > 1) {
      this.add('warning', f.path,
        'The file has several trees but no main_tree_to_execute: createTreeFromFile() cannot tell which one to run');
    }

    for (const m of docModels(f.doc)) this.checkModel(f.path, m);
    for (const t of trees) this.checkTree(f.path, t);
  }

  checkModel(file: string, m: NodeModel) {
    if (!m.id) {
      this.add('error', file, `A <${m.category}> in TreeNodesModel has no ID`);
      return;
    }
    if (m.category !== 'SubTree' && this.ws.builtins.has(m.id)) {
      this.add('error', file, `The model "${m.id}" redefines a built-in node of BehaviorTree.CPP`);
    }
    const seen = new Set<string>();
    for (const p of m.ports) {
      if (!p.name) this.add('error', file, `A port of the model "${m.id}" has no name`);
      else if (seen.has(p.name)) this.add('error', file, `The model "${m.id}" declares the port "${p.name}" twice`);
      else if (p.name === 'name' || p.name === 'ID' || p.name.startsWith('_')) {
        this.add('error', file, `The model "${m.id}" uses the reserved port name "${p.name}"`);
      }
      seen.add(p.name);
    }
  }

  checkTree(file: string, tree: BehaviorTreeDef) {
    const where = { tree: tree.id, line: tree.line };
    if (!tree.id) this.add('error', file, '<BehaviorTree> has no ID', where);
    if (tree.children.length === 0) {
      this.add('error', file, `The tree "${tree.id}" is empty: it needs exactly one root node`, where);
    } else if (tree.children.length > 1) {
      this.add('error', file, `The tree "${tree.id}" has ${tree.children.length} root nodes: it needs exactly one`, where);
    }
    for (const n of tree.children) this.checkNode(file, tree, n);
  }

  checkNode(file: string, tree: BehaviorTreeDef, node: BTNode) {
    const at = { tree: tree.id, nodeUid: node.uid, line: node.line };
    const model = modelOf(this.ws, node.id);
    const category = categoryOf(this.ws, node);

    if (!model) {
      this.add('error', file,
        `Unknown node "${node.id}": it is not built into BehaviorTree.CPP nor declared in any TreeNodesModel`, at);
    } else if (node.tag !== node.id && node.tag !== 'SubTree' && node.tag !== model.category) {
      this.add('error', file, `"${node.id}" is a ${model.category}, but it is written as <${node.tag}>`, at);
    }

    if (category) {
      const [min, max] = childrenRange(category, node.id);
      const n = node.children.length;
      if (n < min || n > max) {
        let expected: string;
        if (max === 0) expected = 'no children';
        else if (min === max) expected = `exactly ${min} ${min === 1 ? 'child' : 'children'}`;
        else if (max === Infinity) expected = `at least ${min} ${min === 1 ? 'child' : 'children'}`;
        else expected = `${min} to ${max} children`;
        this.add('error', file, `${category} "${node.id}" must have ${expected}, but has ${n}`, at);
      }
    }

    if (node.id === 'SubTree') this.checkSubTree(file, node, at);
    else if (model) this.checkPorts(file, node, model, at);

    for (const [name, value] of Object.entries(node.attrs)) {
      if (name in COMMON_ATTRIBUTES && name.startsWith('_') && name !== '_description' && name !== '_uid') {
        if (!value.trim()) this.add('warning', file, `The script ${name} is empty`, at);
      }
    }

    for (const c of node.children) this.checkNode(file, tree, c);
  }

  checkPorts(file: string, node: BTNode, model: NodeModel, at: Partial<Issue>) {
    const ports = new Map(model.ports.map((p) => [p.name, p]));
    for (const [name, value] of Object.entries(node.attrs)) {
      if (name === 'name') continue;
      if (name.startsWith('_')) {
        if (!(name in COMMON_ATTRIBUTES)) this.add('warning', file, `Unknown special attribute "${name}"`, at);
        continue;
      }
      const port = ports.get(name);
      if (!port) {
        this.add('error', file, `"${node.id}" has no port "${name}"`, at);
        continue;
      }
      this.checkValue(file, node, port, value, at);
    }
    for (const p of model.ports) {
      if (p.name in node.attrs) continue;
      if (p.direction !== 'output' && p.default === undefined) {
        this.add('warning', file, `The input port "${p.name}" of "${node.id}" is not set and has no default`, at);
      }
    }
  }

  checkValue(file: string, node: BTNode, port: PortModel, value: string, at: Partial<Issue>) {
    const v = value.trim();
    if (isBlackboardRef(v)) {
      const key = v.slice(1, -1).trim();
      if (!key) this.add('error', file, `The port "${port.name}" of "${node.id}" refers to an empty blackboard key`, at);
      else if (key !== '=' && !/^@?[A-Za-z_][\w.:/-]*$/.test(key)) {
        this.add('warning', file, `The port "${port.name}" of "${node.id}" refers to the unusual blackboard key "${key}"`, at);
      }
      return;
    }
    if (port.direction !== 'input') {
      this.add('error', file,
        `The ${port.direction} port "${port.name}" of "${node.id}" must be a blackboard reference such as {${port.name}}`, at);
      return;
    }
    if (/[{}]/.test(v) && port.type !== 'std::string' && !/Script|Precondition/.test(node.id)) {
      this.add('warning', file,
        `The port "${port.name}" of "${node.id}" contains braces but is not a blackboard reference: use {key} as the whole value`, at);
    }
    if (v === '') {
      if (port.type && port.type !== 'std::string') {
        this.add('warning', file, `The port "${port.name}" of "${node.id}" is empty`, at);
      }
      return;
    }
    const typeError = literalTypeError(port, v);
    if (typeError) this.add('error', file, `The port "${port.name}" of "${node.id}" ${typeError}, not "${value}"`, at);
  }

  checkSubTree(file: string, node: BTNode, at: Partial<Issue>) {
    const target = node.attrs.ID;
    if (!target) {
      this.add('error', file, 'A SubTree has no ID: it must name the tree to instantiate', at);
      return;
    }
    if (!this.ws.trees.has(target)) {
      this.add('error', file, `The SubTree refers to the unknown tree "${target}"`, at);
    }
    const autoremap = node.attrs._autoremap;
    if (autoremap !== undefined && !BOOLEANS.includes(autoremap.trim())) {
      this.add('error', file, `_autoremap must be true or false, not "${autoremap}"`, at);
    }
    const model = this.ws.subtreeModels.get(target);
    if (!model) return;
    const ports = new Set(model.ports.map((p) => p.name));
    for (const name of Object.keys(node.attrs)) {
      if (name === 'ID' || name === 'name' || name.startsWith('_')) continue;
      if (!ports.has(name)) {
        this.add('warning', file, `The tree "${target}" does not declare the port "${name}" in its TreeNodesModel`, at);
      }
    }
  }

  checkDuplicateTrees() {
    for (const [id, refs] of this.ws.trees) {
      if (!id || refs.length < 2) continue;
      const files = refs.map((r) => r.file).join(', ');
      for (const r of refs) {
        this.add('error', r.file, `The tree ID "${id}" is defined ${refs.length} times (${files})`,
          { tree: id, line: r.tree.line });
      }
    }
  }

  checkModelConflicts() {
    for (const [id, decls] of this.ws.modelDeclarations) {
      if (decls.length < 2) continue;
      const signature = (m: NodeModel) =>
        JSON.stringify([m.category, m.ports.map((p) => [p.direction, p.name, p.type ?? '', p.default ?? ''])]);
      const first = signature(decls[0]);
      for (const d of decls.slice(1)) {
        if (signature(d) !== first) {
          this.add('warning', d.file!, `The model "${id}" is declared differently in ${decls[0].file}`);
        }
      }
    }
  }

  /** A tree that includes itself, directly or not, can never be instantiated. */
  checkRecursion() {
    const state = new Map<string, 'visiting' | 'done'>();
    const visit = (id: string, stack: string[]) => {
      const ref = this.ws.trees.get(id)?.[0];
      if (!ref || state.get(id) === 'done') return;
      state.set(id, 'visiting');
      for (const n of subtreeRefs(ref.tree.children)) {
        const target = n.attrs.ID;
        if (!target) continue;
        if (state.get(target) === 'visiting') {
          const path = [...stack, id];
          const cycle = [...path.slice(path.indexOf(target)), target].join(' → ');
          this.add('error', ref.file, `Recursive SubTree: ${cycle}`, { tree: id, nodeUid: n.uid, line: n.line });
        } else {
          visit(target, [...stack, id]);
        }
      }
      state.set(id, 'done');
    };
    for (const id of this.ws.trees.keys()) visit(id, []);
  }
}

export function validateWorkspace(ws: Workspace): Issue[] {
  return new Checker(ws).run();
}

export function validateFiles(files: ParsedFile[], builtins?: NodeModel[]): Issue[] {
  return validateWorkspace(buildWorkspace(files, builtins));
}
