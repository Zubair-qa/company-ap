import { Role } from '../../common/domain';
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
