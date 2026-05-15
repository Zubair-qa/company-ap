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
            role: client_1.Role.COMPANY_ADMIN,
        },
    });
    await prisma.user.upsert({
        where: { email: 'ap@demo.local' },
        update: {},
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
        update: {},
        create: {
            email: 'eng-admin@demo.local',
            name: 'Engineering Dept Admin',
            passwordHash,
            role: client_1.Role.DEPT_ADMIN,
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
            kind: client_1.VendorKind.RECURRING,
        },
    });
    await prisma.vendor.upsert({
        where: { id: '10000000-0000-0000-0000-000000000002' },
        update: {},
        create: {
            id: '10000000-0000-0000-0000-000000000002',
            displayName: 'Ad-hoc Consultant',
            kind: client_1.VendorKind.ONE_OFF,
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
//# sourceMappingURL=seed.js.map