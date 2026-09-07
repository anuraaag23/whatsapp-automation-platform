'use client';

import { useState } from 'react';
import { Search, X, MessageSquare, AlertCircle, RefreshCw } from 'lucide-react';
import { ConversationItem, useConversations } from '@/hooks/api/conversations';
import { ConversationListItem } from './ConversationListItem';

interface Props {
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const TABS = [
  { label: 'All', value: 'ALL' },
  { label: 'Open', value: 'OPEN' },
  { label: 'Resolved', value: 'RESOLVED' },
  { label: 'Archived', value: 'ARCHIVED' },
];

export function ConversationList({ selectedId, onSelect }: Props) {
  const [status, setStatus] = useState<string>('ALL');
  const [search, setSearch] = useState<string>('');
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);

  const { data, isLoading, isFetching, isError, refetch } = useConversations({
    status: status === 'ALL' ? undefined : status,
    search: search.trim() || undefined,
  });

  const items = data?.items ?? [];

  const handleManualRefresh = async () => {
    if (isFetching || isManualRefreshing) return;
    setIsManualRefreshing(true);
    try {
      await refetch();
    } catch {
      // Keep existing data visible, prevent crash
    } finally {
      setIsManualRefreshing(false);
    }
  };

  const isRefreshingActive = isFetching || isManualRefreshing;

  return (
    <div className="flex h-full flex-col">
      {/* Header & Search */}
      <div className="flex flex-col gap-3 p-4 pb-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold tracking-tight text-deep-navy dark:text-white">Conversations</h3>
          <button
            type="button"
            disabled={isRefreshingActive}
            onClick={handleManualRefresh}
            title={isRefreshingActive ? 'Refreshing conversations…' : 'Refresh conversations'}
            aria-label="Refresh conversations"
            className="rounded-xl p-1.5 text-deep-navy/50 hover:bg-black/5 hover:text-deep-navy disabled:opacity-50 dark:text-white/50 dark:hover:bg-white/10 dark:hover:text-white transition-all"
          >
            <RefreshCw size={15} className={isRefreshingActive ? 'animate-spin text-electric' : ''} />
          </button>
        </div>

        {/* Search input */}
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-deep-navy/40 dark:text-white/40" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or phone…"
            className="w-full rounded-xl border border-white/40 bg-white/60 py-2 pl-9 pr-8 text-xs outline-none placeholder:text-deep-navy/35 focus:ring-2 focus:ring-electric/40 dark:border-white/10 dark:bg-white/10 dark:placeholder:text-white/35"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-deep-navy/40 hover:text-deep-navy dark:text-white/40 dark:hover:text-white"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
          {TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setStatus(tab.value)}
              className={`rounded-xl px-3 py-1 text-xs font-medium transition-all ${
                status === tab.value
                  ? 'bg-electric text-white shadow-sm'
                  : 'bg-black/5 text-deep-navy/60 hover:bg-black/10 dark:bg-white/10 dark:text-white/60 dark:hover:bg-white/15'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Conversation Items Stream */}
      <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-1">
        {isError && items.length > 0 && (
          <div className="mx-1 mb-2 flex items-center justify-between rounded-xl border border-danger/20 bg-danger/10 px-3 py-2 text-xs text-danger">
            <div className="flex items-center gap-1.5">
              <AlertCircle size={13} />
              <span>Could not refresh conversations.</span>
            </div>
            <button
              type="button"
              onClick={handleManualRefresh}
              className="font-semibold underline hover:no-underline"
            >
              Retry
            </button>
          </div>
        )}

        {isLoading && items.length === 0 && (
          <div className="space-y-2 p-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex animate-pulse items-center gap-3 rounded-2xl p-3">
                <div className="h-11 w-11 rounded-2xl bg-black/5 dark:bg-white/5" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 w-3/4 rounded bg-black/5 dark:bg-white/5" />
                  <div className="h-2.5 w-1/2 rounded bg-black/5 dark:bg-white/5" />
                </div>
              </div>
            ))}
          </div>
        )}

        {isError && items.length === 0 && (
          <div className="flex flex-col items-center justify-center p-8 text-center text-xs text-danger">
            <AlertCircle size={24} className="mb-2 opacity-70" />
            <p>Could not load conversations.</p>
            <button
              type="button"
              onClick={handleManualRefresh}
              className="mt-2 font-semibold underline"
            >
              Retry
            </button>
          </div>
        )}

        {!isLoading && !isError && items.length === 0 && (
          <div className="flex flex-col items-center justify-center p-8 text-center text-xs text-deep-navy/40 dark:text-white/40">
            <MessageSquare size={32} className="mb-2 opacity-25" />
            <p className="font-medium text-sm text-deep-navy/60 dark:text-white/60">No conversations</p>
            <p className="mt-1 max-w-[200px]">
              {search
                ? 'No conversations match your search.'
                : 'Incoming messages from your WhatsApp test number will appear here automatically.'}
            </p>
          </div>
        )}

        {!isLoading &&
          !isError &&
          items.map((conv) => (
            <ConversationListItem
              key={conv.id}
              conversation={conv}
              isSelected={selectedId === conv.id}
              onClick={() => onSelect(conv.id)}
            />
          ))}
      </div>
    </div>
  );
}
