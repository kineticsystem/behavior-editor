// The nodes that BehaviorTree.CPP 4.x registers in every factory. The server
// replaces this list with the one reported by the library itself when the
// native validator is built (see validator/), so this is only the fallback.

import type { NodeCategory, NodeModel, PortModel } from './types';

const input = (name: string, type?: string, def?: string, description?: string): PortModel => ({
  direction: 'input', name, type, default: def, description,
});
const output = (name: string, type?: string, description?: string): PortModel => ({
  direction: 'output', name, type, description,
});

function node(id: string, category: NodeCategory, description: string, ports: PortModel[] = []): NodeModel {
  return { id, category, description, ports, builtin: true };
}

function switchNode(cases: number): NodeModel {
  const ports = [input('variable', undefined, undefined, 'The value compared to each case')];
  for (let i = 1; i <= cases; i++) ports.push(input(`case_${i}`, 'std::string'));
  return node(`Switch${cases}`, 'Control',
    `Ticks the child whose case matches "variable", or the last (default) child. Needs ${cases + 1} children.`, ports);
}

function loopNode(suffix: string, type: string): NodeModel {
  return node(`Loop${suffix}`, 'Decorator', 'Pops values from a queue and ticks the child once per value.', [
    input('queue', `std::shared_ptr<std::deque<${type}>>`, undefined, 'The queue of values'),
    input('if_empty', 'BT::NodeStatus', 'SUCCESS', 'Status returned when the queue is empty'),
    output('value', type, 'The value popped from the queue'),
  ]);
}

export const BUILTIN_MODELS: NodeModel[] = [
  // Controls
  node('Sequence', 'Control', 'Ticks children in order until one fails. Resumes from the running child.'),
  node('SequenceWithMemory', 'Control', 'Like Sequence, but does not restart from the first child after a failure.'),
  node('ReactiveSequence', 'Control', 'Ticks all children from the first at every tick, halting running ones on failure.'),
  node('AsyncSequence', 'Control', 'Sequence that returns RUNNING between children.'),
  node('Fallback', 'Control', 'Ticks children in order until one succeeds.'),
  node('ReactiveFallback', 'Control', 'Ticks all children from the first at every tick, halting running ones on success.'),
  node('AsyncFallback', 'Control', 'Fallback that returns RUNNING between children.'),
  node('Parallel', 'Control', 'Ticks all children concurrently.', [
    input('success_count', 'int', '-1', 'Number of successes to return SUCCESS; -1 means all'),
    input('failure_count', 'int', '1', 'Number of failures to return FAILURE; -1 means all'),
  ]),
  node('ParallelAll', 'Control', 'Ticks all children concurrently until they all complete.', [
    input('max_failures', 'int', '1', 'Failures allowed before returning FAILURE; -1 means all'),
  ]),
  node('IfThenElse', 'Control', 'Ticks the second child if the first succeeds, else the third. Needs 2 or 3 children.'),
  node('WhileDoElse', 'Control', 'Reactive IfThenElse: the condition is re-evaluated at every tick. Needs 2 or 3 children.'),
  switchNode(2), switchNode(3), switchNode(4), switchNode(5), switchNode(6),
  node('TryCatch', 'Control',
    'Ticks the children but the last in order, like a Sequence. If one fails, ticks the last child (the catch) and returns FAILURE.', [
      input('catch_on_halt', 'bool', 'false', 'If true, execute the catch child when the node is halted'),
    ]),

  // Decorators
  node('Inverter', 'Decorator', 'Inverts SUCCESS and FAILURE.'),
  node('ForceSuccess', 'Decorator', 'Returns SUCCESS when the child completes.'),
  node('ForceFailure', 'Decorator', 'Returns FAILURE when the child completes.'),
  node('KeepRunningUntilFailure', 'Decorator', 'Ticks the child until it fails.'),
  node('Repeat', 'Decorator', 'Ticks the child up to num_cycles times while it succeeds.', [
    input('num_cycles', 'int', undefined, 'Repeat a successful child up to N times; -1 means forever'),
  ]),
  node('RetryUntilSuccessful', 'Decorator', 'Ticks the child up to num_attempts times while it fails.', [
    input('num_attempts', 'int', undefined, 'Execute again a failing child up to N times; -1 means forever'),
  ]),
  node('Timeout', 'Decorator', 'Halts the child and fails after msec milliseconds.', [
    input('msec', 'unsigned int', undefined, 'After a certain amount of time, halt() the child if it is still running'),
  ]),
  node('Delay', 'Decorator', 'Ticks the child after delay_msec milliseconds.', [
    input('delay_msec', 'unsigned int', undefined, 'Tick the child after a few milliseconds'),
  ]),
  node('RunOnce', 'Decorator', 'Ticks the child only once.', [
    input('then_skip', 'bool', 'true', 'If true, skip after the first execution, otherwise return the same status'),
  ]),
  node('Precondition', 'Decorator', 'Ticks the child only if the script "if" is true.', [
    input('if', 'std::string'),
    input('else', 'BT::NodeStatus', 'FAILURE', 'Status to return if the condition is false'),
  ]),
  node('SkipUnlessUpdated', 'Decorator', 'Skips the child unless the blackboard entry was updated.', [
    input('entry', 'BT::Any', undefined, 'The blackboard entry to check'),
  ]),
  node('WaitValueUpdate', 'Decorator', 'Returns RUNNING until the blackboard entry is updated.', [
    input('entry', 'BT::Any', undefined, 'The blackboard entry to check'),
  ]),
  loopNode('Int', 'int'), loopNode('Bool', 'bool'), loopNode('Double', 'double'), loopNode('String', 'std::string'),

  // Actions
  node('AlwaysSuccess', 'Action', 'Returns SUCCESS.'),
  node('AlwaysFailure', 'Action', 'Returns FAILURE.'),
  node('Script', 'Action', 'Executes a script.', [input('code', 'std::string', undefined, 'Piece of code that can be parsed')]),
  node('SetBlackboard', 'Action', 'Writes a value into the blackboard.', [
    input('value', 'std::string', undefined, 'Value to be written into the output_key'),
    input('output_key', 'std::string', undefined, 'Name of the blackboard entry where the value should be written'),
  ]),
  node('UnsetBlackboard', 'Action', 'Removes an entry from the blackboard.', [
    input('key', 'std::string', undefined, 'Key of the entry to remove'),
  ]),
  node('Sleep', 'Action', 'Returns RUNNING for msec milliseconds, then SUCCESS.', [input('msec', 'unsigned int')]),

  // Conditions
  node('ScriptCondition', 'Condition', 'Returns SUCCESS if the script evaluates to true.', [
    input('code', 'std::string', undefined, 'Code that can be parsed. Must return a boolean'),
  ]),
  node('WasEntryUpdated', 'Action', 'Returns SUCCESS if the blackboard entry was updated since the last tick.', [
    input('entry', 'BT::Any', undefined, 'The blackboard entry to check'),
  ]),

  // SubTree
  node('SubTree', 'SubTree', 'Instantiates the behavior tree with the given ID.', [
    input('_autoremap', 'bool', 'false', 'Remap every port of the subtree to the blackboard entry of the same name'),
  ]),
];

/** Attributes accepted by every node, besides its ports. */
export const COMMON_ATTRIBUTES: Record<string, string> = {
  name: 'Instance name, shown in logs',
  _skipIf: 'Skip the node if the script is true',
  _failureIf: 'Return FAILURE instead of ticking if the script is true',
  _successIf: 'Return SUCCESS instead of ticking if the script is true',
  _while: 'Halt or skip the node if the script becomes false',
  _onSuccess: 'Script executed when the node succeeds',
  _onFailure: 'Script executed when the node fails',
  _onHalted: 'Script executed when the node is halted',
  _post: 'Script executed when the node completes',
  _description: 'Free text description',
  _uid: 'Unique ID of the node, assigned by some editors',
};

export const SCRIPT_ATTRIBUTES = ['_skipIf', '_failureIf', '_successIf', '_while', '_onSuccess', '_onFailure', '_onHalted', '_post'];

/** The number of children each category accepts: [min, max]. */
export function childrenRange(category: NodeCategory, id: string): [number, number] {
  switch (category) {
    case 'Action':
    case 'Condition':
    case 'SubTree':
      return [0, 0];
    case 'Decorator':
      return [1, 1];
    case 'Control': {
      const m = /^Switch(\d)$/.exec(id);
      if (m) return [Number(m[1]) + 1, Number(m[1]) + 1];
      if (id === 'IfThenElse' || id === 'WhileDoElse') return [2, 3];
      if (id === 'TryCatch') return [2, Infinity];
      return [1, Infinity];
    }
  }
}

export function canHaveChildren(category: NodeCategory | undefined): boolean {
  return category === 'Control' || category === 'Decorator';
}

/** A demangled C++ type made readable, e.g. std::vector<std::string> instead of the full allocator spelling. */
export function prettyType(type: string): string {
  let t = type.replace(/std::__cxx11::/g, 'std::')
    .replace(/std::basic_string<char, std::char_traits<char>, std::allocator<char> ?>/g, 'std::string');
  // Drop default allocators, innermost first.
  for (let previous = ''; previous !== t;) {
    previous = t;
    t = t.replace(/, ?std::allocator<[^<>]*(<[^<>]*>)?[^<>]*>/g, '');
  }
  return t.replace(/ >/g, '>');
}
