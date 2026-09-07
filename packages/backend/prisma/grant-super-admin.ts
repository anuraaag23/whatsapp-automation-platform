/**
 * The ONLY controlled path for granting/revoking platform Super Admin
 * access. There is deliberately no API endpoint, UI toggle, or migration
 * that sets User.isSuperAdmin — that would make privilege escalation a
 * remote-reachable surface. This must be run manually, by someone who
 * already has direct database access (i.e. is already trusted), against
 * DATABASE_URL from the environment it's run in.
 *
 * Usage:
 *   npx ts-node --transpile-only -P prisma/tsconfig.seed.json prisma/grant-super-admin.ts you@example.com
 *   npx ts-node --transpile-only -P prisma/tsconfig.seed.json prisma/grant-super-admin.ts you@example.com --revoke
 *
 * Or via the package.json script:
 *   npm run super-admin:grant -- you@example.com
 *   npm run super-admin:grant -- you@example.com --revoke
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2];
  const revoke = process.argv.includes('--revoke');

  if (!email || !email.includes('@')) {
    console.error('Usage: grant-super-admin.ts <email> [--revoke]');
    process.exitCode = 1;
    return;
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`No user found with email ${email}`);
    process.exitCode = 1;
    return;
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { isSuperAdmin: !revoke },
  });

  console.log(
    `${updated.email} is ${updated.isSuperAdmin ? 'now' : 'no longer'} a Super Admin.`,
  );
  console.log('This takes effect on their very next API request — JwtStrategy re-reads the User row from the database on every request rather than trusting a cached JWT claim, so no logout/login is needed.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
