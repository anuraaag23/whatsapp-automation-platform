'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  Handle,
  Position,
  type Node,
  type Edge,
  type Connection,
  type NodeChange,
  type EdgeChange,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Zap,
  GitBranch,
  Clock,
  Send,
  Sparkles,
  Webhook as WebhookIcon,
  Flag,
  Split,
  Plus,
  Save,
  Play,
  Pause,
  Trash2,
  History,
  Undo2,
  Redo2,
  CheckCircle2,
  XCircle,
  Loader2,
  Tag as TagIcon,
  UsersRound,
  UserPen,
} from 'lucide-react';
import { GlassCard, GlassButton, GlassDialog, GlassSelect } from '@/components/glass';
import {
  useAutomations,
  useAutomation,
  useCreateAutomation,
  useUpdateAutomationGraph,
  useActivateAutomation,
  usePauseAutomation,
  useDeleteAutomation,
  useRunAutomation,
  useAutomationRuns,
  AutomationNodeType,
} from '@/hooks/api/automations';
import { useContacts } from '@/hooks/api/contacts';
import { useTags } from '@/hooks/api/contacts';
import { useGroups } from '@/hooks/api/groups';
import { useTemplates } from '@/hooks/api/templates';

const NODE_STYLES: Record<AutomationNodeType, { icon: React.ReactNode; color: string; label: string }> = {
  trigger: { icon: <Zap size={14} />, color: 'border-electric bg-electric/10 text-electric', label: 'Trigger' },
  condition: { icon: <GitBranch size={14} />, color: 'border-amber bg-amber/10 text-amber', label: 'Condition' },
  branch: { icon: <Split size={14} />, color: 'border-amber bg-amber/10 text-amber', label: 'Branch' },
  delay: { icon: <Clock size={14} />, color: 'border-deep-navy/30 bg-black/5 text-deep-navy/70 dark:text-white/70', label: 'Delay' },
  wait: { icon: <Clock size={14} />, color: 'border-deep-navy/30 bg-black/5 text-deep-navy/70 dark:text-white/70', label: 'Wait' },
  send_message: { icon: <Send size={14} />, color: 'border-emerald bg-emerald/10 text-emerald', label: 'Send Message' },
  ai: { icon: <Sparkles size={14} />, color: 'border-purple-400 bg-purple-400/10 text-purple-500', label: 'AI' },
  webhook: { icon: <WebhookIcon size={14} />, color: 'border-deep-navy/30 bg-black/5 text-deep-navy/70 dark:text-white/70', label: 'Webhook' },
  add_tag: { icon: <TagIcon size={14} />, color: 'border-pink-400 bg-pink-400/10 text-pink-500', label: 'Add Tag' },
  add_to_group: { icon: <UsersRound size={14} />, color: 'border-teal-400 bg-teal-400/10 text-teal-500', label: 'Add to Group' },
  update_contact: { icon: <UserPen size={14} />, color: 'border-indigo-400 bg-indigo-400/10 text-indigo-500', label: 'Update Field' },
  finish: { icon: <Flag size={14} />, color: 'border-danger bg-danger/10 text-danger', label: 'Finish' },
};

function FlowNode({ data, type, selected }: NodeProps) {
  const style = NODE_STYLES[type as AutomationNodeType];
  const hasBranches = type === 'condition' || type === 'branch';

  return (
    <div
      className={`min-w-[160px] rounded-xl border-2 px-3 py-2.5 text-xs font-medium shadow-md backdrop-blur-md ${style.color} ${
        selected ? 'ring-2 ring-electric' : ''
      } bg-white/80 dark:bg-deep-navy/80`}
    >
      {type !== 'trigger' && <Handle type="target" position={Position.Top} />}
      <div className="flex items-center gap-1.5">
        {style.icon}
        {style.label}
      </div>
      <div className="mt-1 truncate text-[11px] font-normal text-deep-navy/60 dark:text-white/50">
        {(data.label as string) || summarizeNodeData(type as AutomationNodeType, data)}
      </div>
      {type !== 'finish' && !hasBranches && <Handle type="source" position={Position.Bottom} />}
      {hasBranches && (
        <>
          <Handle type="source" position={Position.Bottom} id="true" style={{ left: '30%' }} />
          <Handle type="source" position={Position.Bottom} id="false" style={{ left: '70%' }} />
        </>
      )}
    </div>
  );
}

function summarizeNodeData(type: AutomationNodeType, data: Record<string, unknown>): string {
  switch (type) {
    case 'trigger':
      return (data.keyword as string) ? `keyword: "${data.keyword}"` : 'configure trigger →';
    case 'condition':
    case 'branch':
      return data.field ? `${data.field} ${data.operator} "${data.value}"` : 'configure rule →';
    case 'send_message':
      return (data.body as string) || 'configure message →';
    case 'delay':
    case 'wait':
      return data.minutes ? `${data.minutes} min` : 'configure delay →';
    case 'ai':
      return (data.prompt as string) || 'configure prompt →';
    case 'webhook':
      return (data.url as string) || 'configure URL →';
    case 'add_tag':
      return (data.tagName as string) || 'select a tag →';
    case 'add_to_group':
      return (data.groupName as string) || 'select a group →';
    case 'update_contact':
      return data.field ? `set ${data.field}` : 'configure field →';
    default:
      return '';
  }
}

const nodeTypes = {
  trigger: FlowNode,
  condition: FlowNode,
  branch: FlowNode,
  delay: FlowNode,
  wait: FlowNode,
  send_message: FlowNode,
  ai: FlowNode,
  webhook: FlowNode,
  add_tag: FlowNode,
  add_to_group: FlowNode,
  update_contact: FlowNode,
  finish: FlowNode,
};

let idCounter = 1;
const nextId = () => `node_${idCounter++}`;

function CanvasEditor({
  automationId,
  onCreated,
}: {
  automationId: string | null;
  onCreated: (id: string) => void;
}) {
  const { data: automation } = useAutomation(automationId);
  const updateGraph = useUpdateAutomationGraph();
  const createAutomation = useCreateAutomation();
  const runAutomation = useRunAutomation();
  const { data: contactsPage } = useContacts('');
  const { data: availableTags } = useTags();
  const { data: availableGroups } = useGroups();
  const { data: availableTemplates } = useTemplates();

  const [name, setName] = useState('New Automation');
  const [nodes, setNodes] = useState<Node[]>([
    { id: 'trigger_1', type: 'trigger', position: { x: 250, y: 0 }, data: { keyword: 'hello' } },
  ]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [runContactId, setRunContactId] = useState('');

  // --- Undo/redo history ------------------------------------------------
  // Keeps refs mirroring the latest nodes/edges so handlers always commit
  // the state as it was *right before* the change they're about to apply,
  // even inside stale closures. `historyTick` exists purely to force a
  // re-render so the Undo/Redo buttons' disabled state stays accurate —
  // the actual stacks live in refs so pushing to them doesn't re-render.
  type GraphSnapshot = { nodes: Node[]; edges: Edge[] };
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const undoStackRef = useRef<GraphSnapshot[]>([]);
  const redoStackRef = useRef<GraphSnapshot[]>([]);
  const draggingRef = useRef(false);
  const editSessionActiveRef = useRef(false);
  const editDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [historyTick, setHistoryTick] = useState(0);

  useEffect(() => {
    nodesRef.current = nodes;
    edgesRef.current = edges;
  }, [nodes, edges]);

  const commitHistory = useCallback(() => {
    undoStackRef.current.push({ nodes: nodesRef.current, edges: edgesRef.current });
    if (undoStackRef.current.length > 50) undoStackRef.current.shift();
    redoStackRef.current = [];
    setHistoryTick((t) => t + 1);
  }, []);

  const undo = useCallback(() => {
    const prev = undoStackRef.current.pop();
    if (!prev) return;
    redoStackRef.current.push({ nodes: nodesRef.current, edges: edgesRef.current });
    setNodes(prev.nodes);
    setEdges(prev.edges);
    setSelectedNodeId(null);
    setHistoryTick((t) => t + 1);
  }, []);

  const redo = useCallback(() => {
    const next = redoStackRef.current.pop();
    if (!next) return;
    undoStackRef.current.push({ nodes: nodesRef.current, edges: edgesRef.current });
    setNodes(next.nodes);
    setEdges(next.edges);
    setSelectedNodeId(null);
    setHistoryTick((t) => t + 1);
  }, []);

  // Ctrl/Cmd+Z to undo, Ctrl/Cmd+Shift+Z (or Ctrl+Y) to redo. Ignored while
  // focus is in a text input/textarea so native text-field undo still works
  // as expected while editing a node's label or message body.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const isTyping = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;
      if (isTyping) return;
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.key.toLowerCase() !== 'z') return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo]);
  // ------------------------------------------------------------------------

  // Load an existing automation's graph into the canvas when selected.
  useMemo(() => {
    if (automation) {
      setName(automation.name);
      setNodes(automation.graph.nodes.map((n) => ({ id: n.id, type: n.type, position: n.position, data: n.data })));
      setEdges(
        automation.graph.edges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: e.sourceHandle ?? undefined,
        })),
      );
      undoStackRef.current = [];
      redoStackRef.current = [];
      setHistoryTick((t) => t + 1);
    }
  }, [automation]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const dragStarting = changes.some((c) => c.type === 'position' && c.dragging === true) && !draggingRef.current;
      const dragEnding = changes.some((c) => c.type === 'position' && c.dragging === false);
      const removing = changes.some((c) => c.type === 'remove');
      if (dragStarting || removing) commitHistory();
      if (changes.some((c) => c.type === 'position')) draggingRef.current = !dragEnding;
      setNodes((nds) => applyNodeChanges(changes, nds));
    },
    [commitHistory],
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      if (changes.some((c) => c.type === 'remove')) commitHistory();
      setEdges((eds) => applyEdgeChanges(changes, eds));
    },
    [commitHistory],
  );
  const onConnect = useCallback(
    (connection: Connection) => {
      commitHistory();
      setEdges((eds) => addEdge(connection, eds));
    },
    [commitHistory],
  );

  function addNode(type: AutomationNodeType) {
    commitHistory();
    const id = nextId();
    setNodes((nds) => [
      ...nds,
      { id, type, position: { x: 100 + Math.random() * 300, y: 150 + nds.length * 90 }, data: {} },
    ]);
  }

  function updateSelectedNodeData(patch: Record<string, unknown>) {
    // Rapid keystrokes (typing a message body, etc.) get batched into one
    // history entry instead of one per character — commit only once at the
    // start of an "edit session," then a debounce closes the session after
    // a short pause in typing.
    if (!editSessionActiveRef.current) {
      commitHistory();
      editSessionActiveRef.current = true;
    }
    if (editDebounceRef.current) clearTimeout(editDebounceRef.current);
    editDebounceRef.current = setTimeout(() => {
      editSessionActiveRef.current = false;
    }, 800);

    setNodes((nds) =>
      nds.map((n) => (n.id === selectedNodeId ? { ...n, data: { ...n.data, ...patch } } : n)),
    );
  }

  function deleteSelectedNode() {
    commitHistory();
    setNodes((nds) => nds.filter((n) => n.id !== selectedNodeId));
    setEdges((eds) => eds.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId));
    setSelectedNodeId(null);
  }

  async function handleSave() {
    const graph = {
      nodes: nodes.map((n) => ({ id: n.id, type: n.type as AutomationNodeType, position: n.position, data: n.data })),
      edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle })),
    };

    if (automationId) {
      await updateGraph.mutateAsync({ id: automationId, graph });
    } else {
      const created = await createAutomation.mutateAsync({ name, triggerType: 'KEYWORD_RECEIVED', graph });
      // Without this, the editor has no way to know the automation it was
      // "creating" now exists — automationId here would stay null forever,
      // so a second Save would silently create ANOTHER duplicate instead
      // of updating the one just created, and the new automation would
      // never actually get selected/opened in the UI.
      onCreated(created.id);
    }
  }

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  return (
    <div className="flex h-[calc(100vh-160px)] gap-4">
      {/* Node palette */}
      <GlassCard padded className="flex w-44 flex-col gap-1.5 overflow-y-auto" animate={false}>
        <p className="mb-1 text-xs font-semibold text-deep-navy/60 dark:text-white/50">Add node</p>
        {(Object.keys(NODE_STYLES) as AutomationNodeType[])
          .filter((t) => t !== 'trigger')
          .map((type) => (
            <button
              key={type}
              onClick={() => addNode(type)}
              className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs font-medium ${NODE_STYLES[type].color}`}
            >
              {NODE_STYLES[type].icon}
              {NODE_STYLES[type].label}
              <Plus size={12} className="ml-auto" />
            </button>
          ))}
      </GlassCard>

      {/* Canvas */}
      <div className="relative flex-1 overflow-hidden rounded-3xl border border-white/30 bg-white/30 dark:border-white/10 dark:bg-white/5">
        <div className="absolute left-4 top-4 z-10 flex items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-lg border border-white/40 bg-white/70 px-3 py-1.5 text-sm font-medium outline-none dark:border-white/10 dark:bg-deep-navy/70 dark:text-white"
          />
          <GlassButton size="sm" icon={<Save size={14} />} loading={updateGraph.isPending || createAutomation.isPending} onClick={handleSave}>
            Save
          </GlassButton>
          <GlassButton
            size="sm"
            variant="secondary"
            icon={<Undo2 size={14} />}
            disabled={undoStackRef.current.length === 0}
            onClick={undo}
            title="Undo (Ctrl+Z)"
          >
            <span className="sr-only">Undo</span>
          </GlassButton>
          <GlassButton
            size="sm"
            variant="secondary"
            icon={<Redo2 size={14} />}
            disabled={redoStackRef.current.length === 0}
            onClick={redo}
            title="Redo (Ctrl+Shift+Z)"
          >
            <span className="sr-only">Redo</span>
          </GlassButton>
          {automationId && (
            <GlassButton size="sm" variant="secondary" icon={<Play size={14} />} onClick={() => setRunDialogOpen(true)}>
              Test run
            </GlassButton>
          )}
        </div>

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_e, node) => setSelectedNodeId(node.id)}
          onPaneClick={() => setSelectedNodeId(null)}
          nodeTypes={nodeTypes}
          fitView
        >
          <Background gap={20} />
          <Controls />
          <MiniMap pannable zoomable className="!bg-white/70 dark:!bg-deep-navy/70" />
        </ReactFlow>
      </div>

      {/* Node property panel */}
      <GlassCard padded className="w-72 overflow-y-auto" animate={false}>
        {!selectedNode ? (
          <p className="text-xs text-deep-navy/50 dark:text-white/40">
            Select a node to edit its configuration, or drag from the palette to add one.
          </p>
        ) : (
          <NodePropertyEditor
            node={selectedNode}
            onChange={updateSelectedNodeData}
            onDelete={deleteSelectedNode}
            availableTags={availableTags ?? []}
            availableGroups={availableGroups ?? []}
            availableTemplates={availableTemplates ?? []}
          />
        )}
      </GlassCard>

      <GlassDialog open={runDialogOpen} onClose={() => setRunDialogOpen(false)} title="Test Run">
        <div className="flex flex-col gap-3">
          <GlassSelect
            value={runContactId}
            onChange={setRunContactId}
            placeholder="Select a contact…"
            options={(contactsPage?.items ?? []).map((c) => ({
              value: c.id,
              label: `${c.firstName} ${c.lastName} (${c.phoneNumber})`,
            }))}
          />
          <GlassButton
            disabled={!runContactId}
            loading={runAutomation.isPending}
            onClick={async () => {
              if (automationId) {
                await runAutomation.mutateAsync({ id: automationId, contactId: runContactId });
                setRunDialogOpen(false);
              }
            }}
          >
            Run now
          </GlassButton>
        </div>
      </GlassDialog>
    </div>
  );
}

function NodePropertyEditor({
  node,
  onChange,
  onDelete,
  availableTags,
  availableGroups,
  availableTemplates,
}: {
  node: Node;
  onChange: (patch: Record<string, unknown>) => void;
  onDelete: () => void;
  availableTags: { id: string; name: string }[];
  availableGroups: { id: string; name: string }[];
  availableTemplates: { id: string; name: string; waStatus?: string }[];
}) {
  const type = node.type as AutomationNodeType;
  const data = node.data as Record<string, unknown>;
  const inputClass =
    'w-full rounded-lg border border-white/40 bg-white/50 px-2.5 py-2 text-xs outline-none dark:border-white/10 dark:bg-white/10';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-deep-navy dark:text-white">{NODE_STYLES[type].label}</p>
        <button onClick={onDelete} className="text-deep-navy/30 hover:text-danger dark:text-white/30">
          <Trash2 size={14} />
        </button>
      </div>

      {type === 'trigger' && (
        <label className="flex flex-col gap-1 text-xs">
          Keyword to match (inbound message contains)
          <input value={(data.keyword as string) ?? ''} onChange={(e) => onChange({ keyword: e.target.value })} className={inputClass} />
        </label>
      )}

      {(type === 'condition' || type === 'branch') && (
        <>
          <label className="flex flex-col gap-1 text-xs">
            Field
            <input value={(data.field as string) ?? ''} onChange={(e) => onChange({ field: e.target.value })} placeholder="e.g. city, last_message" className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            Operator
            <GlassSelect
              value={(data.operator as string) ?? 'equals'}
              onChange={(value) => onChange({ operator: value })}
              options={[
                { value: 'equals', label: 'equals' },
                { value: 'contains', label: 'contains' },
                { value: 'not_equals', label: 'not equals' },
              ]}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            Value
            <input value={(data.value as string) ?? ''} onChange={(e) => onChange({ value: e.target.value })} className={inputClass} />
          </label>
        </>
      )}

      {type === 'send_message' && (
        <>
          <label className="flex flex-col gap-1 text-xs">
            Message type
            <GlassSelect
              value={(data.templateId as string) ? 'template' : 'text'}
              onChange={(value) => onChange(value === 'template' ? { body: undefined } : { templateId: undefined })}
              options={[
                { value: 'text', label: 'Free text' },
                { value: 'template', label: 'Approved template' },
              ]}
            />
          </label>
          {data.templateId ? (
            <label className="flex flex-col gap-1 text-xs">
              Template
              {/* Outside WhatsApp's 24-hour customer-service window, only
                  Meta-approved templates can be sent — free text silently
                  fails. This is why "Send Template" matters as its own
                  mode rather than always sending plain body text. */}
              <GlassSelect
                value={(data.templateId as string) ?? ''}
                onChange={(value) => {
                  const tpl = availableTemplates.find((t) => t.id === value);
                  onChange({ templateId: value, templateName: tpl?.name });
                }}
                placeholder="Select an approved template…"
                options={availableTemplates
                  .filter((t) => t.waStatus === 'APPROVED' || !t.waStatus)
                  .map((t) => ({ value: t.id, label: t.name }))}
              />
            </label>
          ) : (
            <label className="flex flex-col gap-1 text-xs">
              Message body ({'{{first_name}}'} etc. supported)
              <textarea rows={4} value={(data.body as string) ?? ''} onChange={(e) => onChange({ body: e.target.value })} className={inputClass} />
            </label>
          )}
        </>
      )}

      {(type === 'delay' || type === 'wait') && (
        <label className="flex flex-col gap-1 text-xs">
          Minutes to wait
          <input type="number" min={1} value={(data.minutes as number) ?? 5} onChange={(e) => onChange({ minutes: Number(e.target.value) })} className={inputClass} />
        </label>
      )}

      {type === 'ai' && (
        <>
          <label className="flex flex-col gap-1 text-xs">
            Prompt
            <textarea rows={3} value={(data.prompt as string) ?? ''} onChange={(e) => onChange({ prompt: e.target.value })} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            Store result as variable
            <input value={(data.outputVar as string) ?? ''} onChange={(e) => onChange({ outputVar: e.target.value })} placeholder="ai_output" className={inputClass} />
          </label>
        </>
      )}

      {type === 'webhook' && (
        <label className="flex flex-col gap-1 text-xs">
          Webhook URL
          <input value={(data.url as string) ?? ''} onChange={(e) => onChange({ url: e.target.value })} className={inputClass} />
        </label>
      )}

      {type === 'add_tag' && (
        <label className="flex flex-col gap-1 text-xs">
          Tag to add to this contact
          <GlassSelect
            value={(data.tagId as string) ?? ''}
            onChange={(value) => {
              const tag = availableTags.find((t) => t.id === value);
              onChange({ tagId: value, tagName: tag?.name });
            }}
            placeholder="Select a tag…"
            options={availableTags.map((t) => ({ value: t.id, label: t.name }))}
          />
          <span className="text-[10px] text-deep-navy/40 dark:text-white/30">
            Create new tags from the Contacts page — they&apos;ll show up here.
          </span>
        </label>
      )}

      {type === 'add_to_group' && (
        <label className="flex flex-col gap-1 text-xs">
          Group to add this contact to
          <GlassSelect
            value={(data.groupId as string) ?? ''}
            onChange={(value) => {
              const group = availableGroups.find((g) => g.id === value);
              onChange({ groupId: value, groupName: group?.name });
            }}
            placeholder="Select a group…"
            options={availableGroups.map((g) => ({ value: g.id, label: g.name }))}
          />
        </label>
      )}

      {type === 'update_contact' && (
        <>
          <label className="flex flex-col gap-1 text-xs">
            Field to update
            <GlassSelect
              value={(data.field as string) ?? ''}
              onChange={(value) => onChange({ field: value })}
              placeholder="Select a field…"
              options={[
                { value: 'firstName', label: 'First name' },
                { value: 'lastName', label: 'Last name' },
                { value: 'email', label: 'Email' },
                { value: 'company', label: 'Company' },
                { value: 'city', label: 'City' },
                { value: 'notes', label: 'Notes' },
              ]}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            New value ({'{{ai_output}}'} or other flow variables supported)
            <input value={(data.value as string) ?? ''} onChange={(e) => onChange({ value: e.target.value })} className={inputClass} />
          </label>
        </>
      )}

      {type === 'finish' && (
        <p className="text-xs text-deep-navy/50 dark:text-white/40">Ends this automation run.</p>
      )}
    </div>
  );
}

function RunHistoryPanel({ automationId }: { automationId: string }) {
  const { data: runs, isLoading } = useAutomationRuns(automationId);

  return (
    <GlassCard padded className="flex h-[calc(100vh-160px)] flex-col gap-3 overflow-y-auto">
      <p className="text-sm font-semibold text-deep-navy dark:text-white">Recent runs</p>
      {isLoading && <p className="text-xs text-deep-navy/40 dark:text-white/40">Loading…</p>}
      {!isLoading && runs?.length === 0 && (
        <p className="text-xs text-deep-navy/40 dark:text-white/40">
          No runs yet. Trigger this automation (keyword, new contact, or a test run) to see history here.
        </p>
      )}
      {runs?.map((run) => (
        <div key={run.id} className="rounded-xl border border-black/5 p-3 dark:border-white/10">
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-medium">
              {run.status === 'COMPLETED' && <CheckCircle2 size={13} className="text-emerald" />}
              {run.status === 'FAILED' && <XCircle size={13} className="text-danger" />}
              {run.status === 'RUNNING' && <Loader2 size={13} className="animate-spin text-amber" />}
              <span
                className={
                  run.status === 'COMPLETED'
                    ? 'text-emerald'
                    : run.status === 'FAILED'
                      ? 'text-danger'
                      : 'text-amber'
                }
              >
                {run.status}
              </span>
            </span>
            <span className="text-[10px] text-deep-navy/40 dark:text-white/30">
              {new Date(run.startedAt).toLocaleString()}
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {run.steps.map((step, i) => (
              <span
                key={`${step.nodeId}-${i}`}
                className="rounded bg-black/5 px-1.5 py-0.5 text-[10px] text-deep-navy/60 dark:bg-white/10 dark:text-white/50"
                title={step.at}
              >
                {step.nodeType}
                {step.outcome ? ` → ${step.outcome}` : ''}
              </span>
            ))}
          </div>
          {run.errorMessage && (
            <p className="mt-2 text-[11px] text-danger">{run.errorMessage}</p>
          )}
        </div>
      ))}
    </GlassCard>
  );
}

export default function AutomationPage() {
  const { data: automations } = useAutomations();
  const activate = useActivateAutomation();
  const pause = usePauseAutomation();
  const deleteAutomation = useDeleteAutomation();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [view, setView] = useState<'canvas' | 'history'>('canvas');

  return (
    <div className="flex flex-col gap-4 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-deep-navy dark:text-white">Automation</h2>
          <p className="text-sm text-deep-navy/60 dark:text-white/60">
            Drag-and-drop workflows: trigger → condition → delay → send → branch → webhook → finish.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {automations?.map((a) => (
            <button
              key={a.id}
              onClick={() => {
                setSelectedId(a.id);
                setCreating(false);
                setView('canvas');
              }}
              className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium ${
                selectedId === a.id ? 'bg-electric text-white' : 'bg-black/5 text-deep-navy/70 dark:bg-white/10 dark:text-white/70'
              }`}
            >
              {a.name}
              <span className={`h-1.5 w-1.5 rounded-full ${a.status === 'ACTIVE' ? 'bg-emerald' : 'bg-amber'}`} />
            </button>
          ))}
          <GlassButton
            size="sm"
            icon={<Plus size={14} />}
            onClick={() => {
              setSelectedId(null);
              setCreating(true);
              setView('canvas');
            }}
          >
            New
          </GlassButton>
        </div>
      </div>

      {selectedId && (
        <div className="flex gap-2">
          {automations?.find((a) => a.id === selectedId)?.status === 'ACTIVE' ? (
            <GlassButton size="sm" variant="secondary" icon={<Pause size={14} />} onClick={() => pause.mutate(selectedId)}>
              Pause
            </GlassButton>
          ) : (
            <GlassButton size="sm" icon={<Play size={14} />} onClick={() => activate.mutate(selectedId)}>
              Activate
            </GlassButton>
          )}
          <GlassButton
            size="sm"
            variant={view === 'history' ? 'primary' : 'secondary'}
            icon={<History size={14} />}
            onClick={() => setView((v) => (v === 'history' ? 'canvas' : 'history'))}
          >
            {view === 'history' ? 'Back to canvas' : 'Run history'}
          </GlassButton>
          <GlassButton
            size="sm"
            variant="ghost"
            icon={<Trash2 size={14} />}
            onClick={() => {
              deleteAutomation.mutate(selectedId);
              setSelectedId(null);
            }}
          >
            Delete
          </GlassButton>
        </div>
      )}

      {selectedId && view === 'history' && <RunHistoryPanel automationId={selectedId} />}

      {(selectedId || creating) && view === 'canvas' && (
        <ReactFlowProvider>
          <CanvasEditor
            automationId={selectedId}
            onCreated={(id) => {
              setSelectedId(id);
              setCreating(false);
            }}
          />
        </ReactFlowProvider>
      )}

      {!selectedId && !creating && (
        <GlassCard className="py-16 text-center text-sm text-deep-navy/50 dark:text-white/40">
          Select an automation above or create a new one to open the canvas.
        </GlassCard>
      )}
    </div>
  );
}
