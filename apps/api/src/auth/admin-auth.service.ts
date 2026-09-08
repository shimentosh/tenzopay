import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import type { AppConfig } from '../config/configuration';
import { UnauthorizedError } from '../common/errors';
import type { LoginInput } from '@tenzopay/shared';

/**
 * Admin authentication — deliberately separate from user auth.
 *
 * Different table, different token `type` claim, different cookie, and served
 * to a different origin. A stolen customer session is useless here, and the
 * guards reject a user token presented to an admin route because the claim
 * type will not match.
 *
 * Admin access tokens are short (30 min) and there is no refresh rotation:
 * staff re-authenticate. That is a deliberate trade of convenience for blast
 * radius.
 */
@Injectable()
export class AdminAuthService {
  private readonly logger = new Logger(AdminAuthService.name);
  private readonly config: AppConfig;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    configService: ConfigService<{ app: AppConfig }, true>,
  ) {
    this.config = configService.get('app', { infer: true });
  }

  async login(input: LoginInput, ip?: string) {
    const admin = await this.prisma.adminUser.findUnique({
      where: { email: input.email },
    });

    const hash = admin?.passwordHash ?? (await this.dummyHash());
    let valid = false;
    try {
      valid = await argon2.verify(hash, input.password);
    } catch {
      valid = false;
    }

    if (!admin || !valid || !admin.isActive) {
      this.logger.warn(
        `Failed admin login attempt for ${input.email.slice(0, 3)}*** from ${ip ?? 'unknown'}`,
      );
      throw new UnauthorizedError('Incorrect email or password.');
    }

    await this.prisma.adminUser.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    });

    const accessToken = await this.jwt.signAsync(
      { sub: admin.id, type: 'admin', role: admin.role },
      { secret: this.config.auth.accessSecret, expiresIn: '30m' },
    );

    await this.prisma.auditLog.create({
      data: {
        adminUserId: admin.id,
        actorType: 'ADMIN',
        actorId: admin.id,
        action: 'ADMIN_LOGIN',
        entityType: 'AdminUser',
        entityId: admin.id,
        ipAddress: ip,
      },
    });

    this.logger.log(`Admin ${admin.id} (${admin.role}) signed in`);

    return {
      admin: {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
      },
      accessToken,
    };
  }

  private dummyHashCache: string | null = null;
  private async dummyHash(): Promise<string> {
    if (!this.dummyHashCache) {
      this.dummyHashCache = await argon2.hash('invalid-placeholder-password', {
        type: argon2.argon2id,
        memoryCost: 19_456,
        timeCost: 2,
        parallelism: 1,
      });
    }
    return this.dummyHashCache;
  }
}
