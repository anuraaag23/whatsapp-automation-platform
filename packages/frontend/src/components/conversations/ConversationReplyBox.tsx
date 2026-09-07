'use client';

import { useState } from 'react';
import { Send, Image as ImageIcon, Type, AlertTriangle } from 'lucide-react';
import { ConversationContact, useSendConversationReply } from '@/hooks/api/conversations';

interface Props {
  conversationId: string;
  contact: ConversationContact;
}

export function ConversationReplyBox({ conversationId, contact }: Props) {
  const [mode, setMode] = useState<'TEXT' | 'IMAGE'>('TEXT');
  const [body, setBody] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const sendReply = useSendConversationReply(conversationId);

  const isOptedOut = contact.optInStatus === 'OPTED_OUT';
  const isPending = contact.optInStatus === 'PENDING';

  async function handleSend(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (isOptedOut) return;

    setErrorMessage(null);
    try {
      await sendReply.mutateAsync({
        contactId: contact.id,
        type: mode,
        body: mode === 'TEXT' ? body.trim() : undefined,
        imageUrl: mode === 'IMAGE' ? imageUrl.trim() : undefined,
        caption: mode === 'IMAGE' ? caption.trim() || undefined : undefined,
      });

      setBody('');
      setImageUrl('');
      setCaption('');
    } catch (err: any) {
      setErrorMessage(
        err?.response?.data?.message ?? 'Could not send WhatsApp message. Ensure your account is connected.',
      );
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (body.trim()) handleSend();
    }
  }

  if (isOptedOut) {
    return (
      <div className="border-t border-black/5 bg-danger/5 p-4 dark:border-white/10 dark:bg-danger/10">
        <div className="flex items-center gap-2 text-xs font-semibold text-danger">
          <AlertTriangle size={15} />
          <span>Contact has opted out of WhatsApp messages</span>
        </div>
        <p className="mt-1 text-[11px] text-danger/80">
          WhatsApp policy prohibits sending messages to opted-out users. The contact must send START or opt back in before you can message them.
        </p>
      </div>
    );
  }

  return (
    <div className="border-t border-black/5 bg-white/40 p-3 backdrop-blur-md dark:border-white/10 dark:bg-deep-navy/40">
      {isPending && (
        <div className="mb-2 flex items-center gap-1.5 rounded-xl bg-amber/10 px-2.5 py-1 text-[11px] text-amber dark:bg-amber/20">
          <AlertTriangle size={12} className="shrink-0" />
          <span>Contact opt-in is pending. You can reply to their recent inbound message within the 24h window.</span>
        </div>
      )}

      {errorMessage && (
        <div className="mb-2 rounded-xl bg-danger/10 px-2.5 py-1 text-xs text-danger dark:bg-danger/20">
          {errorMessage}
        </div>
      )}

      {mode === 'IMAGE' ? (
        <div className="mb-2 space-y-2">
          <input
            type="url"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="Public image URL (https://...)"
            className="w-full rounded-xl border border-white/40 bg-white/70 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-electric/40 dark:border-white/10 dark:bg-white/10"
          />
          <input
            type="text"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Image caption (optional)..."
            className="w-full rounded-xl border border-white/40 bg-white/70 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-electric/40 dark:border-white/10 dark:bg-white/10"
          />
        </div>
      ) : null}

      <div className="flex items-end gap-2">
        {/* Toggle Mode */}
        <button
          type="button"
          onClick={() => setMode(mode === 'TEXT' ? 'IMAGE' : 'TEXT')}
          title={mode === 'TEXT' ? 'Attach Image' : 'Text message'}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-black/5 text-deep-navy/60 hover:bg-black/10 hover:text-deep-navy dark:bg-white/10 dark:text-white/60 dark:hover:bg-white/15 dark:hover:text-white"
        >
          {mode === 'TEXT' ? <ImageIcon size={16} /> : <Type size={16} />}
        </button>

        {/* Textarea Input */}
        {mode === 'TEXT' && (
          <textarea
            rows={1}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message (Enter to send, Shift+Enter for newline)…"
            className="max-h-32 min-h-[40px] flex-1 resize-none rounded-2xl border border-white/40 bg-white/70 px-3.5 py-2.5 text-xs outline-none placeholder:text-deep-navy/35 focus:ring-2 focus:ring-electric/40 dark:border-white/10 dark:bg-white/10 dark:placeholder:text-white/35"
          />
        )}

        {/* Send Button */}
        <button
          type="button"
          disabled={sendReply.isPending || (mode === 'TEXT' ? !body.trim() : !imageUrl.trim())}
          onClick={() => handleSend()}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-electric text-white shadow-md transition-all hover:bg-electric/90 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Send size={16} className={sendReply.isPending ? 'animate-pulse' : ''} />
        </button>
      </div>
    </div>
  );
}
