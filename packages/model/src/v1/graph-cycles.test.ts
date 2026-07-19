import { describe, expect, it } from 'vitest';

import { findGraphCycleEdges, graphEdgeKey } from './graph-cycles';

describe('bounded graph cycle analysis', () => {
  it('handles a 100,000-node flat reference chain in one whole-graph traversal', () => {
    const nodes = Array.from({ length: 100_000 }, (_, index) => String(index));
    const cycleEdges = findGraphCycleEdges(nodes, (node) => {
      const next = Number(node) + 1;

      return next < nodes.length ? [String(next)] : [];
    });

    expect(cycleEdges.size).toBe(0);
  });

  it('identifies the closing edge of a dependency cycle', () => {
    const successors = new Map<string, readonly string[]>([
      ['a', ['b']],
      ['b', ['c']],
      ['c', ['a']],
    ]);

    const nodes: readonly string[] = ['a', 'b', 'c'];

    expect(findGraphCycleEdges(nodes, (node) => successors.get(node) ?? [])).toContain(
      graphEdgeKey('c', 'a'),
    );
  });
});
