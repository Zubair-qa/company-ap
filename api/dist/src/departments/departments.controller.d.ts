import { PrismaService } from '../prisma/prisma.service';
export declare class DepartmentsController {
    private prisma;
    constructor(prisma: PrismaService);
    list(): import(".prisma/client").Prisma.PrismaPromise<{
        id: string;
        name: string;
    }[]>;
}
