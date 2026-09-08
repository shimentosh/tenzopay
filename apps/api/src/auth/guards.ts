import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { AdminRole, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AppConfig } from '../config/configuration';
import { ForbiddenError, KycRequiredError, UnauthorizedError } from '../common/errors';

export const ACCESS_COOKIE = 'tenzo_access';
export const REFRESH_COOKIE = 'tenzo_refresh';
export const ADMIN_ACCESS_COOKIE = 'tenzo_admin_access';

export interface RequestUser {
  id: string;
  email: string;
  status: UserStatus;
  kycAccepted: boolean;
}

export interface RequestAdmin {
  id: string;
  email: string;
  role: AdminRole;
}

declare module 'express' {
  interface Request {
    user?: RequestUser;
    admin?: RequestAdmin;
    requestId?: string;
  }
}

export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const REQUIRE_KYC = 'requireKyc';
/** Gate a route behind an ACCEPTED account holder. */
export const RequireKyc = () => SetMetadata(REQUIRE_KYC, true);

export const ROLES = 'roles';
export const Roles = (...roles: AdminRole[]) => SetMetadata(ROLES, roles);

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestUser => {
    const request = ctx.switchToHttp().getRequest<Request>();
    if (!request.user) throw new UnauthorizedError();
    return request.user;
  },
);

export const CurrentAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestAdmin => {
    const request = ctx.switchToHttp().getRequest<Request>();
    if (!request.admin) throw new UnauthorizedError();
    return request.admin;
  },
);

/**
 * Authenticates end users from the access cookie.
 *
 * The token is only an identity assertion — status and KYC are re-read from the
 * database on every request so that freezing an account takes effect
 * immediately rather than whenever the JWT happens to expire.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly config: AppConfig;

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
    configService: ConfigService<{ app: AppConfig }, true>,
  ) {
    this.config = configService.get('app', { infer: true });
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);
    if (!token) throw new UnauthorizedError();

    let payload: { sub: string; type?: string };
    try {
      payload = await this.jwt.verifyAsync(token, {
        secret: this.config.auth.accessSecret,
      });
    } catch {
      throw new UnauthorizedError('Your session has expired. Please sign in again.');
    }

    if (payload.type !== 'user') throw new UnauthorizedError();

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        status: true,
        accountHolder: { select: { status: true } },
      },
    });

    if (!user) throw new UnauthorizedError();

    if (user.status === UserStatus.FROZEN) {
      throw new ForbiddenError('This account is frozen. Please contact support.');
    }
    if (user.status === UserStatus.CLOSED) {
      throw new ForbiddenError('This account is closed.');
    }

    request.user = {
      id: user.id,
      email: user.email,
      status: user.status,
      kycAccepted: user.accountHolder?.status === 'ACCEPTED',
    };

    const requiresKyc = this.reflector.getAllAndOverride<boolean>(REQUIRE_KYC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (requiresKyc && !request.user.kycAccepted) throw new KycRequiredError();

    return true;
  }

  private extractToken(request: Request): string | null {
    const cookie = request.cookies?.[ACCESS_COOKIE];
    if (cookie) return cookie;

    // Bearer is accepted for API clients and integration tests.
    const header = request.headers.authorization;
    if (header?.startsWith('Bearer ')) return header.slice(7);
    return null;
  }
}

/** Authenticates admins and enforces @Roles(...). */
@Injectable()
export class AdminGuard implements CanActivate {
  private readonly config: AppConfig;

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
    configService: ConfigService<{ app: AppConfig }, true>,
  ) {
    this.config = configService.get('app', { infer: true });
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const token =
      request.cookies?.[ADMIN_ACCESS_COOKIE] ??
      (request.headers.authorization?.startsWith('Bearer ')
        ? request.headers.authorization.slice(7)
        : null);

    if (!token) throw new UnauthorizedError();

    let payload: { sub: string; type?: string };
    try {
      payload = await this.jwt.verifyAsync(token, {
        secret: this.config.auth.accessSecret,
      });
    } catch {
      throw new UnauthorizedError('Your session has expired. Please sign in again.');
    }

    if (payload.type !== 'admin') throw new UnauthorizedError();

    const admin = await this.prisma.adminUser.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, isActive: true },
    });

    if (!admin || !admin.isActive) throw new UnauthorizedError();

    request.admin = { id: admin.id, email: admin.email, role: admin.role };

    const requiredRoles = this.reflector.getAllAndOverride<AdminRole[]>(ROLES, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (requiredRoles?.length) {
      // SUPER_ADMIN implicitly satisfies every role requirement.
      const allowed =
        admin.role === AdminRole.SUPER_ADMIN || requiredRoles.includes(admin.role);
      if (!allowed) {
        throw new ForbiddenError(
          'Your role does not permit this action.',
        );
      }
    }

    return true;
  }
}
