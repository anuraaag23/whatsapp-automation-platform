import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, FileText, Mail, ShieldAlert } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Terms of Service — WhatsApp Business Automation Platform',
  description:
    'Terms of Service governing the access and use of the WhatsApp Business Automation Platform.',
};

export default function TermsOfServicePage() {
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
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-electric/10 text-electric shadow-sm dark:bg-electric/20">
              <FileText size={28} />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-deep-navy dark:text-white sm:text-3xl">
                Terms of Service
              </h1>
              <p className="mt-1 text-sm text-deep-navy/70 dark:text-white/70">
                WhatsApp Business Automation Platform
              </p>
            </div>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-deep-navy/80 dark:text-white/80">
            These Terms of Service (&quot;Terms&quot;) govern your access to and use of the WhatsApp Business
            Automation Platform (&quot;the platform&quot;, &quot;we&quot;, or &quot;our&quot;). By creating an
            account, connecting a WhatsApp Business Account, or accessing our services, you agree to be bound
            by these Terms. If you do not agree to these Terms, you must not use the platform.
          </p>
        </div>

        {/* Terms Body */}
        <div className="space-y-8 rounded-3xl border border-white/40 bg-white/75 p-6 shadow-glass backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.04] dark:shadow-glass-dark sm:p-10">
          {/* Section 1 */}
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-deep-navy dark:text-white">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-electric/10 text-xs font-bold text-electric">
                1
              </span>
              Acceptance of Terms
            </h2>
            <p className="text-sm leading-relaxed text-deep-navy/80 dark:text-white/80">
              By accessing, browsing, or utilizing the platform&apos;s features, you confirm that you are of legal
              age and authority to enter into these Terms on behalf of yourself or the organization you represent.
              Continued use of the platform constitutes ongoing acceptance of any modifications to these Terms.
            </p>
          </section>

          {/* Section 2 */}
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-deep-navy dark:text-white">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-electric/10 text-xs font-bold text-electric">
                2
              </span>
              Description of Service
            </h2>
            <p className="text-sm leading-relaxed text-deep-navy/80 dark:text-white/80">
              The platform is a multi-tenant software application providing WhatsApp automation workflows,
              inbound message webhook processing, customer conversation management, message broadcast
              scheduling, contact management, and delivery analytics. We provide tools to interface with
              the WhatsApp Business Cloud API under the parameters configured by your organization.
            </p>
          </section>

          {/* Section 3 */}
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-deep-navy dark:text-white">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-electric/10 text-xs font-bold text-electric">
                3
              </span>
              Accounts and Security
            </h2>
            <p className="text-sm leading-relaxed text-deep-navy/80 dark:text-white/80">
              When creating an account, you agree to provide accurate, current, and complete registration
              information. You are solely responsible for maintaining the confidentiality of your credentials,
              including your login details and workspace invitations. You accept responsibility for all
              activities that occur under your account. Notify us immediately of any unauthorized use or
              security compromise.
            </p>
          </section>

          {/* Section 4 */}
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-deep-navy dark:text-white">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-electric/10 text-xs font-bold text-electric">
                4
              </span>
              WhatsApp and Meta Integration
            </h2>
            <p className="text-sm leading-relaxed text-deep-navy/80 dark:text-white/80">
              The platform interfaces with the WhatsApp Business Cloud API provided by Meta Platforms, Inc.
              You acknowledge and agree that:
            </p>
            <ul className="list-inside list-disc space-y-2 text-sm text-deep-navy/80 dark:text-white/80">
              <li>
                This platform is an independent third-party software application and is not affiliated with, sponsored by,
                operated by, or endorsed by Meta Platforms, Inc. or WhatsApp LLC. &quot;WhatsApp&quot; is a registered trademark of Meta Platforms, Inc.
              </li>
              <li>
                You must possess all necessary rights, permissions, and business authority to connect your WhatsApp Business
                Account (WABA), Phone Number IDs, and API access tokens to the platform.
              </li>
              <li>
                Your use of WhatsApp messaging must strictly comply with Meta&apos;s WhatsApp Business Messaging Policy,
                WhatsApp Commerce Policy, and Developer Terms of Service. You are solely responsible for obtaining all recipient
                opt-in consents and preventing unsolicited communications.
              </li>
              <li>
                Service availability, messaging rate limits, template approvals, and message delivery are governed directly by
                Meta&apos;s Cloud API infrastructure and policies. The platform does not control, and assumes no responsibility or liability for,
                delivery failures, Meta service interruptions, account restrictions, or policy enforcement actions taken by Meta.
              </li>
            </ul>
          </section>

          {/* Section 5 */}
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-deep-navy dark:text-white">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-electric/10 text-xs font-bold text-electric">
                5
              </span>
              Acceptable Use Policy
            </h2>
            <p className="text-sm leading-relaxed text-deep-navy/80 dark:text-white/80">
              You agree not to use the platform for any prohibited activities, including but not limited to:
            </p>
            <ul className="list-inside list-disc space-y-2 text-sm text-deep-navy/80 dark:text-white/80">
              <li>Sending unsolicited mass messages, spam, or deceptive marketing communications.</li>
              <li>Harassing, threatening, defrauding, or violating the privacy or rights of any recipient.</li>
              <li>Transmitting malware, phishing links, or harmful automated scripts.</li>
              <li>Attempting to probe, scan, breach, or bypass authentication or platform security mechanisms.</li>
              <li>Attempting to intercept, access, or query data belonging to any other organization or tenant.</li>
              <li>Violating any applicable national, state, or international laws or regulations.</li>
            </ul>
          </section>

          {/* Section 6 */}
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-deep-navy dark:text-white">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-electric/10 text-xs font-bold text-electric">
                6
              </span>
              User Content and Customer Consent
            </h2>
            <p className="text-sm leading-relaxed text-deep-navy/80 dark:text-white/80">
              You retain ownership of the messages, media, templates, and contact lists you upload or dispatch
              through the platform. You represent and warrant that you have obtained all legally required opt-in
              consents from end-users before initiating communications through WhatsApp. You are solely responsible
              for the accuracy and legality of the content you transmit.
            </p>
          </section>

          {/* Section 7 */}
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-deep-navy dark:text-white">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-electric/10 text-xs font-bold text-electric">
                7
              </span>
              Privacy and Data Protection
            </h2>
            <p className="text-sm leading-relaxed text-deep-navy/80 dark:text-white/80">
              Our collection and processing of personal data, account credentials, and messaging logs are governed
              by our{' '}
              <Link href="/privacy" className="text-electric underline hover:text-electric-soft">
                Privacy Policy
              </Link>
              . By using the platform, you acknowledge and consent to data handling in accordance with our Privacy Policy.
            </p>
          </section>

          {/* Section 8 */}
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-deep-navy dark:text-white">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-electric/10 text-xs font-bold text-electric">
                8
              </span>
              Platform Availability and Modifications
            </h2>
            <p className="text-sm leading-relaxed text-deep-navy/80 dark:text-white/80">
              The platform is provided on an &quot;as is&quot; and &quot;as available&quot; basis without any service level agreement (SLA)
              or uptime guarantee. We do not guarantee uninterrupted, secure, or error-free operation. We reserve the right to deploy updates,
              perform scheduled or emergency maintenance, or modify features at any time without prior notice.
            </p>
          </section>

          {/* Section 9 */}
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-deep-navy dark:text-white">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-electric/10 text-xs font-bold text-electric">
                9
              </span>
              Suspension and Termination
            </h2>
            <p className="text-sm leading-relaxed text-deep-navy/80 dark:text-white/80">
              We reserve the right to suspend or terminate your workspace or account access, with or without prior
              notice, if we determine that you have violated these Terms, engaged in abusive behavior, or if your
              usage poses a security or legal risk to the platform or other users. You may terminate your account
              at any time by discontinuing use and contacting support to remove your account.
            </p>
          </section>

          {/* Section 10 */}
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-deep-navy dark:text-white">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-electric/10 text-xs font-bold text-electric">
                10
              </span>
              Disclaimer of Warranties
            </h2>
            <p className="text-sm leading-relaxed text-deep-navy/80 dark:text-white/80">
              The platform and all associated services and tools are provided strictly on an &quot;as is&quot; and &quot;as available&quot;
              basis, without warranties or representations of any kind, whether express, statutory, or implied. To the fullest extent
              permissible under applicable law, we disclaim all warranties, including but not limited to merchantability, fitness for a
              particular purpose, uninterrupted availability, data security, title, and non-infringement.
            </p>
          </section>

          {/* Section 11 */}
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-deep-navy dark:text-white">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-electric/10 text-xs font-bold text-electric">
                11
              </span>
              Limitation of Liability
            </h2>
            <p className="text-sm leading-relaxed text-deep-navy/80 dark:text-white/80">
              To the maximum extent permitted by applicable law, in no event shall the platform, its developer, or
              infrastructure providers be liable for any indirect, incidental, consequential, special, or punitive damages,
              including lost profits, lost data, service interruptions, or business disruptions arising out of or related
              to your use of the platform, even if advised of the possibility of such damages.
            </p>
          </section>

          {/* Section 12 */}
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-deep-navy dark:text-white">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-electric/10 text-xs font-bold text-electric">
                12
              </span>
              Changes to Terms
            </h2>
            <p className="text-sm leading-relaxed text-deep-navy/80 dark:text-white/80">
              We may update these Terms periodically to reflect product updates, legal requirements, or operational changes.
              When updates occur, the updated &quot;Effective Date&quot; at the top of this page will be revised. Continued
              use of the platform after updates become effective constitutes acceptance of the revised Terms.
            </p>
          </section>

          {/* Section 13: Contact */}
          <section className="space-y-3 border-t border-black/5 pt-6 dark:border-white/10">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-deep-navy dark:text-white">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-electric/10 text-xs font-bold text-electric">
                13
              </span>
              Contact Us
            </h2>
            <p className="text-sm leading-relaxed text-deep-navy/80 dark:text-white/80">
              For any questions regarding these Terms of Service or your workspace account, please reach out directly
              to the platform developer:
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
