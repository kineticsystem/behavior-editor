// The in-memory model of BehaviorTree.CPP (v4) XML files, shared by the
// editor, the server and the command line validator.

export type NodeCategory = 'Action' | 'Condition' | 'Control' | 'Decorator' | 'SubTree';

export const CATEGORIES: NodeCategory[] = ['Control', 'Decorator', 'Action', 'Condition', 'SubTree'];

export type PortDirection = 'input' | 'output' | 'inout';

export interface PortModel {
  direction: PortDirection;
  name: string;
  type?: string;
  default?: string;
  description?: string;
  /** Attributes other than name, type and default, kept for round-tripping. */
  extra?: Record<string, string>;
}

/** The declaration of a node type, as in <TreeNodesModel>. */
export interface NodeModel {
  id: string;
  category: NodeCategory;
  ports: PortModel[];
  description?: string;
  /** True for the nodes that BehaviorTree.CPP registers itself. */
  builtin?: boolean;
  /** The file that declares the model, for custom nodes. */
  file?: string;
  /** Attributes other than ID, kept for round-tripping. */
  extra?: Record<string, string>;
  /** Child elements other than ports and description, kept verbatim. */
  extraXml?: string[];
}

/** A node instance inside a <BehaviorTree>. */
export interface BTNode {
  uid: string;
  /** The registration ID, e.g. "Sequence" or "SaySomething". */
  id: string;
  /**
   * The XML element name: the ID itself (compact form, <SaySomething/>), or a
   * category for the explicit form (<Action ID="SaySomething"/>). SubTree is
   * always written <SubTree ID="..."/>, and then the ID lives in attrs.
   */
  tag: string;
  /** Attributes in document order; excludes ID for the explicit form. */
  attrs: Record<string, string>;
  children: BTNode[];
  /** Comments that precede the node in the file. */
  comments?: string[];
  /** Comments after the last child, before the closing tag. */
  trailingComments?: string[];
  line?: number;
}

export interface BehaviorTreeDef {
  uid: string;
  id: string;
  /** Attributes of <BehaviorTree> other than ID, e.g. _description. */
  attrs: Record<string, string>;
  /** A valid tree has exactly one child. */
  children: BTNode[];
  /** Comments after the last child, before the closing tag. */
  trailingComments?: string[];
  line?: number;
}

export type DocItem =
  | { kind: 'tree'; tree: BehaviorTreeDef }
  | { kind: 'models'; models: NodeModel[] }
  | { kind: 'raw'; xml: string }
  | { kind: 'comment'; text: string };

export interface BTDocument {
  /** Attributes of <root>, e.g. BTCPP_format and main_tree_to_execute. */
  rootAttrs: Record<string, string>;
  items: DocItem[];
  /** Comments before and after <root>, e.g. a header describing the file. */
  prolog?: string[];
  epilog?: string[];
}

export interface ParseError {
  message: string;
  line?: number;
}

export interface ParsedFile {
  path: string;
  doc?: BTDocument;
  error?: ParseError;
}

export type Severity = 'error' | 'warning' | 'info';

export interface Issue {
  severity: Severity;
  message: string;
  file: string;
  tree?: string;
  /** The uid of the offending node, to select it in the editor. */
  nodeUid?: string;
  line?: number;
  /** Where the issue comes from: the built-in rules or BehaviorTree.CPP itself. */
  source?: 'editor' | 'btcpp';
}
