import { AuthService } from './auth.service';
import { LoginDto, RegisterDto } from './dto/login.dto';
export declare class AuthController {
    private auth;
    constructor(auth: AuthService);
    login(dto: LoginDto): Promise<{
        accessToken: string;
        user: {
            id: string;
            email: string;
            name: string;
            role: string;
            departmentId: string | null;
        };
    }>;
    register(dto: RegisterDto): Promise<{
        accessToken: string;
        user: {
            id: string;
            email: string;
            name: string;
            role: string;
            departmentId: string | null;
        };
    }>;
    me(req: {
        user: unknown;
    }): unknown;
}
