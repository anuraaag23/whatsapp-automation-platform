'use client';

import { LifeBuoy, Mail, Github, ExternalLink } from 'lucide-react';
import { GlassCard, GlassButton } from '@/components/glass';

const GITHUB_REPO_URL = 'https://github.com/anuraaag23/whatsapp-automation-platform.git';

export default function SupportPage() {
  return (
    <div className="flex flex-col gap-6 pb-8">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-electric/10 text-electric">
          <LifeBuoy size={20} />
        </div>
        <div>
          <h2 className="text-2xl font-semibold text-deep-navy dark:text-white">Support</h2>
          <p className="text-sm text-deep-navy/60 dark:text-white/60">
            Need a hand? Here&apos;s how to get help.
          </p>
        </div>
      </div>

      <GlassCard variant="lite" title="Something broken?" subtitle="What to include when reporting an issue">
        <ul className="list-inside list-disc space-y-1 text-sm text-deep-navy/70 dark:text-white/60">
          <li>What page or action you were on</li>
          <li>What you expected to happen vs. what happened</li>
          <li>Any error message shown on screen</li>
          <li>Browser console errors (press F12 → Console tab)</li>
        </ul>
      </GlassCard>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <GlassCard variant="lite" icon={<Mail size={18} />} title="Email" subtitle="Reach the team directly">
          <GlassButton variant="secondary" size="sm" onClick={() => window.open('mailto:wa.automation.support@gmail.com')}>
            wa.automation.support@gmail.com
          </GlassButton>
        </GlassCard>
        <GlassCard
          variant="lite"
          icon={<Github size={18} />}
          title="GitHub Repository"
          subtitle="Source, issues, and development"
        >
          <p className="mb-3 text-sm text-deep-navy/60 dark:text-white/50">
            Browse the source, report a bug, or open a pull request.
          </p>
          <GlassButton
            variant="primary"
            size="sm"
            icon={<ExternalLink size={14} />}
            onClick={() => window.open(GITHUB_REPO_URL, '_blank', 'noopener,noreferrer')}
          >
            Open Repository
          </GlassButton>
        </GlassCard>
      </div>
    </div>
  );
}
