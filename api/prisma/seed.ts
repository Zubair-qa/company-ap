import { Prisma, PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { InvoiceStatus, Role, VendorKind, encodeJson } from '../src/common/domain';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('changeme123', 10);

  const admin = await prisma.department.upsert({
    where: { id: '00000000-0000-0000-0000-000000000003' },
    update: { name: 'Admin' },
    create: {
      id: '00000000-0000-0000-0000-000000000003',
      name: 'Admin',
    },
  });

  const engineering = await prisma.department.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: { name: 'Engineering' },
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Engineering',
    },
  });

  const finance = await prisma.department.upsert({
    where: { id: '00000000-0000-0000-0000-000000000002' },
    update: { name: 'Finance' },
    create: {
      id: '00000000-0000-0000-0000-000000000002',
      name: 'Finance',
    },
  });

  const companyAdmin = await prisma.user.upsert({
    where: { email: 'admin@demo.local' },
    update: {
      name: 'Company Admin',
      passwordHash,
      role: Role.COMPANY_ADMIN,
      departmentId: admin.id,
    },
    create: {
      email: 'admin@demo.local',
      name: 'Company Admin',
      passwordHash,
      role: Role.COMPANY_ADMIN,
      departmentId: admin.id,
    },
  });

  const apClerk = await prisma.user.upsert({
    where: { email: 'ap@demo.local' },
    update: {
      name: 'AP Clerk',
      passwordHash,
      role: Role.AP_CLERK,
      departmentId: finance.id,
    },
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
    update: {
      name: 'Engineering Dept Admin',
      passwordHash,
      role: Role.DEPT_ADMIN,
      departmentId: engineering.id,
    },
    create: {
      email: 'eng-admin@demo.local',
      name: 'Engineering Dept Admin',
      passwordHash,
      role: Role.DEPT_ADMIN,
      departmentId: engineering.id,
    },
  });

  await prisma.user.upsert({
    where: { email: 'finance-admin@demo.local' },
    update: {
      name: 'Finance Dept Admin',
      passwordHash,
      role: Role.DEPT_ADMIN,
      departmentId: finance.id,
    },
    create: {
      email: 'finance-admin@demo.local',
      name: 'Finance Dept Admin',
      passwordHash,
      role: Role.DEPT_ADMIN,
      departmentId: finance.id,
    },
  });

  const cloudHost = await prisma.vendor.upsert({
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

  const consultant = await prisma.vendor.upsert({
    where: { id: '10000000-0000-0000-0000-000000000002' },
    update: {},
    create: {
      id: '10000000-0000-0000-0000-000000000002',
      displayName: 'Ad-hoc Consultant',
      kind: VendorKind.ONE_OFF,
    },
  });

  const demoInvoices = [
    {
      id: '20000000-0000-0000-0000-000000000001',
      reference: 'FIN-2026-104',
      amountPkr: '185000',
      description: 'Monthly cloud hosting retainer',
      status: InvoiceStatus.AWAITING_APPROVAL,
      departmentId: finance.id,
      submittedById: apClerk.id,
      vendorId: cloudHost.id,
      dueDate: new Date('2026-05-28T00:00:00.000Z'),
      extracted: {
        vendorName: 'CloudHost Ltd',
        vendorTaxNumber: 'NTN-1234567',
        reference: 'FIN-2026-104',
        amountPkr: 185000,
      },
    },
    {
      id: '20000000-0000-0000-0000-000000000002',
      reference: 'ENG-2026-088',
      amountPkr: '425000',
      description: 'Infrastructure expansion milestone',
      status: InvoiceStatus.APPROVED,
      departmentId: engineering.id,
      submittedById: apClerk.id,
      vendorId: cloudHost.id,
      dueDate: new Date('2026-06-03T00:00:00.000Z'),
      extracted: {
        vendorName: 'CloudHost Ltd',
        vendorTaxNumber: 'NTN-1234567',
        reference: 'ENG-2026-088',
        amountPkr: 425000,
      },
    },
    {
      id: '20000000-0000-0000-0000-000000000003',
      reference: 'ADM-2026-014',
      amountPkr: '62000',
      description: 'Office systems support',
      status: InvoiceStatus.VENDOR_UNVERIFIED,
      departmentId: admin.id,
      submittedById: companyAdmin.id,
      vendorId: null,
      dueDate: new Date('2026-05-25T00:00:00.000Z'),
      extracted: {
        vendorName: 'Office Pro Services',
        reference: 'ADM-2026-014',
        amountPkr: 62000,
      },
    },
    {
      id: '20000000-0000-0000-0000-000000000004',
      reference: 'FIN-2026-109',
      amountPkr: '94000',
      description: 'Quarterly compliance review',
      status: InvoiceStatus.VENDOR_VERIFIED,
      departmentId: finance.id,
      submittedById: apClerk.id,
      vendorId: consultant.id,
      dueDate: new Date('2026-06-10T00:00:00.000Z'),
      extracted: {
        vendorName: 'Ad-hoc Consultant',
        reference: 'FIN-2026-109',
        amountPkr: 94000,
      },
    },
    {
      id: '20000000-0000-0000-0000-000000000005',
      reference: 'ENG-2026-091',
      amountPkr: '145000',
      description: 'Prototype review workshop',
      status: InvoiceStatus.PAID,
      departmentId: engineering.id,
      submittedById: apClerk.id,
      vendorId: consultant.id,
      dueDate: new Date('2026-05-16T00:00:00.000Z'),
      extracted: {
        vendorName: 'Ad-hoc Consultant',
        reference: 'ENG-2026-091',
        amountPkr: 145000,
      },
    },
  ];

  for (const invoice of demoInvoices) {
    const data = {
      reference: invoice.reference,
      amountPkr: new Prisma.Decimal(invoice.amountPkr),
      description: invoice.description,
      status: invoice.status,
      departmentId: invoice.departmentId,
      submittedById: invoice.submittedById,
      vendorId: invoice.vendorId,
      dueDate: invoice.dueDate,
      extracted: encodeJson(invoice.extracted),
    };

    await prisma.invoice.upsert({
      where: { id: invoice.id },
      update: data,
      create: {
        id: invoice.id,
        ...data,
      },
    });
  }

  console.log('Seed complete. Demo password for all users: changeme123');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
