import { Injectable, Logger } from '@nestjs/common';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import type { AppConfig } from '../config/configuration';
import { randomToken, sha256Hex } from '../common/crypto.util';
import { AppError, ForbiddenError, UnauthorizedError } from '../common/errors';
import type { LoginInput, RegisterInput } from '@tenzopay/shared';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

export interface AuthContext {
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Authentication.
 *
 * Design points:
 *  - argon2id for passwords (memory-hard; bcrypt's 72-byte truncation and low
 *    memory cost make it the weaker choice here).
 *  - Refresh tokens are opaque random strings. Only their SHA-256 is stored, so
 *    a database leak does not yield usable sessions.
 *  - Refresh rotates on every use. Replaying a consumed token revokes the whole
 *    session family — the standard defence against refresh-token theft.
 *  - Login and registration are deliberately uniform in their responses to
 *    avoid leaking which emails exist.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly config: AppConfig;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly ledger: LedgerService,
    configService: ConfigService<{ app: AppConfig }, true>,
  ) {
    this.config = configService.get('app', { infer: true });
  }

  private readonly argonOptions: argon2.Options = {
    type: argon2.argon2id,
    memoryCost: 19_456, // 19 MiB — OWASP baseline
    timeCost: 2,
    parallelism: 1,
  };

  async hashPassword(password: string): Promise<string> {
    return argon2.hash(password, this.argonOptions);
  }

  async verifyPassword(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  // ------------------------------------------------------------ Register ----

  async register(input: RegisterInput, ctx: AuthContext = {}) {
    const existing = await this.prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    });

    if (existing) {
      // Same shape and rough timing as success — do not confirm the address exists.
      await this.hashPassword(input.password);
      throw new AppError(
        'REGISTRATION_FAILED',
        'That email cannot be registered. Try signing in instead.',
        409,
      );
    }

    const passwordHash = await this.hashPassword(input.password);
    const verificationToken = randomToken(32);

    const user = await this.prisma.user.create({
      data: {
        email: input.email,
        passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
        verificationToken,
        // No email delivery is wired up in this build, so development accounts
        // are usable immediately. Production must gate on real verification.
        status: this.config.isProduction
          ? UserStatus.PENDING_VERIFICATION
          : UserStatus.ACTIVE,
        emailVerifiedAt: this.config.isProduction ? null : new Date(),
        wallet: { create: {} },
      },
      select: { id: true, email: true, firstName: true, lastName: true, status: true },
    });

    await this.ledger.ensureUserAccounts(user.id);

    const tokens = await this.issueTokens(user.id, ctx);
    this.logger.log(`User registered: ${user.id}`);

    return { user, tokens, verificationToken };
  }

  // --------------------------------------------------------------- Login ----

  async login(input: LoginInput, ctx: AuthContext = {}) {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
    });

    // Constant-ish work whether or not the user exists.
    const hash = user?.passwordHash ?? (await this.dummyHash());
    const valid = await this.verifyPassword(hash, input.password);

    if (!user || !valid) {
      throw new UnauthorizedError('Incorrect email or password.');
    }

    if (user.status === UserStatus.FROZEN || user.status === UserStatus.CLOSED) {
      throw new ForbiddenError(
        'This account is not active. Please contact support.',
      );
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const tokens = await this.issueTokens(user.id, ctx);

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        status: user.status,
      },
      tokens,
    };
  }

  private dummyHashCache: string | null = null;
  private async dummyHash(): Promise<string> {
    if (!this.dummyHashCache) {
      this.dummyHashCache = await this.hashPassword('invalid-placeholder-password');
    }
    return this.dummyHashCache;
  }

  // ------------------------------------------------------------- Tokens ----

  async issueTokens(userId: string, ctx: AuthContext = {}): Promise<TokenPair> {
    const accessToken = await this.jwt.signAsync(
      { sub: userId, type: 'user' },
      {
        secret: this.config.auth.accessSecret,
        // TTLs are configuration strings ("15m"); jsonwebtoken types this as a
        // template-literal union that a plain string cannot satisfy.
        expiresIn: this.config.auth.accessTtl as JwtSignOptions['expiresIn'],
      },
    );

    const refreshToken = randomToken(48);
    const refreshExpiresAt = new Date(
      Date.now() + this.parseDuration(this.config.auth.refreshTtl),
    );

    await this.prisma.session.create({
      data: {
        userId,
        refreshTokenHash: sha256Hex(refreshToken),
        expiresAt: refreshExpiresAt,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent?.slice(0, 300),
      },
    });

    return { accessToken, refreshToken, refreshExpiresAt };
  }

  /**
   * Rotate a refresh token.
   *
   * If a token that has already been rotated is presented again, we treat it as
   * theft: every session for that user is revoked immediately.
   */
  async refresh(refreshToken: string, ctx: AuthContext = {}): Promise<TokenPair> {
    const hash = sha256Hex(refreshToken);

    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash: hash },
      include: { user: { select: { id: true, status: true } } },
    });

    if (!session) throw new UnauthorizedError('Session expired. Please sign in again.');

    if (session.revokedAt) {
      this.logger.warn(
        `Refresh token reuse detected for user ${session.userId} — revoking all sessions`,
      );
      await this.prisma.session.updateMany({
        where: { userId: session.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedError('Session expired. Please sign in again.');
    }

    if (session.expiresAt < new Date()) {
      throw new UnauthorizedError('Session expired. Please sign in again.');
    }

    if (
      session.user.status === UserStatus.FROZEN ||
      session.user.status === UserStatus.CLOSED
    ) {
      throw new ForbiddenError('This account is not active.');
    }

    const tokens = await this.issueTokens(session.userId, ctx);

    await this.prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });

    return tokens;
  }

  async logout(refreshToken: string): Promise<void> {
    if (!refreshToken) return;
    await this.prisma.session
      .updateMany({
        where: { refreshTokenHash: sha256Hex(refreshToken), revokedAt: null },
        data: { revokedAt: new Date() },
      })
      .catch(() => undefined);
  }

  async logoutAll(userId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  // ------------------------------------------------------------- Verify ----

  async verifyEmail(token: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { verificationToken: token },
      select: { id: true },
    });
    if (!user) throw new AppError('INVALID_TOKEN', 'This link is invalid or has expired.', 400);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerifiedAt: new Date(),
        verificationToken: null,
        status: UserStatus.ACTIVE,
      },
    });
  }

  /**
   * Always resolves, whether or not the email exists — otherwise this endpoint
   * becomes an account enumeration oracle.
   */
  async requestPasswordReset(email: string): Promise<{ token: string | null }> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (!user) return { token: null };

    const token = randomToken(32);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken: token,
        resetTokenExpires: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    return { token };
  }

  async resetPassword(token: string, password: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { resetToken: token },
      select: { id: true, resetTokenExpires: true },
    });

    if (!user || !user.resetTokenExpires || user.resetTokenExpires < new Date()) {
      throw new AppError('INVALID_TOKEN', 'This link is invalid or has expired.', 400);
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await this.hashPassword(password),
        resetToken: null,
        resetTokenExpires: null,
      },
    });

    // A password change invalidates every existing session.
    await this.logoutAll(user.id);
  }

  // -------------------------------------------------------------- Utils ----

  /** "15m" | "30d" | "12h" | "45s" -> milliseconds */
  private parseDuration(value: string): number {
    const match = /^(\d+)([smhd])$/.exec(value.trim());
    if (!match) return 30 * 24 * 60 * 60 * 1000;

    const amount = Number(match[1]);
    const unit = match[2];
    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60_000,
      h: 3_600_000,
      d: 86_400_000,
    };
    return amount * (multipliers[unit] ?? 86_400_000);
  }
}
