import { Role } from '@prisma/client';
export declare class LoginDto {
    email: string;
    password: string;
    departmentId: string;
}
export declare class RegisterDto {
    name: string;
    email: string;
    password: string;
    departmentId: string;
    role: Role;
}
