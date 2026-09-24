import { describe, expect, it } from 'vitest';
import { payloadKeys, payloadText } from '../src/shared/payload';
import { buildWorkspace } from '../src/shared/workspace';
import { parseDocument } from '../src/shared/xml';

function workspace(xml: string) {
  return buildWorkspace([{ path: 'a.xml', ...parseDocument(`<root BTCPP_format="4">${xml}</root>`) }]);
}

describe('payloadKeys', () => {
  it('finds the global entries of ports, scripts and included trees, once each', () => {
    const ws = workspace(`
      <BehaviorTree ID="Main" _description="Mail me@example.com">
        <Sequence _skipIf="@skip == true">
          <Script code="count := @start + 1"/>
          <MoveTo goal="{@target}" speed="{local}" name="to {@not_a_port}"/>
          <SubTree ID="Inner" goal="{@target}"/>
        </Sequence>
      </BehaviorTree>
      <BehaviorTree ID="Inner">
        <Sequence>
          <MoveTo goal="{goal}" speed="{@speed}"/>
          <SubTree ID="Main"/>
        </Sequence>
      </BehaviorTree>`);
    expect(payloadKeys(ws, 'Main')).toEqual(['skip', 'start', 'target', 'speed']);
  });

  it('returns nothing for a missing tree', () => {
    expect(payloadKeys(workspace(''), 'Nope')).toEqual([]);
  });
});

describe('payloadText', () => {
  it('writes a YAML map of the entries that have a value', () => {
    expect(payloadText({ joints: ' [joint1, joint2] ', duration: '3.0', offset: '' }))
      .toBe('joints: [joint1, joint2]\nduration: 3.0');
  });
});
