import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto, RegisterDto } from './dto/login.dto';
import { JwtPayload } from './jwt.strategy';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (!user) throw new UnauthorizedException('Invalid credentials');
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    if (user.departmentId !== dto.departmentId) {
      throw new UnauthorizedException('Invalid department for this user');
    }

    return this.issueSession(user);
  }

  async register(dto: RegisterDto) {
    const department = await this.prisma.department.findUnique({
      where: { id: dto.departmentId },
    });
    if (!department) throw new BadRequestException('Invalid department');

    const email = dto.email.toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('Email is already registered');

    const user = await this.prisma.user.create({
      data: {
        email,
        name: dto.name.trim(),
        passwordHash: await bcrypt.hash(dto.password, 10),
        role: dto.role,
        departmentId: dto.departmentId,
      },
    });

    return this.issueSession(user);
  }

  private async issueSession(user: {
    id: string;
    email: string;
    name: string;
    role: string;
    departmentId: string | null;
  }) {
    const payload: JwtPayload = { sub: user.id, email: user.email };
    return {
      accessToken: await this.jwt.signAsync(payload),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        departmentId: user.departmentId,
      },
    };
  }
}
