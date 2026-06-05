import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto, RegisterDepartmentDto, RegisterDto } from './dto/login.dto';
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
        role: Role.DEPT_USER,
        departmentId: dto.departmentId,
      },
    });

    return this.issueSession(user);
  }

  async registerDepartment(dto: RegisterDepartmentDto) {
    const departmentName = dto.departmentName.trim();
    const email = dto.email.toLowerCase();
    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) throw new ConflictException('Email is already registered');

    const existingDepartment = await this.prisma.department.findFirst({
      where: { name: { equals: departmentName, mode: 'insensitive' } },
    });
    if (existingDepartment) throw new ConflictException('Department is already registered');

    const departmentCode = await this.uniqueDepartmentCode(
      dto.departmentCode?.trim() || departmentName,
    );
    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.$transaction(async (tx) => {
      const department = await tx.department.create({
        data: {
          name: departmentName,
          code: departmentCode,
          active: true,
        },
      });

      return tx.user.create({
        data: {
          email,
          name: dto.name.trim(),
          passwordHash,
          role: Role.DEPT_USER,
          departmentId: department.id,
        },
      });
    });

    return this.issueSession(user);
  }

  private async uniqueDepartmentCode(raw: string) {
    const base =
      raw
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 18) || 'DEPT';
    let candidate = base;
    let suffix = 2;
    while (await this.prisma.department.findUnique({ where: { code: candidate } })) {
      candidate = `${base.slice(0, 15)}-${suffix}`;
      suffix += 1;
    }
    return candidate;
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
