import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AccessTokenPayload } from '../../common/types/authenticated-user.js';
import { Prisma, type User } from '../../generated/prisma/client.js';
import { UserResponseDto } from '../users/dto/user.response.dto.js';
import { type CreateUserInput, UsersService } from '../users/users.service.js';
import type { AuthResponseDto } from './dto/auth.response.dto.js';
import type { LoginDto } from './dto/login.dto.js';
import type { RegisterDto } from './dto/register.dto.js';
import { EmailVerificationService } from './email-verification.service.js';
import { PasswordService } from './password.service.js';
import { RefreshTokenService } from './refresh-token.service.js';

const INVALID_CREDENTIALS = 'Invalid credentials';
const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly passwords: PasswordService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly jwt: JwtService,
    private readonly emailVerification: EmailVerificationService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const email = normalizeEmail(dto.email);
    if (await this.users.findByEmail(email)) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await this.passwords.hash(dto.password);
    const user = await this.createUser({
      name: dto.name.trim(),
      email,
      passwordHash,
    });
    await this.emailVerification.sendVerificationEmail(user);
    return this.createSession(user);
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.users.findByEmail(normalizeEmail(dto.email));
    const valid = user
      ? await this.passwords.verify(user.passwordHash, dto.password)
      : await this.passwords.verifyAgainstDummy(dto.password);
    if (!user || !valid) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    return this.createSession(user);
  }

  async refresh(refreshToken: string): Promise<AuthResponseDto> {
    const rotated = await this.refreshTokens.rotate(refreshToken);
    const user = await this.users.findById(rotated.userId);
    if (!user) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    return {
      user: UserResponseDto.fromEntity(user),
      accessToken: await this.signAccessToken(user),
      refreshToken: rotated.refreshToken,
    };
  }

  logout(refreshToken: string): Promise<void> {
    return this.refreshTokens.revoke(refreshToken);
  }

  async getProfile(userId: string): Promise<UserResponseDto> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new UnauthorizedException();
    }
    return UserResponseDto.fromEntity(user);
  }

  async createSession(user: User): Promise<AuthResponseDto> {
    return {
      user: UserResponseDto.fromEntity(user),
      accessToken: await this.signAccessToken(user),
      refreshToken: await this.refreshTokens.issue(user.id),
    };
  }

  private async createUser(input: CreateUserInput): Promise<User> {
    try {
      return await this.users.create(input);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === UNIQUE_CONSTRAINT_VIOLATION
      ) {
        throw new ConflictException('Email already registered');
      }
      throw error;
    }
  }

  private signAccessToken(user: User): Promise<string> {
    const payload: AccessTokenPayload = { sub: user.id, role: user.role };
    return this.jwt.signAsync(payload);
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
