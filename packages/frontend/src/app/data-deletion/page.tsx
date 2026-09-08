import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Trash2, Mail, ShieldCheck, AlertCircle } from 'lucide-react';

export const metadata: Metadata = {
  title: 'User Data Deletion — WhatsApp Business Automation Platform',
  description:
    'Instructions and procedures for requesting user, account, and messaging data deletion from the WhatsApp Business Automation Platform.',
};

export default function DataDeletionPage() {
  return (
    <main className="min-h-screen px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <div className="mx-auto max-w-4xl">
        {/* Navigation / Header */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 text-sm font-medium text-electric hover:underline"
          >
            <ArrowLeft size={16} />
            <span>Return to Sign In</span>
          </Link>
          <div className="flex items-center gap-2 text-xs text-deep-navy/60 dark:text-white/60">
            <span>Effective Date: September 8, 2026</span>
          </div>
        </div>

        {/* Hero Card */}
        <div className="mb-8 rounded-3xl border border-white/40 bg-white/75 p-6 shadow-glass backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.04] dark:shadow-glass-dark sm:p-8">
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-6">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-danger/10 text-danger shadow-sm dark:bg-danger/20">
              <Trash2 size={28} />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-deep-navy dark:text-white sm:text-3xl">
                User Data Deletion Instructions
              </h1>
              <p className="mt-1 text-sm text-deep-navy/70 dark:text-white/70">
                WhatsApp Business Automation Platform
              </p>
            </div>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-deep-navy/80 dark:text-white/80">
            The WhatsApp Business Automation Platform respects user privacy and data control. In support of user
            privacy and Meta Platform developer requirements, this page provides instructions on how users and workspace
            owners can request the deletion of their account data and associated application records from our platform.
          </p>
        </div>

        {/* Deletion Body */}
        <div className="space-y-8 rounded-3xl border border-white/40 bg-white/75 p-6 shadow-glass backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.04] dark:shadow-glass-dark sm:p-10">
          {/* Section 1 */}
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-deep-navy dark:text-white">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-electric/10 text-xs font-bold text-electric">
                1
              </span>
              How to Request Data Deletion
            </h2>
            <p className="text-sm leading-relaxed text-deep-navy/80 dark:text-white/80">
              You can initiate a request to delete your account, organization data, or WhatsApp message history
              by sending an email to our designated contact address:
            </p>
            <div className="flex items-center gap-3 rounded-2xl border border-white/40 bg-white/50 p-4 dark:border-white/10 dark:bg-white/10 sm:w-fit">
              <Mail size={18} className="text-electric" />
              <a
                href="mailto:anurag.ay8840@gmail.com?subject=Data%20Deletion%20Request%20-%20WhatsApp%20Platform"
                className="text-sm font-medium text-deep-navy hover:underline dark:text-white"
              >
                anurag.ay8840@gmail.com
              </a>
            </div>
            <p className="text-sm text-deep-navy/70 dark:text-white/70">
              Please use the subject line: <strong>&quot;Data Deletion Request - WhatsApp Platform&quot;</strong>.
            </p>
          </section>

          {/* Section 2 */}
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-deep-navy dark:text-white">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-electric/10 text-xs font-bold text-electric">
                2
              </span>
              Information to Include in Your Request
            </h2>
            <p className="text-sm leading-relaxed text-deep-navy/80 dark:text-white/80">
              To ensure we accurately identify your records, please provide the following details from your registered email:
            </p>
            <ul className="list-inside list-disc space-y-2 text-sm text-deep-navy/80 dark:text-white/80">
              <li>Your registered account email address.</li>
              <li>Your Organization or Workspace Name.</li>
              <li>
                The specific scope of deletion requested (e.g., entire user account, entire workspace, connected WhatsApp credentials, or message history).
              </li>
              <li>Any connected WhatsApp display phone numbers associated with the workspace, if applicable.</li>
            </ul>

            {/* Critical Warning Box */}
            <div className="flex items-start gap-3 rounded-2xl border border-amber/30 bg-amber/10 p-4 dark:border-amber/20 dark:bg-amber/15">
              <AlertCircle size={20} className="shrink-0 text-amber mt-0.5" />
              <div className="text-xs leading-relaxed text-deep-navy/90 dark:text-white/90">
                <strong>Important Security Notice:</strong> Never include passwords, API secrets, WhatsApp access tokens,
                or banking information in your deletion request email. We will never ask you to provide secrets or passwords to process a deletion request.
              </div>
            </div>
          </section>

          {/* Section 3 */}
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-deep-navy dark:text-white">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-electric/10 text-xs font-bold text-electric">
                3
              </span>
              Identity Verification
            </h2>
            <p className="text-sm leading-relaxed text-deep-navy/80 dark:text-white/80">
              To prevent unauthorized or fraudulent deletion requests, we verify the requester&apos;s identity before taking action.
              Requests must be submitted from the verified email address associated with the workspace account. For workspace-level
              data deletion, confirmation by the workspace account owner may be required before records are deleted.
            </p>
          </section>

          {/* Section 4 */}
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-deep-navy dark:text-white">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-electric/10 text-xs font-bold text-electric">
                4
              </span>
              What Data Is Deleted From Our Platform
            </h2>
            <p className="text-sm leading-relaxed text-deep-navy/80 dark:text-white/80">
              Upon successful verification of a deletion request, we delete or remove the following categories of records
              from our active application database:
            </p>
            <ul className="list-inside list-disc space-y-2 text-sm text-deep-navy/80 dark:text-white/80">
              <li>
                <strong className="text-deep-navy dark:text-white">Account Information:</strong> User profile records,
                email addresses, password hashes, and user session records.
              </li>
              <li>
                <strong className="text-deep-navy dark:text-white">WhatsApp Integration Data:</strong> Stored Phone Number IDs,
                Business Account IDs, display phone numbers, and stored API access tokens.
              </li>
              <li>
                <strong className="text-deep-navy dark:text-white">Customer Contacts and Conversations:</strong> Stored contact
                records, conversation threads, inbound/outbound message records, delivery status receipts, and customer notes.
              </li>
              <li>
                <strong className="text-deep-navy dark:text-white">Automation Data:</strong> Automation workflows,
                execution logs, broadcast campaign records, and scheduled messages.
              </li>
            </ul>
          </section>

          {/* Section 5 */}
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-deep-navy dark:text-white">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-electric/10 text-xs font-bold text-electric">
                5
              </span>
              WhatsApp &amp; Meta Third-Party Data
            </h2>
            <p className="text-sm leading-relaxed text-deep-navy/80 dark:text-white/80">
              Please note the clear distinction between data stored directly in this application and data maintained by Meta:
            </p>
            <ul className="list-inside list-disc space-y-2 text-sm text-deep-navy/80 dark:text-white/80">
              <li>
                Processing a deletion request removes application records stored in our platform&apos;s database.
              </li>
              <li>
                It does <strong>not</strong> delete, modify, or affect messages, backups, phone numbers, or account records
                maintained independently by Meta Platforms, Inc. or WhatsApp LLC on their own systems or inside your Meta Business Manager.
              </li>
              <li>
                This platform has no ability or authorization to delete data from Meta&apos;s servers. To manage or delete records
                held directly by Meta Platforms, you must use Meta&apos;s official Business Manager settings or Meta&apos;s Privacy Center.
              </li>
            </ul>
          </section>

          {/* Section 6 */}
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-deep-navy dark:text-white">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-electric/10 text-xs font-bold text-electric">
                6
              </span>
              Processing and Confirmation
            </h2>
            <p className="text-sm leading-relaxed text-deep-navy/80 dark:text-white/80">
              Verified requests will be processed within a reasonable period. Confirmation will be provided to the requester
              when processing is complete. Routine automated database backups that contain historical system snapshots are
              overwritten as part of standard operational backup cycles.
            </p>
          </section>

          {/* Section 7 */}
          <section className="space-y-3 border-t border-black/5 pt-6 dark:border-white/10">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-deep-navy dark:text-white">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-electric/10 text-xs font-bold text-electric">
                7
              </span>
              Questions or Assistance
            </h2>
            <p className="text-sm leading-relaxed text-deep-navy/80 dark:text-white/80">
              If you have any questions about this deletion process or need assistance with your data, please contact:
            </p>
            <div className="flex items-center gap-3 rounded-2xl border border-white/40 bg-white/50 p-4 dark:border-white/10 dark:bg-white/10 sm:w-fit">
              <Mail size={18} className="text-electric" />
              <a
                href="mailto:anurag.ay8840@gmail.com"
                className="text-sm font-medium text-deep-navy hover:underline dark:text-white"
              >
                anurag.ay8840@gmail.com
              </a>
            </div>
            <p className="text-xs text-deep-navy/60 dark:text-white/60">
              For complete details regarding our data collection and protection standards, please view our{' '}
              <Link href="/privacy" className="text-electric underline hover:text-electric-soft">
                Privacy Policy
              </Link>{' '}
              and{' '}
              <Link href="/terms" className="text-electric underline hover:text-electric-soft">
                Terms of Service
              </Link>
              .
            </p>
          </section>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-xs text-deep-navy/50 dark:text-white/50">
          <p>&copy; {new Date().getFullYear()} WhatsApp Business Automation Platform. Independent developer application. Not affiliated with Meta Platforms, Inc.</p>
        </div>
      </div>
    </main>
  );
}
