// Runs a tree on a BehaviorTree.ROS2 server (a TreeExecutionServer), through
// rosbridge: a WebSocket that speaks JSON, so the browser needs no ROS.
//
//   → send_action_goal    the tree ID and the payload
//   ← action_feedback     the messages of the server while the tree runs
//   ← action_result       how it ended; result: false when rosbridge failed
//   → cancel_action_goal  stops it

import { errorMessage } from './api';

export const EXECUTE_TREE = 'btcpp_ros2_interfaces/action/ExecuteTree';

/** GoalStatus of action_msgs. */
const GOAL_STATUS: Record<number, string> = { 4: 'succeeded', 5: 'canceled', 6: 'aborted' };
/** NodeStatus of btcpp_ros2_interfaces: how the tree itself ended. */
const NODE_STATUS: Record<number, string> = { 0: 'IDLE', 1: 'RUNNING', 2: 'SUCCESS', 3: 'FAILURE', 4: 'SKIPPED' };

export interface RunResult {
  /** The goal succeeded and the tree returned SUCCESS. */
  ok: boolean;
  /** The goal's end: succeeded, canceled or aborted; or failed when it never ran. */
  outcome: string;
  /** The status the tree returned, e.g. SUCCESS or FAILURE. */
  treeStatus?: string;
  message: string;
}

export interface Run {
  result: Promise<RunResult>;
  cancel(): void;
}

let nextId = 0;

/** The rosbridge URL to use when none is set: port 9090 of the host that serves the editor. */
export function defaultRosbridgeUrl(): string {
  return `ws://${location.hostname || 'localhost'}:9090`;
}

export function runTree(options: {
  url: string;
  action: string;
  tree: string;
  payload: string;
  onFeedback(message: string): void;
}): Run {
  const id = `behavior-editor-${Date.now()}-${nextId++}`;
  let socket: WebSocket | undefined;
  let settle: (r: RunResult) => void = () => {};
  const result = new Promise<RunResult>((resolve) => {
    let done = false;
    settle = (r) => {
      if (done) return;
      done = true;
      resolve(r);
      socket?.close();
    };
    try {
      socket = new WebSocket(options.url);
    } catch (e) {
      settle({ ok: false, outcome: 'failed', message: `Invalid rosbridge URL ${options.url}: ${errorMessage(e)}` });
      return;
    }
    socket.onopen = () => socket!.send(JSON.stringify({
      op: 'send_action_goal', id, action: options.action, action_type: EXECUTE_TREE,
      args: { target_tree: options.tree, payload: options.payload }, feedback: true,
    }));
    socket.onerror = () => settle({
      ok: false, outcome: 'failed',
      message: `Cannot connect to rosbridge at ${options.url}. Is it running? Start the server with rosbridge:=true.`,
    });
    socket.onclose = () => settle({ ok: false, outcome: 'failed', message: 'The connection to rosbridge closed before the tree finished.' });
    socket.onmessage = (event) => {
      let msg: { op?: string; id?: string; values?: unknown; status?: number; result?: boolean };
      try {
        msg = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (msg.op === 'status' && msg.id === id) {
        // rosbridge reports a malformed request this way, e.g. an unknown action type.
        settle({ ok: false, outcome: 'failed', message: String((msg as { msg?: string }).msg ?? 'rosbridge refused the goal') });
      }
      if (msg.id !== id) return;
      if (msg.op === 'action_feedback') {
        const message = (msg.values as { message?: string } | undefined)?.message;
        if (message) options.onFeedback(message);
      } else if (msg.op === 'action_result') {
        if (!msg.result) {
          settle({ ok: false, outcome: 'failed', message: String(msg.values) });
          return;
        }
        const values = msg.values as { node_status?: { status?: number }; return_message?: string } | undefined;
        const outcome = GOAL_STATUS[msg.status ?? -1] ?? `status ${msg.status}`;
        const treeStatus = NODE_STATUS[values?.node_status?.status ?? -1];
        settle({ ok: outcome === 'succeeded' && treeStatus === 'SUCCESS', outcome, treeStatus, message: values?.return_message ?? '' });
      }
    };
  });
  return {
    result,
    cancel() {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ op: 'cancel_action_goal', id, action: options.action }));
      }
    },
  };
}
