'use client';

import { ConversationItem } from '@/hooks/api/conversations';

interface Props {
  conversation: ConversationItem;
  isSelected: boolean;
  onClick: () => void;
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function ConversationListItem({ conversation, isSelected, onClick }: Props) {
  const { contact, status, unreadCount, lastMessageAt } = conversation;
  const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(' ');
  const displayName = fullName || contact.phoneNumber;
  const initials = fullName
    ? fullName
        .split(' ')
        .map((p) => p[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : '#';

  const timeText = formatRelativeTime(lastMessageAt);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-start gap-3 rounded-2xl p-3 text-left transition-all duration-200 ${
        isSelected
          ? 'bg-electric/15 text-deep-navy shadow-sm ring-1 ring-electric/30 dark:bg-white/15 dark:text-white'
          : 'hover:bg-black/5 dark:hover:bg-white/5 text-deep-navy/80 dark:text-white/80'
      }`}
    >
      {/* Contact Avatar */}
      <div className="relative shrink-0">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-electric/80 to-electric text-sm font-semibold text-white shadow-sm">
          {initials}
        </div>
        {contact.optInStatus === 'OPTED_OUT' && (
          <span
            title="Opted out"
            className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-danger dark:border-deep-navy"
          />
        )}
        {contact.optInStatus === 'OPTED_IN' && (
          <span
            title="Opted in"
            className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald dark:border-deep-navy"
          />
        )}
      </div>

      {/* Info & Snippet */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-1">
          <p className="truncate font-semibold text-sm text-deep-navy dark:text-white">
            {displayName}
          </p>
          <span className="shrink-0 text-[11px] text-deep-navy/40 dark:text-white/40">{timeText}</span>
        </div>

        <div className="mt-0.5 flex items-center justify-between gap-2">
          <p className="truncate text-xs text-deep-navy/60 dark:text-white/50">
            {fullName ? contact.phoneNumber : contact.company || 'WhatsApp Conversation'}
          </p>

          <div className="flex items-center gap-1.5 shrink-0">
            {status === 'RESOLVED' && (
              <span className="rounded-full bg-emerald/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald">
                Resolved
              </span>
            )}
            {status === 'ARCHIVED' && (
              <span className="rounded-full bg-black/10 px-1.5 py-0.5 text-[10px] font-medium text-deep-navy/50 dark:bg-white/10 dark:text-white/50">
                Archived
              </span>
            )}
            {unreadCount > 0 && (
              <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-electric px-1.5 text-[11px] font-bold text-white shadow-sm">
                {unreadCount}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}
