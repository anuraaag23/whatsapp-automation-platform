'use client';

import { useState } from 'react';
import { Plus, Trash2, UsersRound, Filter, Pencil } from 'lucide-react';
import { GlassCard, GlassButton, GlassDialog, GlassSelect } from '@/components/glass';
import {
  useGroups,
  useCreateGroup,
  useRenameGroup,
  useDeleteGroup,
  useSegments,
  useCreateSegment,
  useUpdateSegment,
  useDeleteSegment,
  Segment,
} from '@/hooks/api/groups';

const inputClass =
  'w-full rounded-xl border border-white/40 bg-white/50 px-3 py-2.5 text-sm outline-none placeholder:text-deep-navy/30 dark:border-white/10 dark:bg-white/10 dark:placeholder:text-white/30';

export default function GroupsPage() {
  const { data: groups } = useGroups();
  const createGroup = useCreateGroup();
  const renameGroup = useRenameGroup();
  const deleteGroup = useDeleteGroup();

  const { data: segments } = useSegments();
  const createSegment = useCreateSegment();
  const updateSegment = useUpdateSegment();
  const deleteSegment = useDeleteSegment();

  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [groupName, setGroupName] = useState('');

  const [segmentDialogOpen, setSegmentDialogOpen] = useState(false);
  const [editingSegmentId, setEditingSegmentId] = useState<string | null>(null);
  const [segmentName, setSegmentName] = useState('');
  const [rule, setRule] = useState<Segment['rules'][number]>({ field: 'city', operator: 'equals', value: '' });

  function openCreateGroupDialog() {
    setEditingGroupId(null);
    setGroupName('');
    setGroupDialogOpen(true);
  }

  function openRenameGroupDialog(group: { id: string; name: string }) {
    setEditingGroupId(group.id);
    setGroupName(group.name);
    setGroupDialogOpen(true);
  }

  async function handleCreateGroup(e: React.FormEvent) {
    e.preventDefault();
    if (editingGroupId) {
      await renameGroup.mutateAsync({ id: editingGroupId, name: groupName });
    } else {
      await createGroup.mutateAsync(groupName);
    }
    setGroupName('');
    setEditingGroupId(null);
    setGroupDialogOpen(false);
  }

  function openCreateSegmentDialog() {
    setEditingSegmentId(null);
    setSegmentName('');
    setRule({ field: 'city', operator: 'equals', value: '' });
    setSegmentDialogOpen(true);
  }

  function openEditSegmentDialog(segment: Segment) {
    setEditingSegmentId(segment.id);
    setSegmentName(segment.name);
    setRule(segment.rules[0] ?? { field: 'city', operator: 'equals', value: '' });
    setSegmentDialogOpen(true);
  }

  async function handleCreateSegment(e: React.FormEvent) {
    e.preventDefault();
    if (editingSegmentId) {
      await updateSegment.mutateAsync({ id: editingSegmentId, name: segmentName, rules: [rule] });
    } else {
      await createSegment.mutateAsync({ name: segmentName, rules: [rule] });
    }
    setSegmentName('');
    setEditingSegmentId(null);
    setSegmentDialogOpen(false);
  }

  return (
    <div className="flex flex-col gap-8 pb-8">
      <div>
        <h2 className="text-2xl font-semibold text-deep-navy dark:text-white">Groups &amp; Segments</h2>
        <p className="text-sm text-deep-navy/60 dark:text-white/60">
          Static groups you manage manually, and dynamic segments matched live from rules.
        </p>
      </div>

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium text-deep-navy dark:text-white">Groups</h3>
          <GlassButton size="sm" icon={<Plus size={14} />} onClick={openCreateGroupDialog}>
            New Group
          </GlassButton>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {groups?.length === 0 && <GlassCard className="md:col-span-3">No groups yet.</GlassCard>}
          {groups?.map((group) => (
            <GlassCard key={group.id} variant="lite" icon={<UsersRound size={16} />} title={group.name} subtitle={`${group._count.members} member(s)`}>
              <div className="flex gap-2">
                <GlassButton
                  variant="secondary"
                  size="sm"
                  icon={<Pencil size={14} />}
                  onClick={() => openRenameGroupDialog(group)}
                >
                  Edit
                </GlassButton>
                <GlassButton variant="ghost" size="sm" icon={<Trash2 size={14} />} onClick={() => deleteGroup.mutate(group.id)}>
                  Delete
                </GlassButton>
              </div>
            </GlassCard>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium text-deep-navy dark:text-white">Segments</h3>
          <GlassButton size="sm" icon={<Plus size={14} />} onClick={openCreateSegmentDialog}>
            New Segment
          </GlassButton>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {segments?.length === 0 && <GlassCard className="md:col-span-3">No segments yet.</GlassCard>}
          {segments?.map((segment) => (
            <GlassCard
              key={segment.id}
              variant="lite"
              icon={<Filter size={16} />}
              title={segment.name}
              subtitle={segment.rules.map((r) => `${r.field} ${r.operator} "${r.value}"`).join(', ')}
            >
              <div className="flex gap-2">
                <GlassButton
                  variant="secondary"
                  size="sm"
                  icon={<Pencil size={14} />}
                  onClick={() => openEditSegmentDialog(segment)}
                >
                  Edit
                </GlassButton>
                <GlassButton
                  variant="ghost"
                  size="sm"
                  icon={<Trash2 size={14} />}
                  onClick={() => deleteSegment.mutate(segment.id)}
                >
                  Delete
                </GlassButton>
              </div>
            </GlassCard>
          ))}
        </div>
      </section>

      <GlassDialog
        open={groupDialogOpen}
        onClose={() => {
          setGroupDialogOpen(false);
          setEditingGroupId(null);
        }}
        title={editingGroupId ? 'Rename Group' : 'New Group'}
      >
        <form onSubmit={handleCreateGroup} className="flex flex-col gap-3">
          <input
            required
            placeholder="Group name"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            className={inputClass}
          />
          <GlassButton type="submit" loading={createGroup.isPending || renameGroup.isPending}>
            {editingGroupId ? 'Save' : 'Create'}
          </GlassButton>
        </form>
      </GlassDialog>

      <GlassDialog
        open={segmentDialogOpen}
        onClose={() => {
          setSegmentDialogOpen(false);
          setEditingSegmentId(null);
        }}
        title={editingSegmentId ? 'Edit Segment' : 'New Segment'}
      >
        <form onSubmit={handleCreateSegment} className="flex flex-col gap-3">
          <input
            required
            placeholder="Segment name"
            value={segmentName}
            onChange={(e) => setSegmentName(e.target.value)}
            className={inputClass}
          />
          <div className="grid grid-cols-3 gap-2">
            <GlassSelect
              value={rule.field}
              onChange={(v) => setRule({ ...rule, field: v as Segment['rules'][number]['field'] })}
              options={[
                { value: 'city', label: 'City' },
                { value: 'company', label: 'Company' },
                { value: 'optInStatus', label: 'Opt-in status' },
                { value: 'tag', label: 'Tag' },
              ]}
            />
            <GlassSelect
              value={rule.operator}
              onChange={(v) => setRule({ ...rule, operator: v as Segment['rules'][number]['operator'] })}
              options={[
                { value: 'equals', label: 'equals' },
                { value: 'contains', label: 'contains' },
              ]}
            />
            <input
              required
              placeholder="Value"
              value={rule.value}
              onChange={(e) => setRule({ ...rule, value: e.target.value })}
              className={inputClass}
            />
          </div>
          <GlassButton type="submit" loading={createSegment.isPending || updateSegment.isPending}>
            {editingSegmentId ? 'Save Changes' : 'Create'}
          </GlassButton>
        </form>
      </GlassDialog>
    </div>
  );
}
