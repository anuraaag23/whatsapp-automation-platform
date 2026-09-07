import { GlassCard } from '@/components/glass';

export function ComingSoon({ title, note }: { title: string; note: string }) {
  return (
    <div className="flex flex-col gap-6 pb-8">
      <div>
        <h2 className="text-2xl font-semibold text-deep-navy dark:text-white">{title}</h2>
        <p className="text-sm text-deep-navy/60 dark:text-white/60">Not built yet — shown honestly rather than with fake data.</p>
      </div>
      <GlassCard variant="lite">
        <p className="text-sm text-deep-navy/60 dark:text-white/50">{note}</p>
      </GlassCard>
    </div>
  );
}
