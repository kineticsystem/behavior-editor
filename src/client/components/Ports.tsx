// The ports of a node type, as the arrows and the read-only list shown by the
// details panel and by a file of node models.

import { prettyType } from '../../shared/builtins';
import type { PortDirection, PortModel } from '../../shared/types';

export const DIRECTION_ARROWS: Record<PortDirection, string> = { input: '→', output: '←', inout: '↔' };

const DIRECTION_NAMES: Record<PortDirection, string> = { input: 'input', output: 'output', inout: 'input/output' };

export function DirectionArrow({ direction }: { direction: PortDirection }) {
  return <span className={`dir dir-${direction}`} title={`${DIRECTION_NAMES[direction]} port`}>{DIRECTION_ARROWS[direction]}</span>;
}

export function PortType({ type }: { type?: string }) {
  return type ? <span className="port-type" title={type}>{prettyType(type)}</span> : null;
}

/** The ports of a node type: direction, name, type, default and description. */
export function PortList({ ports }: { ports: PortModel[] }) {
  if (!ports.length) return <p className="muted small">No ports.</p>;
  return (
    <dl className="port-list">
      {ports.map((p) => (
        <div key={p.name}>
          <dt>
            <DirectionArrow direction={p.direction} />
            <span className="port-name">{p.name}</span>
            <PortType type={p.type} />
            {p.default !== undefined && <span className="port-type">= {p.default === '' ? '""' : p.default}</span>}
          </dt>
          {p.description && <dd>{p.description}</dd>}
        </div>
      ))}
    </dl>
  );
}
