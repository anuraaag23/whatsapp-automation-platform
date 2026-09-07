'use client';

import { useState } from 'react';
import { GlassCard } from '@/components/glass';
import { ConversationList } from '@/components/conversations/ConversationList';
import { ConversationThread } from '@/components/conversations/ConversationThread';

export default function ConversationsPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <div className="h-[calc(100dvh-5.5rem)] sm:h-[calc(100dvh-6rem)]">
      <GlassCard variant="lite" padded={false} className="h-full overflow-hidden">
        <div className="flex h-full">
          {/* Left Pane: Conversation List */}
          <div
            className={`h-full w-full border-r border-black/5 md:w-[360px] lg:w-[380px] shrink-0 dark:border-white/10 ${
              selectedId ? 'hidden md:flex flex-col' : 'flex flex-col'
            }`}
          >
            <ConversationList selectedId={selectedId} onSelect={(id) => setSelectedId(id)} />
          </div>

          {/* Right Pane: Conversation Thread */}
          <div
            className={`h-full flex-1 flex-col ${
              selectedId ? 'flex' : 'hidden md:flex'
            }`}
          >
            <ConversationThread
              conversationId={selectedId}
              onBack={() => setSelectedId(null)}
            />
          </div>
        </div>
      </GlassCard>
    </div>
  );
}
