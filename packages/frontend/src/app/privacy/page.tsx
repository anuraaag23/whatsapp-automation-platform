import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Shield, Mail } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Privacy Policy — WhatsApp Business Automation Platform',
  description:
    'Privacy Policy for the WhatsApp Business Automation Platform explaining data collection, usage, WhatsApp Cloud API processing, and user rights.',
};

export default function PrivacyPolicyPage() {
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
              <Shield size={28} />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-deep-navy dark:text-white sm:text-3xl">
                Privacy Policy
              </h1>
              <p className="mt-1 text-sm text-deep-navy/70 dark:text-white/70">
                WhatsApp Business Automation Platform
              </p>
            </div>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-deep-navy/80 dark:text-white/80">
            This Privacy Policy explains how the WhatsApp Business Automation Platform (&quot;we&quot;,
            &quot;our&quot;, or &quot;the platform&quot;) collects, uses, processes, and safeguards information
            when you access or use our multi-tenant WhatsApp messaging, automation, campaign, and
            analytics software. We are committed to transparency and treating your business data and
            customer interactions with high standards of security and responsibility.
          </p>
        </div>

        {/* Policy Body */}
        <div className="space-y-8 rounded-3xl border border-white/40 bg-white/75 p-6 shadow-glass backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.04] dark:shadow-glass-dark sm:p-10">
          {/* Section 1 */}
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-deep-navy dark:text-white">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-electric/10 text-xs font-bold text-electric">
                1
              </span>
              Information We Collect
            </h2>
            <p className="text-sm leading-relaxed text-deep-navy/80 dark:text-white/80">
              In order to provide our automation and messaging services, we process information in the
              following categories:
            </p>
            <ul className="list-inside list-disc space-y-2 text-sm text-deep-navy/80 dark:text-white/80">
              <li>
                <strong className="text-deep-navy dark:text-white">Account &amp; User Credentials:</strong>{' '}
                Names, email addresses, securely salted and hashed passwords (via Argon2), user roles, and
                session identifiers when administrators or users register and authenticate.
              </li>
              <li>
                <strong className="text-deep-navy dark:text-white">Organization &amp; Workspace Data:</strong>{' '}
                Workspace names, member rosters, user preferences, notification settings, and operational configurations.
              </li>
              <li>
                <strong className="text-deep-navy dark:text-white">WhatsApp Business Configuration:</strong>{' '}
                Identifiers required to interface with Meta&apos;s WhatsApp Cloud API, including your WhatsApp
                Business Account ID (WABA ID), Phone Number ID, display phone number, verified name, and encrypted API access tokens.
              </li>
              <li>
                <strong className="text-deep-navy dark:text-white">Customer Contacts &amp; Messaging Data:</strong>{' '}
                Contact phone numbers, first/last names, opt-in/consent records, inbound and outbound WhatsApp message content,
                message delivery receipts (sent, delivered, read statuses), conversation threads, and template interaction logs.
              </li>
              <li>
                <strong className="text-deep-navy dark:text-white">Technical &amp; Operational Telemetry:</strong>{' '}
                IP addresses, user-agent details, system health metrics, API endpoint access timestamps, and inbound webhook
                delivery headers required to maintain system reliability, rate limits, and audit logs.
              </li>
            </ul>
          </section>

          {/* Section 2 */}
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-deep-navy dark:text-white">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-electric/10 text-xs font-bold text-electric">
                2
              </span>
              How We Use Information
            </h2>
            <p className="text-sm leading-relaxed text-deep-navy/80 dark:text-white/80">
              We process information solely for legitimate operational and business purposes, including:
            </p>
            <ul className="list-inside list-disc space-y-2 text-sm text-deep-navy/80 dark:text-white/80">
              <li>Authenticating users and isolating data within organization boundaries.</li>
              <li>
                Executing WhatsApp automation workflows, keyword responses, scheduled broadcasts, and customer conversation inbox features.
              </li>
              <li>
                Ingesting and verifying inbound webhook notifications sent by Meta via HMAC-SHA256 signature validation.
              </li>
              <li>
                Maintaining conversation history, delivery tracking, read receipts, and campaign performance analytics.
              </li>
              <li>
                Preventing abuse, enforcing rate limits, diagnosing server errors, and ensuring high platform availability.
              </li>
              <li>Responding to user technical support inquiries and troubleshooting integration challenges.</li>
            </ul>
          </section>

          {/* Section 3 */}
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-deep-navy dark:text-white">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-electric/10 text-xs font-bold text-electric">
                3
              </span>
              WhatsApp &amp; Meta Cloud API Integration
            </h2>
            <p className="text-sm leading-relaxed text-deep-navy/80 dark:text-white/80">
              The platform interfaces with Meta Platforms, Inc. via the official WhatsApp Business Cloud API:
            </p>
            <ul className="list-inside list-disc space-y-2 text-sm text-deep-navy/80 dark:text-white/80">
              <li>
                WhatsApp message data, media, and status notifications are transmitted through Meta&apos;s Cloud API servers
                in compliance with Meta&apos;s WhatsApp Business Terms of Service and Developer Policies.
              </li>
              <li>
                We process WhatsApp and Meta data exclusively to deliver the functionality requested by the tenant
                (e.g., displaying conversations, executing automated flows, dispatching outbound templates).
              </li>
              <li>
                We do not access or use WhatsApp conversation data for commercial profiling, unsolicited marketing,
                or any purpose outside the explicit operation of your connected account.
              </li>
            </ul>
          </section>

          {/* Section 4 */}
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-deep-navy dark:text-white">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-electric/10 text-xs font-bold text-electric">
                4
              </span>
              Data Sharing &amp; Third Parties
            </h2>
            <p className="text-sm leading-relaxed text-deep-navy/80 dark:text-white/80">
              We respect the confidentiality of your workspace and customer data:
            </p>
            <ul className="list-inside list-disc space-y-2 text-sm text-deep-navy/80 dark:text-white/80">
              <li>
                <strong className="text-deep-navy dark:text-white">No Sale of Personal Data:</strong> We do not sell,
                rent, monetize, or trade your personal data or your customer communications to third parties or advertising brokers.
              </li>
              <li>
                <strong className="text-deep-navy dark:text-white">Infrastructure &amp; Hosting Partners:</strong> Data is
                processed on secure cloud infrastructure providers necessary to host the backend application, PostgreSQL database,
                and background queue systems.
              </li>
              <li>
                <strong className="text-deep-navy dark:text-white">Legal Obligations:</strong> We will only disclose
                information if strictly required by law, subpoena, or valid legal process, or to prevent immediate physical harm or fraud.
              </li>
            </ul>
          </section>

          {/* Section 5 */}
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-deep-navy dark:text-white">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-electric/10 text-xs font-bold text-electric">
                5
              </span>
              Data Retention
            </h2>
            <p className="text-sm leading-relaxed text-deep-navy/80 dark:text-white/80">
              We retain account details, contact profiles, and message logs for as long as your workspace account remains
              active and configured on the platform. When a WhatsApp account is disconnected or an organization requests
              account closure, associated webhook logs and stored messages can be removed upon written request to the
              system administrator.
            </p>
          </section>

          {/* Section 6 */}
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-deep-navy dark:text-white">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-electric/10 text-xs font-bold text-electric">
                6
              </span>
              Security Safeguards
            </h2>
            <p className="text-sm leading-relaxed text-deep-navy/80 dark:text-white/80">
              We maintain technical and administrative controls designed to protect information from unauthorized access, loss,
              or alteration:
            </p>
            <ul className="list-inside list-disc space-y-2 text-sm text-deep-navy/80 dark:text-white/80">
              <li>All web traffic is transmitted via HTTPS with TLS encryption.</li>
              <li>Inbound Meta webhooks are verified cryptographically via HMAC-SHA256 signatures before being processed.</li>
              <li>Sensitive third-party access tokens and API keys are stored encrypted at rest using AES-256-GCM.</li>
              <li>Database queries are strictly scoped by organization ID to enforce tenant data isolation.</li>
            </ul>
            <p className="text-xs text-deep-navy/60 dark:text-white/60">
              Please note: While we deploy robust protections, no method of transmission over the internet or method of
              electronic storage is 100% impenetrable. We encourage all users to use strong passwords and protect their login credentials.
            </p>
          </section>

          {/* Section 7 */}
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-deep-navy dark:text-white">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-electric/10 text-xs font-bold text-electric">
                7
              </span>
              Your Rights &amp; Data Deletion Requests
            </h2>
            <p className="text-sm leading-relaxed text-deep-navy/80 dark:text-white/80">
              You have the right to review, update, export, or request the deletion of your personal and organization data.
              If you wish to request the deletion of your account, contact records, or connected WhatsApp credentials, please
              submit a request to our administrative contact email below. We will handle verifiable requests in a timely manner.
            </p>
          </section>

          {/* Section 8 */}
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-deep-navy dark:text-white">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-electric/10 text-xs font-bold text-electric">
                8
              </span>
              Policy Updates
            </h2>
            <p className="text-sm leading-relaxed text-deep-navy/80 dark:text-white/80">
              We may update this Privacy Policy periodically to reflect enhancements to our features, operational changes,
              or regulatory updates. Any changes will be posted on this page with an updated &quot;Effective Date&quot; at the top.
            </p>
          </section>

          {/* Section 9: Contact */}
          <section className="space-y-3 border-t border-black/5 pt-6 dark:border-white/10">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-deep-navy dark:text-white">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-electric/10 text-xs font-bold text-electric">
                9
              </span>
              Contact Us
            </h2>
            <p className="text-sm leading-relaxed text-deep-navy/80 dark:text-white/80">
              For any questions regarding this Privacy Policy, your data, or to submit a data deletion or correction request,
              please reach out directly to the platform developer:
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
          <p>&copy; {new Date().getFullYear()} WhatsApp Business Automation Platform. All rights reserved.</p>
        </div>
      </div>
    </main>
  );
}
