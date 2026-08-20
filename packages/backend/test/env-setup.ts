/**
 * Deterministic, test-only secrets for the e2e suite.
 *
 * Jest's `setupFiles` (configured in jest-e2e.json) runs this once per test
 * FILE, before the test framework and any test code executes — critically,
 * before `createTestApp()` (test/utils/test-app.ts) compiles the real
 * `AppModule` via `ConfigModule.forRoot({ isGlobal: true })`. Since
 * `@nestjs/config`'s dotenv-based loading never overrides a value already
 * present in `process.env`, setting these here (unconditionally, before
 * that loading happens) means they always win for the e2e run, regardless
 * of what a developer's own `packages/backend/.env` happens to contain —
 * e2e tests are meant to be hermetic and reproducible on any machine or CI
 * runner, not dependent on (or accidentally exercising) whatever secret a
 * personal `.env` happens to have. This is also what makes "deterministic"
 * true in the strict sense: the same fixed values every run, everywhere,
 * never silently substituted by whatever's lying around locally.
 *
 * For DATABASE_URL/DIRECT_DATABASE_URL specifically, the unconditional
 * override matters even more: it guarantees e2e tests can never end up
 * running their destructive create/delete operations against whatever
 * database a developer's personal `.env` happens to point at (which could
 * be a real local dev database with data they care about) — they always
 * target the one dedicated, disposable `waplatform_test` database, no
 * matter what else is configured.
 *
 * This is what actually fixes the reported failures: e2e tests failed
 * during Nest app startup because JWT_ACCESS_SECRET and DATABASE_URL were
 * undefined, and WHATSAPP_APP_SECRET being undefined made
 * WhatsappSignatureGuard fail closed (by design) on every webhook test,
 * which is why those tests were skipping rather than running.
 *
 * These are fixed, checked-into-git, throwaway strings — not secrets in
 * any real sense, and MUST NEVER be used outside this test run. Nothing
 * about this file weakens JwtStrategy or WhatsappSignatureGuard: both still
 * fail closed if their secret is unset in a real environment (see
 * jwt.strategy.ts and whatsapp-signature.guard.ts) — this file's only job
 * is to make sure that in the e2e environment specifically, it never is.
 *
 * SECRETS_ENCRYPTION_KEY is included even though it wasn't one of the three
 * named in the task: CryptoService.onModuleInit() also fails closed if it's
 * unset or under 32 characters (see crypto.service.ts), and WhatsappModule
 * (which the webhook e2e tests exercise) depends on CryptoService. Without
 * this, app startup would still fail during the e2e run, just on a
 * different missing secret — found this while inspecting app startup per
 * the task's own instruction to inspect ConfigModule initialization; see
 * TEST_ENV_FIX_REPORT.md for the full explanation.
 */
process.env.JWT_ACCESS_SECRET = 'e2e_test_jwt_access_secret__do_not_use_outside_tests__32chars';
process.env.JWT_REFRESH_SECRET = 'e2e_test_jwt_refresh_secret__do_not_use_outside_tests__32char';
process.env.WHATSAPP_APP_SECRET = 'e2e_test_whatsapp_app_secret__do_not_use_outside_tests';
process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = 'e2e_test_webhook_verify_token__do_not_use_outside_tests';
process.env.SECRETS_ENCRYPTION_KEY = 'e2e_test_secrets_encryption_key__do_not_use_outside_tests_32c';

/**
 * Same deterministic value as prisma/.env — kept as two files rather than
 * one because they're read by two different processes that don't share
 * environment: prisma/.env is auto-loaded by the Prisma CLI (the
 * `pretest:e2e` migration-deploy step, a separate OS process), while this
 * file only affects the Jest/Nest process that actually runs the tests.
 * Points at a dedicated `waplatform_test` database on the project's
 * existing docker-compose Postgres (see docker-compose.yml), never the
 * regular "waplatform" dev database — e2e tests create/delete real rows
 * (users, orgs, contacts...) and must never do that against a database a
 * developer might actually be looking at. See TEST_DATABASE_REPORT.md for
 * the one-time setup command to create this database.
 */
process.env.DATABASE_URL = 'postgresql://waplatform:waplatform@127.0.0.1:5433/waplatform_test?schema=public';
process.env.DIRECT_DATABASE_URL = 'postgresql://waplatform:waplatform@127.0.0.1:5433/waplatform_test?schema=public';
