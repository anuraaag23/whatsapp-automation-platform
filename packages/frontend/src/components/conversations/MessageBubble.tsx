'use client';

import { Check, CheckCheck, Clock, AlertCircle } from 'lucide-react';
import { ConversationMessage } from '@/hooks/api/conversations';

interface Props {
  message: ConversationMessage;
}

export function MessageBubble({ message }: Props) {
  const isInbound = message.direction === 'INBOUND';
  const textContent =
    typeof message.content?.body === 'string'
      ? message.content.body
      : typeof message.content?.text === 'string'
        ? message.content.text
        : '';

  const imageUrl =
    message.type === 'IMAGE' && typeof message.content?.link === 'string'
      ? message.content.link
      : null;

  const caption =
    message.type === 'IMAGE' && typeof message.content?.caption === 'string'
      ? message.content.caption
      : null;

  const timeStr = new Date(message.createdAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className={`flex w-full ${isInbound ? 'justify-start' : 'justify-end'}`}>
      <div
        className={`relative max-w-[82%] sm:max-w-[70%] rounded-2xl p-3 text-sm shadow-sm transition-all ${
          isInbound
            ? 'rounded-tl-sm border border-white/40 bg-white/90 text-deep-navy dark:border-white/10 dark:bg-white/15 dark:text-white'
            : 'rounded-tr-sm bg-gradient-to-br from-electric to-electric/90 text-white'
        }`}
      >
        {/* Optional Image */}
        {imageUrl && (
          <div className="mb-2 overflow-hidden rounded-xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt={caption || 'WhatsApp media'} className="max-h-60 w-full object-cover" />
          </div>
        )}

        {/* Text Content */}
        {textContent ? (
          <p className="whitespace-pre-wrap break-words leading-relaxed">{textContent}</p>
        ) : caption ? (
          <p className="whitespace-pre-wrap break-words leading-relaxed">{caption}</p>
        ) : !imageUrl ? (
          <p className="italic text-xs opacity-70">[{message.type || 'Message'}]</p>
        ) : null}

        {/* Timestamp & Status Meta */}
        <div
          className={`mt-1.5 flex items-center justify-end gap-1 text-[10px] ${
            isInbound ? 'text-deep-navy/40 dark:text-white/40' : 'text-white/70'
          }`}
        >
          <span>{timeStr}</span>

          {!isInbound && (
            <span>
              {message.status === 'QUEUED' && <span title="Queued"><Clock size={11} /></span>}
              {message.status === 'SENT' && <span title="Sent"><Check size={12} /></span>}
              {message.status === 'DELIVERED' && <span title="Delivered"><CheckCheck size={13} /></span>}
              {message.status === 'READ' && (
                <span title="Read"><CheckCheck size={13} className="text-cyan-200" /></span>
              )}
              {message.status === 'FAILED' && (
                <span title={message.errorMessage || 'Failed to send'} className="flex items-center gap-0.5 text-red-200">
                  <AlertCircle size={11} />
                </span>
              )}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
