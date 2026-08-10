'use client';

import { useRef, useState } from 'react';
import { Plus, Upload, Search, Star, Trash2, Phone, Tag as TagIcon, Archive, Pencil } from 'lucide-react';
import { GlassCard, GlassButton, GlassDialog, GlassSelect } from '@/components/glass';
import {
  useContacts,
  useCreateContact,
  useUpdateContact,
  useImportContacts,
  useSetOptIn,
  useDeleteContact,
  useTags,
  useBulkAddTag,
  useBulkArchive,
  useBulkDelete,
  Contact,
} from '@/hooks/api/contacts';

const inputClass =
  'w-full rounded-xl border border-white/40 bg-white/50 px-3 py-2.5 text-sm outline-none placeholder:text-deep-navy/30 dark:border-white/10 dark:bg-white/10 dark:placeholder:text-white/30';

function OptInBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    OPTED_IN: 'bg-emerald/10 text-emerald',
    OPTED_OUT: 'bg-danger/10 text-danger',
    PENDING: 'bg-amber/10 text-amber',
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${styles[status]}`}>
      {status.replace('_', ' ').toLowerCase()}
    </span>
  );
}

export default function ContactsPage() {
  const [search, setSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [bulkTagOpen, setBulkTagOpen] = useState(false);
  const [form, setForm] = useState({ phoneNumber: '', firstName: '', lastName: '', email: '', company: '' });
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [editForm, setEditForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    company: '',
    city: '',
  });
  const [csvText, setCsvText] = useState('');
  const [importResult, setImportResult] = useState<{ created: number; updated: number; failed: number } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkTagId, setBulkTagId] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useContacts(search);
  const { data: tags } = useTags();
  const createContact = useCreateContact();
  const updateContact = useUpdateContact();
  const importContacts = useImportContacts();
  const setOptIn = useSetOptIn();
  const deleteContact = useDeleteContact();
  const bulkAddTag = useBulkAddTag();
  const bulkArchive = useBulkArchive();
  const bulkDelete = useBulkDelete();

  async function handleAddSubmit(e: React.FormEvent) {
    e.preventDefault();
    await createContact.mutateAsync(form);
    setForm({ phoneNumber: '', firstName: '', lastName: '', email: '', company: '' });
    setAddOpen(false);
  }

  function openEditDialog(contact: Contact) {
    setEditingContact(contact);
    setEditForm({
      firstName: contact.firstName ?? '',
      lastName: contact.lastName ?? '',
      email: contact.email ?? '',
      company: contact.company ?? '',
      city: contact.city ?? '',
    });
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingContact) return;
    await updateContact.mutateAsync({ id: editingContact.id, ...editForm });
    setEditingContact(null);
  }

  async function handleImportSubmit(e: React.FormEvent) {
    e.preventDefault();
    const result = await importContacts.mutateAsync(csvText);
    setImportResult(result);
  }

  function handleFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCsvText(String(reader.result ?? ''));
    reader.readAsText(file);
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (!data) return;
    setSelected((prev) =>
      prev.size === data.items.length ? new Set() : new Set(data.items.map((c) => c.id)),
    );
  }

  const selectedIds = Array.from(selected);

  return (
    <div className="flex flex-col gap-6 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-deep-navy dark:text-white">Contacts</h2>
          <p className="text-sm text-deep-navy/60 dark:text-white/60">
            {data ? `${data.total} contact${data.total === 1 ? '' : 's'}` : 'Loading…'}
          </p>
        </div>
        <div className="flex gap-2">
          <GlassButton variant="secondary" icon={<Upload size={16} />} onClick={() => setImportOpen(true)}>
            Import CSV
          </GlassButton>
          <GlassButton icon={<Plus size={16} />} onClick={() => setAddOpen(true)}>
            Add Contact
          </GlassButton>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 rounded-xl bg-black/5 px-3 py-2.5 dark:bg-white/10 sm:max-w-sm sm:flex-1">
          <Search size={16} className="text-deep-navy/40 dark:text-white/40" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search contacts…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-deep-navy/30 dark:placeholder:text-white/30"
          />
        </div>

        {selectedIds.length > 0 && (
          <div className="flex items-center gap-2 rounded-xl bg-electric/10 px-3 py-2 text-xs font-medium text-electric">
            <span>{selectedIds.length} selected</span>
            <button onClick={() => setBulkTagOpen(true)} className="flex items-center gap-1 hover:underline">
              <TagIcon size={12} /> Tag
            </button>
            <button
              onClick={() => bulkArchive.mutateAsync({ contactIds: selectedIds, isArchived: true }).then(() => setSelected(new Set()))}
              className="flex items-center gap-1 hover:underline"
            >
              <Archive size={12} /> Archive
            </button>
            <button
              onClick={() => bulkDelete.mutateAsync(selectedIds).then(() => setSelected(new Set()))}
              className="flex items-center gap-1 text-danger hover:underline"
            >
              <Trash2 size={12} /> Delete
            </button>
          </div>
        )}
      </div>

      <GlassCard padded={false} className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-black/5 text-xs uppercase tracking-wide text-deep-navy/50 dark:border-white/10 dark:text-white/40">
                <th className="px-4 py-3 font-medium">
                  <input
                    type="checkbox"
                    checked={Boolean(data && data.items.length > 0 && selected.size === data.items.length)}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 rounded accent-electric"
                  />
                </th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Phone</th>
                <th className="px-4 py-3 font-medium">Company</th>
                <th className="px-4 py-3 font-medium">Opt-in</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-deep-navy/40 dark:text-white/40">
                    Loading contacts…
                  </td>
                </tr>
              )}
              {!isLoading && data?.items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-deep-navy/40 dark:text-white/40">
                    No contacts yet — add one or import a CSV to get started.
                  </td>
                </tr>
              )}
              {data?.items.map((contact) => (
                <tr key={contact.id} className="border-b border-black/5 last:border-0 dark:border-white/5">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(contact.id)}
                      onChange={() => toggleSelected(contact.id)}
                      className="h-4 w-4 rounded accent-electric"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {contact.isFavorite && <Star size={14} className="fill-amber text-amber" />}
                      <span className="font-medium text-deep-navy dark:text-white">
                        {contact.firstName || contact.lastName
                          ? `${contact.firstName ?? ''} ${contact.lastName ?? ''}`.trim()
                          : '—'}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-deep-navy/70 dark:text-white/70">
                    <span className="flex items-center gap-1.5">
                      <Phone size={13} /> {contact.phoneNumber}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-deep-navy/70 dark:text-white/70">{contact.company || '—'}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() =>
                        setOptIn.mutate({ id: contact.id, optedIn: contact.optInStatus !== 'OPTED_IN' })
                      }
                    >
                      <OptInBadge status={contact.optInStatus} />
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => openEditDialog(contact)}
                        className="text-deep-navy/30 hover:text-electric dark:text-white/30"
                        aria-label="Edit contact"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteContact.mutate(contact.id)}
                        className="text-deep-navy/30 hover:text-danger dark:text-white/30"
                        aria-label="Delete contact"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>

      <GlassDialog open={addOpen} onClose={() => setAddOpen(false)} title="Add Contact">
        <form onSubmit={handleAddSubmit} className="flex flex-col gap-3">
          <input
            required
            placeholder="Phone number (+1234567890)"
            value={form.phoneNumber}
            onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })}
            className={inputClass}
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              placeholder="First name"
              value={form.firstName}
              onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              className={inputClass}
            />
            <input
              placeholder="Last name"
              value={form.lastName}
              onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              className={inputClass}
            />
          </div>
          <input
            placeholder="Email"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className={inputClass}
          />
          <input
            placeholder="Company"
            value={form.company}
            onChange={(e) => setForm({ ...form, company: e.target.value })}
            className={inputClass}
          />
          <GlassButton type="submit" loading={createContact.isPending} className="mt-2">
            Add Contact
          </GlassButton>
        </form>
      </GlassDialog>

      <GlassDialog open={!!editingContact} onClose={() => setEditingContact(null)} title="Edit Contact">
        <form onSubmit={handleEditSubmit} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <input
              placeholder="First name"
              value={editForm.firstName}
              onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })}
              className={inputClass}
            />
            <input
              placeholder="Last name"
              value={editForm.lastName}
              onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })}
              className={inputClass}
            />
          </div>
          <input
            placeholder="Email"
            type="email"
            value={editForm.email}
            onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
            className={inputClass}
          />
          <input
            placeholder="Company"
            value={editForm.company}
            onChange={(e) => setEditForm({ ...editForm, company: e.target.value })}
            className={inputClass}
          />
          <input
            placeholder="City"
            value={editForm.city}
            onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
            className={inputClass}
          />
          <GlassButton type="submit" loading={updateContact.isPending} className="mt-2">
            Save Changes
          </GlassButton>
        </form>
      </GlassDialog>

      <GlassDialog open={importOpen} onClose={() => { setImportOpen(false); setImportResult(null); }} title="Import Contacts from CSV">
        <form onSubmit={handleImportSubmit} className="flex flex-col gap-3">
          <p className="text-xs text-deep-navy/60 dark:text-white/50">
            Header row: phoneNumber, firstName, lastName, email, company, city
          </p>
          <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={handleFilePicked} className="text-sm" />
          <textarea
            required
            rows={8}
            placeholder="Or paste CSV content here…"
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            className={`${inputClass} font-mono text-xs`}
          />
          {importResult && (
            <p className="rounded-lg bg-emerald/10 px-3 py-2 text-xs text-emerald">
              Imported: {importResult.created} created, {importResult.updated} updated, {importResult.failed} failed
            </p>
          )}
          <GlassButton type="submit" loading={importContacts.isPending} className="mt-2">
            Import
          </GlassButton>
        </form>
      </GlassDialog>

      <GlassDialog open={bulkTagOpen} onClose={() => setBulkTagOpen(false)} title={`Tag ${selectedIds.length} contact(s)`}>
        <div className="flex flex-col gap-3">
          <GlassSelect
            value={bulkTagId}
            onChange={setBulkTagId}
            placeholder="Select a tag…"
            options={(tags ?? []).map((t) => ({ value: t.id, label: t.name }))}
          />
          <GlassButton
            disabled={!bulkTagId}
            loading={bulkAddTag.isPending}
            onClick={async () => {
              await bulkAddTag.mutateAsync({ contactIds: selectedIds, tagId: bulkTagId });
              setBulkTagOpen(false);
              setSelected(new Set());
              setBulkTagId('');
            }}
          >
            Apply Tag
          </GlassButton>
        </div>
      </GlassDialog>
    </div>
  );
}
