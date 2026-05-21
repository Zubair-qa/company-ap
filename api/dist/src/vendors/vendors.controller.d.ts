import { PrismaService } from '../prisma/prisma.service';
import { CreateVendorDto } from './dto/create-vendor.dto';
export declare class VendorsController {
    private prisma;
    constructor(prisma: PrismaService);
    list(): import(".prisma/client").Prisma.PrismaPromise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        taxNumber: string | null;
        displayName: string;
        legalName: string | null;
        kind: string;
        active: boolean;
    }[]>;
    create(dto: CreateVendorDto): import(".prisma/client").Prisma.Prisma__VendorClient<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        taxNumber: string | null;
        displayName: string;
        legalName: string | null;
        kind: string;
        active: boolean;
    }, never, import("@prisma/client/runtime/library").DefaultArgs>;
}
