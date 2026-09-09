import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from '@tenzopay/shared';
import { AuthService, type TokenPair } from './auth.service';
import { AdminAuthService } from './admin-auth.service';
import {
  ACCESS_COOKIE,
  ADMIN_ACCESS_COOKIE,
  CurrentUser,
  JwtAuthGuard,
  Public,
  REFRESH_COOKIE,
  type RequestUser,
} from './guards';
import { zodPipe } from '../common/zod-validation.pipe';
import type { AppConfig } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { UnauthorizedError } from '../common/errors';

/**
 * Auth endpoints.
 *
 * Tokens are delivered as httpOnly cookies, never in the response body, so
 * XSS cannot exfiltrate a session. SameSite=lax blocks the cross-site form
 * POST that CSRF depends on while still allowing normal top-level navigation.
 */
@Controller('auth')
@UseGuards(JwtAuthGuard)
export class AuthController {
  private readonly config: AppConfig;

  constructor(
    private readonly auth: AuthService,
    private readonly adminAuth: AdminAuthService,
    private readonly prisma: PrismaService,
    configService: ConfigService<{ app: AppConfig }, true>,
  ) {
    this.config = configService.get('app', { infer: true });
  }

  private cookieOptions(maxAgeMs: number): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.auth.cookieSecure,
      sameSite: 'lax',
      domain: this.config.auth.cookieDomain,
      path: '/',
      maxAge: maxAgeMs,
    };
  }

  private setUserCookies(res: Response, tokens: TokenPair): void {
    res.cookie(ACCESS_COOKIE, tokens.accessToken, this.cookieOptions(15 * 60_000));
    res.cookie(
      REFRESH_COOKIE,
      tokens.refreshToken,
      this.cookieOptions(tokens.refreshExpiresAt.getTime() - Date.now()),
    );
  }

  private context(req: Request) {
    return {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    };
  }

  // ------------------------------------------------------------------------

  @Public()
  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async register(
    @Body(zodPipe(registerSchema)) body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const input = body as Parameters<AuthService['register']>[0];
    const result = await this.auth.register(input, this.context(req));
    this.setUserCookies(res, result.tokens);

    return {
      user: result.user,
      // No mail transport is configured, so the token is surfaced in
      // development to make the flow testable. Never in production.
      verificationToken: this.config.isProduction ? undefined : result.verificationToken,
    };
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async login(
    @Body(zodPipe(loginSchema)) body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login(
      body as Parameters<AuthService['login']>[0],
      this.context(req),
    );
    this.setUserCookies(res, result.tokens);
    return { user: result.user };
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (!token) throw new UnauthorizedError();

    const tokens = await this.auth.refresh(token, this.context(req));
    this.setUserCookies(res, tokens);
    return { ok: true };
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE]);
    res.clearCookie(ACCESS_COOKIE, { path: '/', domain: this.config.auth.cookieDomain });
    res.clearCookie(REFRESH_COOKIE, { path: '/', domain: this.config.auth.cookieDomain });
    return { ok: true };
  }

  @Get('me')
  async me(@CurrentUser() user: RequestUser) {
    const record = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        status: true,
        emailVerifiedAt: true,
        createdAt: true,
        accountHolder: { select: { status: true, statusReasons: true } },
      },
    });

    /**
     * Staff link, for people who hold both a customer account and a console
     * account under the same address.
     *
     * This is a NAVIGATION HINT AND NOTHING ELSE. It confers no permission:
     * the console lives on its own origin, requires its own password, and
     * issues its own cookie (`tenzo_admin_access`). Nothing here lets the
     * customer app act as staff.
     *
     * Matching on email rather than on the presence of an admin cookie is
     * deliberate — cookies are not shared once the two apps sit on different
     * domains in production, and the link needs to work there too.
     *
     * The disclosure is bounded: only the authenticated owner of the customer
     * account ever sees it, and all they learn is that their own address also
     * has console access.
     */
    const staff = await this.prisma.adminUser.findUnique({
      where: { email: record.email },
      select: { role: true, isActive: true },
    });

    return {
      ...record,
      kycStatus: record.accountHolder?.status ?? 'NOT_STARTED',
      kycReasons: record.accountHolder?.statusReasons ?? [],
      staffAccess:
        staff && staff.isActive
          ? { role: staff.role, consoleUrl: this.config.adminUrl }
          : null,
    };
  }

  @Public()
  @Post('verify-email')
  @HttpCode(200)
  async verifyEmail(@Body() body: { token?: string }) {
    await this.auth.verifyEmail(String(body.token ?? ''));
    return { ok: true };
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(200)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  async forgotPassword(@Body(zodPipe(forgotPasswordSchema)) body: { email: string }) {
    const result = await this.auth.requestPasswordReset(body.email);
    // Always the same response, whether or not the account exists.
    return {
      ok: true,
      resetToken: this.config.isProduction ? undefined : result.token,
    };
  }

  @Public()
  @Post('reset-password')
  @HttpCode(200)
  async resetPassword(
    @Body(zodPipe(resetPasswordSchema)) body: { token: string; password: string },
  ) {
    await this.auth.resetPassword(body.token, body.password);
    return { ok: true };
  }

  @Post('logout-all')
  @HttpCode(200)
  async logoutAll(@CurrentUser() user: RequestUser) {
    await this.auth.logoutAll(user.id);
    return { ok: true };
  }

  // ------------------------------------------------------- Admin session ----

  @Public()
  @Post('admin/login')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async adminLogin(
    @Body(zodPipe(loginSchema)) body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.adminAuth.login(
      body as Parameters<AdminAuthService['login']>[0],
      req.ip,
    );

    res.cookie(ADMIN_ACCESS_COOKIE, result.accessToken, this.cookieOptions(30 * 60_000));
    return { admin: result.admin };
  }

  @Public()
  @Post('admin/logout')
  @HttpCode(200)
  async adminLogout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(ADMIN_ACCESS_COOKIE, {
      path: '/',
      domain: this.config.auth.cookieDomain,
    });
    return { ok: true };
  }
}
