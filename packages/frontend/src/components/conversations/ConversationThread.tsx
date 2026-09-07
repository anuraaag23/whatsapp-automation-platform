'use client';

import { useEffect, useRef } from 'react';
import { ArrowLeft, MessageSquare, UserCheck, Shield, CheckCircle2 } from 'lucide-react';
import {
  ConversationItem,
  useConversation,
  useConversationMessages,
  useUpdateConversationStatus,
  useAssignConversation,
  useMarkConversationRead,
} from '@/hooks/api/conversations';
import { useOrgUsers } from '@/hooks/api/users';
import { MessageBubble } from './MessageBubble';
import { ConversationReplyBox } from './ConversationReplyBox';

interface Props {
  conversationId: string | null;
  onBack?: () => void;
}

function formatDayDivider(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0 && date.getDate() === now.getDate()) return 'Today';
  if (diffDays <= 1) return 'Yesterday';
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function ConversationThread({ conversationId, onBack }: Props) {
  const { data: conversation } = useConversation(conversationId);
  const { data: messagesData, isLoading } = useConversationMessages(conversationId);
  const { data: orgUsers } = useOrgUsers();

  const updateStatus = useUpdateConversationStatus();
  const assign = useAssignConversation();
  const markRead = useMarkConversationRead();

  const scrollRef = useRef<HTMLDivElement>(null);

  // Automatically mark read when opened with unread messages
  useEffect(() => {
    if (conversationId && conversation && conversation.unreadCount > 0) {
      markRead.mutate(conversationId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, conversation?.unreadCount]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messagesData?.items.length]);

  if (!conversationId || !conversation) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center text-deep-navy/40 dark:text-white/40">
        <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-black/5 dark:bg-white/5">
          <MessageSquare size={28} className="opacity-30" />
        </div>
        <p className="mt-3 font-semibold text-base text-deep-navy/70 dark:text-white/70">
          No conversation selected
        </p>
        <p className="mt-1 text-xs max-w-xs">
          Select a conversation from the left pane to start messaging.
        </p>
      </div>
    );
  }

  const { contact } = conversation;
  const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(' ');
  const displayName = fullName || contact.phoneNumber;

  // Messages come in desc order from backend (newest first); reverse to display top-to-bottom chronologically
  const messages = [...(messagesData?.items ?? [])].reverse();

  return (
    <div className="flex h-full flex-col">
      {/* Thread Header */}
      <div className="flex items-center justify-between border-b border-black/5 bg-white/50 px-4 py-3 backdrop-blur-md dark:border-white/10 dark:bg-deep-navy/50">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="mr-1 rounded-xl p-1.5 text-deep-navy/60 hover:bg-black/5 hover:text-deep-navy md:hidden dark:text-white/60 dark:hover:bg-white/10"
            >
              <ArrowLeft size={18} />
            </button>
          )}

          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-bold text-sm text-deep-navy dark:text-white">{displayName}</h4>
              {contact.optInStatus === 'OPTED_IN' && (
                <span className="rounded-full bg-emerald/10 px-2 py-0.5 text-[10px] font-medium text-emerald">
                  Opted in
                </span>
              )}
              {contact.optInStatus === 'PENDING' && (
                <span className="rounded-full bg-amber/10 px-2 py-0.5 text-[10px] font-medium text-amber">
                  Pending opt-in
                </span>
              )}
              {contact.optInStatus === 'OPTED_OUT' && (
                <span className="rounded-full bg-danger/10 px-2 py-0.5 text-[10px] font-medium text-danger">
                  Opted out
                </span>
              )}
            </div>
            <p className="text-xs text-deep-navy/50 dark:text-white/40">
              {contact.phoneNumber} {contact.company ? `· ${contact.company}` : ''}
            </p>
          </div>
        </div>

        {/* Controls: Status & Assignee */}
        <div className="flex items-center gap-2">
          {/* Status Dropdown */}
          <select
            value={conversation.status}
            onChange={(e) =>
              updateStatus.mutate({ id: conversation.id, status: e.target.value as any })
            }
            className="rounded-xl border border-white/40 bg-white/60 px-2.5 py-1 text-xs font-medium text-deep-navy outline-none dark:border-white/10 dark:bg-white/10 dark:text-white"
          >
            <option value="OPEN">Open</option>
            <option value="RESOLVED">Resolved</option>
            <option value="ARCHIVED">Archived</option>
          </select>

          {/* Assignee Dropdown */}
          <select
            value={conversation.assignedUserId || ''}
            onChange={(e) =>
              assign.mutate({ id: conversation.id, userId: e.target.value || null })
            }
            className="rounded-xl border border-white/40 bg-white/60 px-2.5 py-1 text-xs font-medium text-deep-navy outline-none dark:border-white/10 dark:bg-white/10 dark:text-white max-w-[130px] truncate"
          >
            <option value="">Unassigned</option>
            {orgUsers?.map((u) => (
              <option key={u.id} value={u.id}>
                {[u.firstName, u.lastName].filter(Boolean).join(' ') || u.email}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Message History Stream */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {isLoading && (
          <div className="flex justify-center p-8 text-xs text-deep-navy/40 dark:text-white/40">
            Loading messages…
          </div>
        )}

        {!isLoading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center p-8 text-center text-xs text-deep-navy/40 dark:text-white/40">
            <CheckCircle2 size={24} className="mb-1 text-emerald opacity-60" />
            <p>No messages in this conversation yet.</p>
          </div>
        )}

        {!isLoading &&
          messages.map((m, idx) => {
            const currentDay = formatDayDivider(m.createdAt);
            const prevDay = idx > 0 ? formatDayDivider(messages[idx - 1].createdAt) : null;
            const showDivider = currentDay !== prevDay;

            return (
              <div key={m.id} className="space-y-3">
                {showDivider && (
                  <div className="my-2 flex items-center justify-center">
                    <span className="rounded-full bg-black/5 px-2.5 py-0.5 text-[10px] font-medium text-deep-navy/50 dark:bg-white/10 dark:text-white/50">
                      {currentDay}
                    </span>
                  </div>
                )}
                <MessageBubble message={m} />
              </div>
            );
          })}
      </div>

      {/* Reply Composer */}
      <ConversationReplyBox conversationId={conversation.id} contact={contact} />
    </div>
  );
}
