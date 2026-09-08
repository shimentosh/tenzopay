import { Inject, Injectable, Logger } from '@nestjs/common';
import { KycStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CARD_PROVIDER, type CardProvider } from '../providers/card-provider.interface';
import { AppError } from '../common/errors';
import { sha256Hex } from '../common/crypto.util';
import type { KycSubmitInput } from '@tenzopay/shared';

/**
 * KYC via Lithic Account Holders.
 *
 * Notes:
 *  - The government ID is sent to Lithic and then discarded. We keep only a
 *    salted-by-nothing SHA-256 for duplicate detection; storing the raw value
 *    would create a breach liability for no product benefit.
 *  - Lithic sandbox returns ACCEPTED synchronously for KYC_BASIC (verified).
 *    Production is asynchronous and arrives via `account_holder.verification`.
 *  - Submitting twice is idempotent: an existing account holder is re-read
 *    rather than re-created, since a duplicate holder cannot be undone.
 */
@Injectable()
export class KycService {
  private readonly logger = new Logger(KycService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CARD_PROVIDER) private readonly cardProvider: CardProvider,
  ) {}

  async getStatus(userId: string) {
    const holder = await this.prisma.accountHolder.findUnique({
      where: { userId },
      select: { status: true, statusReasons: true, updatedAt: true },
    });

    return {
      status: holder?.status ?? KycStatus.NOT_STARTED,
      reasons: holder?.statusReasons ?? [],
      updatedAt: holder?.updatedAt ?? null,
    };
  }

  async submit(userId: string, input: KycSubmitInput) {
    const existing = await this.prisma.accountHolder.findUnique({
      where: { userId },
    });

    if (existing?.status === KycStatus.ACCEPTED) {
      return { status: existing.status, reasons: existing.statusReasons };
    }

    // Already submitted and awaiting a decision — re-read rather than resubmit.
    if (existing?.providerAccountHolderToken) {
      const refreshed = await this.cardProvider.getAccountHolder(
        existing.providerAccountHolderToken,
      );
      return this.persist(userId, existing.id, refreshed);
    }

    const providerResult = await this.cardProvider.createAccountHolder({
      firstName: input.firstName,
      lastName: input.lastName,
      dob: input.dob,
      email: input.email,
      phoneNumber: input.phoneNumber,
      governmentId: input.governmentId,
      address: {
        address1: input.address1,
        address2: input.address2,
        city: input.city,
        state: input.state,
        postalCode: input.postalCode,
        country: input.country,
      },
      // Stable per user, so a retried submit cannot create a second holder.
      idempotencyKey: `kyc:${userId}`,
    });

    const holder = await this.prisma.accountHolder.upsert({
      where: { userId },
      create: {
        userId,
        providerName: this.cardProvider.name,
        providerAccountHolderToken: providerResult.accountHolderToken,
        providerAccountToken: providerResult.accountToken,
        status: this.mapStatus(providerResult.status),
        statusReasons: providerResult.statusReasons,
        workflow: 'KYC_BASIC',
        governmentIdHash: sha256Hex(input.governmentId),
      },
      update: {
        providerAccountHolderToken: providerResult.accountHolderToken,
        providerAccountToken: providerResult.accountToken,
        status: this.mapStatus(providerResult.status),
        statusReasons: providerResult.statusReasons,
      },
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        phoneNumber: input.phoneNumber,
      },
    });

    await this.recordHistory(userId, holder.status, providerResult.statusReasons, providerResult);

    this.logger.log(`KYC submitted for user ${userId}: ${holder.status}`);
    return { status: holder.status, reasons: holder.statusReasons };
  }

  /** Applies an inbound `account_holder.verification` webhook. */
  async applyProviderUpdate(params: {
    accountHolderToken: string;
    status: string;
    statusReasons?: string[];
  }): Promise<void> {
    const holder = await this.prisma.accountHolder.findUnique({
      where: { providerAccountHolderToken: params.accountHolderToken },
      select: { id: true, userId: true },
    });

    if (!holder) {
      this.logger.warn(
        `Verification webhook for unknown account holder ${params.accountHolderToken}`,
      );
      return;
    }

    const status = this.mapStatus(params.status);

    await this.prisma.accountHolder.update({
      where: { id: holder.id },
      data: { status, statusReasons: params.statusReasons ?? [] },
    });

    await this.recordHistory(holder.userId, status, params.statusReasons ?? [], params);
    this.logger.log(`KYC updated for user ${holder.userId}: ${status}`);
  }

  private async persist(
    userId: string,
    holderId: string,
    result: { status: string; statusReasons: string[] },
  ) {
    const status = this.mapStatus(result.status);
    await this.prisma.accountHolder.update({
      where: { id: holderId },
      data: { status, statusReasons: result.statusReasons },
    });
    await this.recordHistory(userId, status, result.statusReasons, result);
    return { status, reasons: result.statusReasons };
  }

  private async recordHistory(
    userId: string,
    status: KycStatus,
    reasons: string[],
    raw: unknown,
  ): Promise<void> {
    await this.prisma.kycRecord.create({
      data: {
        userId,
        status,
        provider: this.cardProvider.name,
        reasons,
        // Raw provider payloads can contain PII; keep only status-level fields.
        rawResult: this.sanitize(raw) as Prisma.InputJsonValue,
      },
    });
  }

  private sanitize(raw: unknown): Record<string, unknown> {
    if (!raw || typeof raw !== 'object') return {};
    const r = raw as Record<string, unknown>;
    return {
      status: r.status,
      statusReasons: r.statusReasons ?? r.status_reasons,
      accountHolderToken: r.accountHolderToken ?? r.token,
    };
  }

  private mapStatus(status: string): KycStatus {
    switch ((status ?? '').toUpperCase()) {
      case 'ACCEPTED':
        return KycStatus.ACCEPTED;
      case 'REJECTED':
        return KycStatus.REJECTED;
      case 'PENDING_DOCUMENT':
        return KycStatus.PENDING_DOCUMENT;
      case 'PENDING_REVIEW':
        return KycStatus.PENDING_REVIEW;
      default:
        return KycStatus.PENDING_REVIEW;
    }
  }
}
