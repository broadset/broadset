export function graphEdgeKey(source: string, target: string): string {
  return JSON.stringify([source, target]);
}

interface GraphFrame<Node extends string> {
  readonly node: Node;
  readonly successors: readonly Node[];
  nextIndex: number;
}

export function findGraphCycleEdges<Node extends string>(
  nodes: readonly Node[],
  successorsFor: (node: Node) => readonly Node[],
): ReadonlySet<string> {
  const colors = new Map<Node, 'active' | 'complete'>();
  const cycleEdges = new Set<string>();

  nodes.forEach((start) => {
    if (colors.has(start)) return;
    colors.set(start, 'active');

    const stack: GraphFrame<Node>[] = [{ node: start, successors: successorsFor(start), nextIndex: 0 }];

    while (stack.length > 0) {
      const frame = stack.at(-1);

      if (frame === undefined) break;

      const successor = frame.successors[frame.nextIndex];

      if (successor === undefined) {
        colors.set(frame.node, 'complete');
        stack.pop();
        continue;
      }

      frame.nextIndex += 1;

      const color = colors.get(successor);

      if (color === 'active') cycleEdges.add(graphEdgeKey(frame.node, successor));
      else if (color === undefined) {
        colors.set(successor, 'active');
        stack.push({ node: successor, successors: successorsFor(successor), nextIndex: 0 });
      }
    }
  });

  return cycleEdges;
}

export function findGraphCycleNodes<Node extends string>(
  nodes: readonly Node[],
  successorFor: (node: Node) => Node | undefined,
): ReadonlySet<Node> {
  const processed = new Set<Node>();
  const cyclic = new Set<Node>();

  nodes.forEach((start) => {
    if (processed.has(start)) return;

    const path: Node[] = [];
    const positions = new Map<Node, number>();
    let current: Node | undefined = start;

    while (current !== undefined && !processed.has(current)) {
      const cycleStart = positions.get(current);

      if (cycleStart !== undefined) {
        path.slice(cycleStart).forEach((node) => cyclic.add(node));
        break;
      }

      positions.set(current, path.length);
      path.push(current);
      current = successorFor(current);
    }

    path.forEach((node) => processed.add(node));
  });

  return cyclic;
}
