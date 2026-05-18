"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcrypt = __importStar(require("bcrypt"));
const prisma = new client_1.PrismaClient();
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
            role: client_1.Role.COMPANY_ADMIN,
            departmentId: admin.id,
        },
        create: {
            email: 'admin@demo.local',
            name: 'Company Admin',
            passwordHash,
            role: client_1.Role.COMPANY_ADMIN,
            departmentId: admin.id,
        },
    });
    const apClerk = await prisma.user.upsert({
        where: { email: 'ap@demo.local' },
        update: {
            name: 'AP Clerk',
            passwordHash,
            role: client_1.Role.AP_CLERK,
            departmentId: finance.id,
        },
        create: {
            email: 'ap@demo.local',
            name: 'AP Clerk',
            passwordHash,
            role: client_1.Role.AP_CLERK,
            departmentId: finance.id,
        },
    });
    await prisma.user.upsert({
        where: { email: 'eng-admin@demo.local' },
        update: {
            name: 'Engineering Dept Admin',
            passwordHash,
            role: client_1.Role.DEPT_ADMIN,
            departmentId: engineering.id,
        },
        create: {
            email: 'eng-admin@demo.local',
            name: 'Engineering Dept Admin',
            passwordHash,
            role: client_1.Role.DEPT_ADMIN,
            departmentId: engineering.id,
        },
    });
    await prisma.user.upsert({
        where: { email: 'finance-admin@demo.local' },
        update: {
            name: 'Finance Dept Admin',
            passwordHash,
            role: client_1.Role.DEPT_ADMIN,
            departmentId: finance.id,
        },
        create: {
            email: 'finance-admin@demo.local',
            name: 'Finance Dept Admin',
            passwordHash,
            role: client_1.Role.DEPT_ADMIN,
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
            kind: client_1.VendorKind.RECURRING,
        },
    });
    const consultant = await prisma.vendor.upsert({
        where: { id: '10000000-0000-0000-0000-000000000002' },
        update: {},
        create: {
            id: '10000000-0000-0000-0000-000000000002',
            displayName: 'Ad-hoc Consultant',
            kind: client_1.VendorKind.ONE_OFF,
        },
    });
    const demoInvoices = [
        {
            id: '20000000-0000-0000-0000-000000000001',
            reference: 'FIN-2026-104',
            amountPkr: '185000',
            description: 'Monthly cloud hosting retainer',
            status: client_1.InvoiceStatus.AWAITING_APPROVAL,
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
            status: client_1.InvoiceStatus.APPROVED,
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
            status: client_1.InvoiceStatus.VENDOR_UNVERIFIED,
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
            status: client_1.InvoiceStatus.VENDOR_VERIFIED,
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
            status: client_1.InvoiceStatus.PAID,
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
            amountPkr: new client_1.Prisma.Decimal(invoice.amountPkr),
            description: invoice.description,
            status: invoice.status,
            departmentId: invoice.departmentId,
            submittedById: invoice.submittedById,
            vendorId: invoice.vendorId,
            dueDate: invoice.dueDate,
            extracted: invoice.extracted,
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
//# sourceMappingURL=seed.js.map