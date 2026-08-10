import {
  evaluateCondition,
  findTriggerNode,
  outgoingEdges,
  validateGraph,
  AutomationGraph,
  AutomationRunContext,
} from './automation-graph';

function context(variables: Record<string, string> = {}): AutomationRunContext {
  return { organizationId: 'org_1', contactId: 'contact_1', variables };
}

describe('evaluateCondition', () => {
  it('matches equals case-insensitively', () => {
    expect(
      evaluateCondition({ field: 'city', operator: 'equals', value: 'Varanasi' }, context({ city: 'varanasi' })),
    ).toBe(true);
  });

  it('matches contains', () => {
    expect(
      evaluateCondition({ field: 'text', operator: 'contains', value: 'order' }, context({ text: 'my order status?' })),
    ).toBe(true);
  });

  it('matches not_equals', () => {
    expect(
      evaluateCondition({ field: 'status', operator: 'not_equals', value: 'closed' }, context({ status: 'open' })),
    ).toBe(true);
  });

  it('returns false when the field is missing from context', () => {
    expect(evaluateCondition({ field: 'missing', operator: 'equals', value: 'x' }, context())).toBe(false);
  });
});

describe('graph helpers', () => {
  const graph: AutomationGraph = {
    nodes: [
      { id: 'n1', type: 'trigger', position: { x: 0, y: 0 }, data: {} },
      { id: 'n2', type: 'condition', position: { x: 0, y: 0 }, data: {} },
      { id: 'n3', type: 'send_message', position: { x: 0, y: 0 }, data: {} },
      { id: 'n4', type: 'finish', position: { x: 0, y: 0 }, data: {} },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3', sourceHandle: 'true' },
      { id: 'e3', source: 'n2', target: 'n4', sourceHandle: 'false' },
      { id: 'e4', source: 'n3', target: 'n4' },
    ],
  };

  it('finds the trigger node', () => {
    expect(findTriggerNode(graph)?.id).toBe('n1');
  });

  it('filters outgoing edges by handle', () => {
    expect(outgoingEdges(graph, 'n2', 'true')).toHaveLength(1);
    expect(outgoingEdges(graph, 'n2', 'true')[0].target).toBe('n3');
    expect(outgoingEdges(graph, 'n2', 'false')[0].target).toBe('n4');
  });

  it('validates a well-formed graph with no errors', () => {
    expect(validateGraph(graph)).toEqual([]);
  });

  it('flags a graph with no trigger node', () => {
    const broken: AutomationGraph = { nodes: graph.nodes.slice(1), edges: [] };
    expect(validateGraph(broken)).toContain('Graph must contain exactly one trigger node');
  });

  it('flags an edge pointing at an unknown node', () => {
    const broken: AutomationGraph = {
      nodes: graph.nodes,
      edges: [...graph.edges, { id: 'bad', source: 'n1', target: 'ghost' }],
    };
    expect(validateGraph(broken).some((e) => e.includes('ghost'))).toBe(true);
  });
});
