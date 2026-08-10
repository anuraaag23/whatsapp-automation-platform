'use client';

import { HelpCircle } from 'lucide-react';
import { GlassCard } from '@/components/glass';

const FAQS = [
  {
    q: 'How do I connect my WhatsApp Business account?',
    a: 'Go to Settings → WhatsApp Business Account, and paste your Business Account ID, Phone Number ID, and access token from your Meta App dashboard.',
  },
  {
    q: 'Why aren\u2019t my scheduled messages sending?',
    a: 'Check Settings to confirm a WhatsApp account is connected. Messages queue up but won\u2019t send until one is linked — you\u2019ll also see a notification about this.',
  },
  {
    q: 'How does the random-time scheduler work?',
    a: 'When creating a schedule, enable "Randomize send time" and set a window (e.g. 9:00–12:00). Each run picks a random minute inside that window instead of a fixed time.',
  },
  {
    q: 'Can I use AI to write messages?',
    a: 'Yes, once an admin sets AI_API_KEY in the backend environment. Without it, AI features return a clear "not configured" message instead of failing silently.',
  },
  {
    q: 'How do I invite a teammate?',
    a: 'Settings → Organizations → Invite. They need an existing account on the platform first — invite-by-email for brand-new users isn\u2019t built yet.',
  },
  {
    q: 'What do the automation node types do?',
    a: 'Trigger starts the flow (keyword received, contact created, etc.). Condition/Branch check a rule. Delay/Wait pauses before continuing. Send Message sends via WhatsApp. AI generates text. Webhook calls an external URL. Finish ends the run.',
  },
  {
    q: 'How do templates get approved for sending?',
    a: 'Create a template, then click "Submit for approval" on its card. This sends it to Meta for review — approval usually takes a few minutes to a day. You\u2019ll see its status change from Pending to Approved (or Rejected with a reason) on the same card.',
  },
  {
    q: 'What\u2019s the difference between a Group and a Segment?',
    a: 'A Group is a fixed list of contacts you add and remove manually. A Segment is a saved rule (e.g. "city equals Mumbai") that automatically matches whichever contacts fit it right now — the membership updates itself as your contacts change.',
  },
  {
    q: 'How do I import a lot of contacts at once?',
    a: 'Contacts page → Import CSV. Your file needs at minimum a phoneNumber column; firstName, lastName, email, company, and city columns are picked up automatically if present.',
  },
  {
    q: 'What can each role (Owner, Admin, Manager, Support, Viewer) do?',
    a: 'Owner and Admin can manage billing-level settings, API keys, and team member roles. Manager and Support can run day-to-day work — contacts, campaigns, templates, schedules. Viewer can see everything but can\u2019t create or edit. You can change anyone\u2019s role in Settings → Organizations.',
  },
  {
    q: 'Can I get notified outside the app when something happens?',
    a: 'Yes — Settings → Notification Channels lets you add email (SMTP), Slack, or Telegram delivery in addition to the in-app bell, so you don\u2019t have to keep the dashboard open to catch alerts.',
  },
  {
    q: 'What are API keys for?',
    a: 'Settings → API Keys lets you generate a key for connecting external tools (like Zapier or a custom script) to this platform\u2019s API, separate from your own login credentials.',
  },
  {
    q: 'Can I export my analytics data?',
    a: 'Yes — the Analytics page has both a CSV export (raw message volume numbers) and a PDF Report button (a formatted summary) in the top-right corner.',
  },
  {
    q: 'Can I install this as an app on my phone or desktop?',
    a: 'Yes — open the site in Chrome (Android/desktop) or Safari (iPhone/iPad) and look for "Add to Home Screen" or an install icon in the address bar. It runs like a normal app afterward, without needing an app store.',
  },
  {
    q: 'Why can\u2019t I find a contact/campaign/template I know exists?',
    a: 'Use the search bar at the top of any page (or press \u2318K / Ctrl+K) — it searches across contacts, campaigns, templates, and more at once, rather than needing to be on the right page first.',
  },
];

export default function HelpPage() {
  return (
    <div className="flex flex-col gap-6 pb-8">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-electric/10 text-electric">
          <HelpCircle size={20} />
        </div>
        <div>
          <h2 className="text-2xl font-semibold text-deep-navy dark:text-white">Help</h2>
          <p className="text-sm text-deep-navy/60 dark:text-white/60">
            Common questions about using the platform.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {FAQS.map((item) => (
          <GlassCard key={item.q} variant="lite">
            <p className="mb-1.5 text-sm font-medium text-deep-navy dark:text-white">{item.q}</p>
            <p className="text-sm text-deep-navy/60 dark:text-white/60">{item.a}</p>
          </GlassCard>
        ))}
      </div>
    </div>
  );
}
