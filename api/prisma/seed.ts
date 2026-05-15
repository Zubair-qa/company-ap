import { PrismaClient, Role, VendorKind } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('changeme123', 10);

  const engineering = await prisma.department.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Engineering',
    },
  });

  const finance = await prisma.department.upsert({
    where: { id: '00000000-0000-0000-0000-000000000002' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000002',
      name: 'Finance',
    },
  });

  await prisma.user.upsert({
    where: { email: 'admin@demo.local' },
    update: {},
    create: {
      email: 'admin@demo.local',
      name: 'Company Admin',
      passwordHash,
      role: Role.COMPANY_ADMIN,
    },
  });

  await prisma.user.upsert({
    where: { email: 'ap@demo.local' },
    update: {},
    create: {
      email: 'ap@demo.local',
      name: 'AP Clerk',
      passwordHash,
      role: Role.AP_CLERK,
      departmentId: finance.id,
    },
  });

  await prisma.user.upsert({
    where: { email: 'eng-admin@demo.local' },
    update: {},
    create: {
      email: 'eng-admin@demo.local',
      name: 'Engineering Dept Admin',
      passwordHash,
      role: Role.DEPT_ADMIN,
      departmentId: engineering.id,
    },
  });

  await prisma.vendor.upsert({
    where: { id: '10000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '10000000-0000-0000-0000-000000000001',
      displayName: 'CloudHost Ltd',
      legalName: 'CloudHost Limited',
      taxNumber: 'NTN-1234567',
      kind: VendorKind.RECURRING,
    },
  });

  await prisma.vendor.upsert({
    where: { id: '10000000-0000-0000-0000-000000000002' },
    update: {},
    create: {
      id: '10000000-0000-0000-0000-000000000002',
      displayName: 'Ad-hoc Consultant',
      kind: VendorKind.ONE_OFF,
    },
  });

  console.log('Seed complete. Demo password for all users: changeme123');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
