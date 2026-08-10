import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await argon2.hash('ChangeMe123!');

  const org = await prisma.organization.upsert({
    where: { slug: 'demo-company' },
    update: {},
    create: {
      name: 'Demo Company',
      slug: 'demo-company',
      timezone: 'Asia/Kolkata',
      theme: 'AUTO',
    },
  });

  const owner = await prisma.user.upsert({
    where: { email: 'owner@demo.com' },
    update: {},
    create: {
      email: 'owner@demo.com',
      passwordHash,
      firstName: 'Demo',
      lastName: 'Owner',
      role: 'OWNER',
      organizationId: org.id,
    },
  });

  await prisma.organizationMember.upsert({
    where: { userId_organizationId: { userId: owner.id, organizationId: org.id } },
    update: {},
    create: { userId: owner.id, organizationId: org.id, role: 'OWNER' },
  });

  await prisma.tag.upsert({
    where: { organizationId_name: { organizationId: org.id, name: 'VIP' } },
    update: {},
    create: { name: 'VIP', color: '#0A84FF', organizationId: org.id },
  });

  await prisma.messageTemplate.upsert({
    where: {
      organizationId_name_language: {
        organizationId: org.id,
        name: 'welcome_message',
        language: 'en_US',
      },
    },
    update: {},
    create: {
      organizationId: org.id,
      name: 'welcome_message',
      category: 'UTILITY',
      language: 'en_US',
      bodyText: 'Hi {{first_name}}, welcome to {{company}}! We are glad to have you.',
      variables: ['first_name', 'company'],
      waStatus: 'DRAFT',
    },
  });

  // eslint-disable-next-line no-console
  console.log(`Seeded organization "${org.name}" with owner ${owner.email} / ChangeMe123!`);
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
