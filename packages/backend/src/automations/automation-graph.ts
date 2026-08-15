export type AutomationNodeType =
  | 'trigger'
  | 'condition'
  | 'delay'
  | 'send_message'
  | 'ai'
  | 'wait'
  | 'branch'
  | 'webhook'
  | 'add_tag'
  | 'add_to_group'
  | 'update_contact'
  | 'finish';

export interface AutomationNode {
  id: string;
  type: AutomationNodeType;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface AutomationEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
}

export interface AutomationGraph {
  nodes: AutomationNode[];
  edges: AutomationEdge[];
}

export interface AutomationRunContext {
  organizationId: string;
  contactId: string;
  variables: Record<string, string>;
}

/** Evaluates a `condition`/`branch` node's rule against the run context's variables. */
export function evaluateCondition(
  data: { field?: string; operator?: 'equals' | 'contains' | 'not_equals'; value?: string },
  context: AutomationRunContext,
): boolean {
  const field = data.field ?? '';
  const operator = data.operator ?? 'equals';
  const expected = data.value ?? '';
  const actual = context.variables[field] ?? '';

  switch (operator) {
    case 'contains':
      return actual.toLowerCase().includes(expected.toLowerCase());
    case 'not_equals':
      return actual.toLowerCase() !== expected.toLowerCase();
    default:
      return actual.toLowerCase() === expected.toLowerCase();
  }
}

/** Finds the single entry point of the graph. */
export function findTriggerNode(graph: AutomationGraph): AutomationNode | undefined {
  return graph.nodes.find((n) => n.type === 'trigger');
}

export function findNode(graph: AutomationGraph, id: string): AutomationNode | undefined {
  return graph.nodes.find((n) => n.id === id);
}

/** Returns the outgoing edge(s) from a node, optionally filtered to a specific handle (branch label). */
export function outgoingEdges(graph: AutomationGraph, nodeId: string, handle?: string): AutomationEdge[] {
  return graph.edges.filter((e) => e.source === nodeId && (handle === undefined || e.sourceHandle === handle));
}

/** Basic structural validation before a graph is saved. */
export function validateGraph(graph: AutomationGraph): string[] {
  const errors: string[] = [];

  const triggers = graph.nodes.filter((n) => n.type === 'trigger');
  if (triggers.length === 0) errors.push('Graph must contain exactly one trigger node');
  if (triggers.length > 1) errors.push('Graph must contain only one trigger node');

  const nodeIds = new Set(graph.nodes.map((n) => n.id));
  for (const edge of graph.edges) {
    if (!nodeIds.has(edge.source)) errors.push(`Edge ${edge.id} references unknown source ${edge.source}`);
    if (!nodeIds.has(edge.target)) errors.push(`Edge ${edge.id} references unknown target ${edge.target}`);
  }

  const finishNodes = graph.nodes.filter((n) => n.type === 'finish');
  if (finishNodes.length === 0) errors.push('Graph should contain at least one finish node');

  return errors;
}
