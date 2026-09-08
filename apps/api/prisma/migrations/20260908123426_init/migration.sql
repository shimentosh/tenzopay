-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING_VERIFICATION', 'ACTIVE', 'FROZEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'FINANCE', 'RISK', 'SUPPORT');

-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('NOT_STARTED', 'PENDING_REVIEW', 'PENDING_DOCUMENT', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "LedgerAccountKind" AS ENUM ('USER_AVAILABLE', 'USER_HELD', 'SYSTEM_DEPOSIT_CLEARING', 'SYSTEM_CARD_SETTLEMENT', 'SYSTEM_FEE_REVENUE', 'SYSTEM_ADJUSTMENT');

-- CreateEnum
CREATE TYPE "LedgerTransactionType" AS ENUM ('DEPOSIT_PENDING', 'DEPOSIT_CONFIRMED', 'DEPOSIT_REVERSED', 'CARD_AUTHORIZATION', 'CARD_AUTHORIZATION_REVERSAL', 'CARD_SETTLEMENT', 'CARD_REFUND', 'FEE', 'ADMIN_ADJUSTMENT');

-- CreateEnum
CREATE TYPE "LedgerDirection" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "BlockchainNetwork" AS ENUM ('ETHEREUM_MAINNET', 'ETHEREUM_SEPOLIA');

-- CreateEnum
CREATE TYPE "DepositAddressStatus" AS ENUM ('ACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "DepositStatus" AS ENUM ('PENDING', 'DETECTED', 'CONFIRMING', 'CONFIRMED', 'FAILED', 'ORPHANED');

-- CreateEnum
CREATE TYPE "DepositSource" AS ENUM ('ONCHAIN', 'DEMO');

-- CreateEnum
CREATE TYPE "CardStatus" AS ENUM ('ACTIVE', 'FROZEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "SpendLimitDuration" AS ENUM ('TRANSACTION', 'DAILY', 'MONTHLY', 'ANNUALLY', 'FOREVER');

-- CreateEnum
CREATE TYPE "CardRuleType" AS ENUM ('VELOCITY_LIMIT', 'CONDITIONAL_ACTION');

-- CreateEnum
CREATE TYPE "CardRuleState" AS ENUM ('DRAFT', 'SHADOWING', 'ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "CardTransactionStatus" AS ENUM ('PENDING', 'SETTLED', 'DECLINED', 'REVERSED', 'EXPIRED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "AuthorizationDecision" AS ENUM ('APPROVED', 'INSUFFICIENT_FUNDS', 'VELOCITY_EXCEEDED', 'CARD_PAUSED', 'CARD_CLOSED', 'UNAUTHORIZED_MERCHANT', 'SUSPECTED_FRAUD', 'ERROR');

-- CreateEnum
CREATE TYPE "WebhookProvider" AS ENUM ('LITHIC', 'ALCHEMY');

-- CreateEnum
CREATE TYPE "WebhookStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED', 'DEAD_LETTER', 'SKIPPED');

-- CreateEnum
CREATE TYPE "FeeType" AS ENUM ('DEPOSIT', 'CARD_ISSUANCE', 'FX', 'MONTHLY');

-- CreateEnum
CREATE TYPE "AdminActionType" AS ENUM ('LEDGER_ADJUSTMENT', 'FREEZE_USER', 'UNFREEZE_USER', 'FREEZE_CARD', 'CLOSE_CARD', 'RETRY_DEPOSIT_RECONCILIATION', 'REPLAY_WEBHOOK', 'KYC_OVERRIDE');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('DEPOSIT_CONFIRMED', 'DEPOSIT_DETECTED', 'CARD_CREATED', 'CARD_FROZEN', 'TRANSACTION_DECLINED', 'KYC_UPDATE', 'SECURITY');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "phoneNumber" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "emailVerifiedAt" TIMESTAMP(3),
    "verificationToken" TEXT,
    "resetToken" TEXT,
    "resetTokenExpires" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "replacedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'SUPPORT',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_holders" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "providerName" TEXT NOT NULL DEFAULT 'lithic',
    "providerAccountHolderToken" TEXT,
    "providerAccountToken" TEXT,
    "status" "KycStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "statusReasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "workflow" TEXT,
    "governmentIdHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_holders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kyc_records" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" "KycStatus" NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'lithic',
    "reasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rawResult" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kyc_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallets" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USDT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_accounts" (
    "id" UUID NOT NULL,
    "kind" "LedgerAccountKind" NOT NULL,
    "userId" UUID,
    "currency" TEXT NOT NULL DEFAULT 'USDT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_transactions" (
    "id" UUID NOT NULL,
    "type" "LedgerTransactionType" NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "description" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" UUID NOT NULL,
    "transactionId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "direction" "LedgerDirection" NOT NULL,
    "amount" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USDT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deposit_addresses" (
    "id" UUID NOT NULL,
    "walletId" UUID NOT NULL,
    "network" "BlockchainNetwork" NOT NULL,
    "address" TEXT NOT NULL,
    "derivationIndex" INTEGER NOT NULL,
    "status" "DepositAddressStatus" NOT NULL DEFAULT 'ACTIVE',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "registeredWithProvider" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deposit_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deposits" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "addressId" UUID,
    "network" "BlockchainNetwork" NOT NULL,
    "amount" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USDT',
    "status" "DepositStatus" NOT NULL DEFAULT 'PENDING',
    "source" "DepositSource" NOT NULL DEFAULT 'ONCHAIN',
    "txHash" TEXT,
    "logIndex" INTEGER,
    "fromAddress" TEXT,
    "toAddress" TEXT,
    "contractAddress" TEXT,
    "blockNumber" BIGINT,
    "confirmations" INTEGER NOT NULL DEFAULT 0,
    "requiredConfirmations" INTEGER NOT NULL DEFAULT 12,
    "detectedAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "ledgerTransactionId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deposits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blockchain_transactions" (
    "id" UUID NOT NULL,
    "network" "BlockchainNetwork" NOT NULL,
    "txHash" TEXT NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "blockHash" TEXT,
    "fromAddress" TEXT NOT NULL,
    "toAddress" TEXT NOT NULL,
    "contractAddress" TEXT NOT NULL,
    "rawValue" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw" JSONB,

    CONSTRAINT "blockchain_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cards" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "providerName" TEXT NOT NULL DEFAULT 'lithic',
    "providerCardToken" TEXT NOT NULL,
    "providerAccountToken" TEXT,
    "lastFour" TEXT NOT NULL,
    "expMonth" TEXT NOT NULL,
    "expYear" TEXT NOT NULL,
    "network" TEXT NOT NULL DEFAULT 'VISA',
    "cardType" TEXT NOT NULL DEFAULT 'VIRTUAL',
    "status" "CardStatus" NOT NULL DEFAULT 'ACTIVE',
    "spendLimit" BIGINT,
    "spendLimitDuration" "SpendLimitDuration" NOT NULL DEFAULT 'MONTHLY',
    "dailyLimit" BIGINT,
    "monthlyLimit" BIGINT,
    "perTransactionLimit" BIGINT,
    "lastSyncedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "card_rules" (
    "id" UUID NOT NULL,
    "cardId" UUID NOT NULL,
    "providerRuleToken" TEXT,
    "type" "CardRuleType" NOT NULL DEFAULT 'VELOCITY_LIMIT',
    "state" "CardRuleState" NOT NULL DEFAULT 'DRAFT',
    "period" TEXT NOT NULL,
    "limitAmount" BIGINT,
    "limitCount" INTEGER,
    "parameters" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "card_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "card_transactions" (
    "id" UUID NOT NULL,
    "cardId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "providerTransactionToken" TEXT NOT NULL,
    "status" "CardTransactionStatus" NOT NULL DEFAULT 'PENDING',
    "amount" BIGINT NOT NULL,
    "settledAmount" BIGINT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "merchantName" TEXT,
    "merchantCategory" TEXT,
    "mcc" TEXT,
    "merchantCountry" TEXT,
    "networkResult" TEXT,
    "declineReason" TEXT,
    "authorizedAt" TIMESTAMP(3),
    "settledAt" TIMESTAMP(3),
    "holdLedgerTransactionId" UUID,
    "settleLedgerTransactionId" UUID,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "card_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "authorization_events" (
    "id" UUID NOT NULL,
    "transactionId" UUID,
    "providerEventToken" TEXT NOT NULL,
    "cardToken" TEXT NOT NULL,
    "userId" UUID,
    "amount" BIGINT NOT NULL,
    "decision" "AuthorizationDecision" NOT NULL,
    "reason" TEXT,
    "availableBalanceAtDecision" BIGINT,
    "latencyMs" INTEGER,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "authorization_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" UUID NOT NULL,
    "provider" "WebhookProvider" NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "WebhookStatus" NOT NULL DEFAULT 'RECEIVED',
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "userId" UUID,
    "requestHash" TEXT NOT NULL,
    "response" JSONB,
    "statusCode" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fees" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "FeeType" NOT NULL,
    "amount" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USDT',
    "ledgerTransactionId" UUID,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "adminUserId" UUID,
    "actorType" TEXT NOT NULL DEFAULT 'SYSTEM',
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_actions" (
    "id" UUID NOT NULL,
    "adminUserId" UUID NOT NULL,
    "type" "AdminActionType" NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "amount" BIGINT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_verificationToken_key" ON "users"("verificationToken");

-- CreateIndex
CREATE UNIQUE INDEX "users_resetToken_key" ON "users"("resetToken");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE INDEX "users_createdAt_idx" ON "users"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_refreshTokenHash_key" ON "sessions"("refreshTokenHash");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "sessions_expiresAt_idx" ON "sessions"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_email_key" ON "admin_users"("email");

-- CreateIndex
CREATE INDEX "admin_users_role_idx" ON "admin_users"("role");

-- CreateIndex
CREATE UNIQUE INDEX "account_holders_userId_key" ON "account_holders"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "account_holders_providerAccountHolderToken_key" ON "account_holders"("providerAccountHolderToken");

-- CreateIndex
CREATE UNIQUE INDEX "account_holders_providerAccountToken_key" ON "account_holders"("providerAccountToken");

-- CreateIndex
CREATE INDEX "kyc_records_userId_createdAt_idx" ON "kyc_records"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "wallets_userId_key" ON "wallets"("userId");

-- CreateIndex
CREATE INDEX "ledger_accounts_userId_idx" ON "ledger_accounts"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_accounts_kind_userId_currency_key" ON "ledger_accounts"("kind", "userId", "currency");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_transactions_idempotencyKey_key" ON "ledger_transactions"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ledger_transactions_type_createdAt_idx" ON "ledger_transactions"("type", "createdAt");

-- CreateIndex
CREATE INDEX "ledger_entries_accountId_createdAt_idx" ON "ledger_entries"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "ledger_entries_transactionId_idx" ON "ledger_entries"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "deposit_addresses_network_address_key" ON "deposit_addresses"("network", "address");

-- CreateIndex
CREATE UNIQUE INDEX "deposit_addresses_walletId_network_key" ON "deposit_addresses"("walletId", "network");

-- CreateIndex
CREATE UNIQUE INDEX "deposit_addresses_network_derivationIndex_key" ON "deposit_addresses"("network", "derivationIndex");

-- CreateIndex
CREATE UNIQUE INDEX "deposits_ledgerTransactionId_key" ON "deposits"("ledgerTransactionId");

-- CreateIndex
CREATE INDEX "deposits_userId_status_idx" ON "deposits"("userId", "status");

-- CreateIndex
CREATE INDEX "deposits_status_createdAt_idx" ON "deposits"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "deposits_network_txHash_logIndex_key" ON "deposits"("network", "txHash", "logIndex");

-- CreateIndex
CREATE INDEX "blockchain_transactions_toAddress_idx" ON "blockchain_transactions"("toAddress");

-- CreateIndex
CREATE UNIQUE INDEX "blockchain_transactions_network_txHash_logIndex_key" ON "blockchain_transactions"("network", "txHash", "logIndex");

-- CreateIndex
CREATE UNIQUE INDEX "cards_providerCardToken_key" ON "cards"("providerCardToken");

-- CreateIndex
CREATE INDEX "cards_userId_status_idx" ON "cards"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "card_rules_providerRuleToken_key" ON "card_rules"("providerRuleToken");

-- CreateIndex
CREATE INDEX "card_rules_cardId_idx" ON "card_rules"("cardId");

-- CreateIndex
CREATE UNIQUE INDEX "card_transactions_providerTransactionToken_key" ON "card_transactions"("providerTransactionToken");

-- CreateIndex
CREATE INDEX "card_transactions_userId_createdAt_idx" ON "card_transactions"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "card_transactions_cardId_createdAt_idx" ON "card_transactions"("cardId", "createdAt");

-- CreateIndex
CREATE INDEX "card_transactions_status_idx" ON "card_transactions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "authorization_events_providerEventToken_key" ON "authorization_events"("providerEventToken");

-- CreateIndex
CREATE INDEX "authorization_events_cardToken_createdAt_idx" ON "authorization_events"("cardToken", "createdAt");

-- CreateIndex
CREATE INDEX "webhook_events_status_receivedAt_idx" ON "webhook_events"("status", "receivedAt");

-- CreateIndex
CREATE INDEX "webhook_events_eventType_idx" ON "webhook_events"("eventType");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_provider_eventId_key" ON "webhook_events"("provider", "eventId");

-- CreateIndex
CREATE INDEX "idempotency_keys_createdAt_idx" ON "idempotency_keys"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_scope_key_key" ON "idempotency_keys"("scope", "key");

-- CreateIndex
CREATE UNIQUE INDEX "fees_ledgerTransactionId_key" ON "fees"("ledgerTransactionId");

-- CreateIndex
CREATE INDEX "fees_userId_createdAt_idx" ON "fees"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_adminUserId_createdAt_idx" ON "audit_logs"("adminUserId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "admin_actions_adminUserId_createdAt_idx" ON "admin_actions"("adminUserId", "createdAt");

-- CreateIndex
CREATE INDEX "admin_actions_type_createdAt_idx" ON "admin_actions"("type", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_userId_readAt_idx" ON "notifications"("userId", "readAt");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_holders" ADD CONSTRAINT "account_holders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_records" ADD CONSTRAINT "kyc_records_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "ledger_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit_addresses" ADD CONSTRAINT "deposit_addresses_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "deposit_addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cards" ADD CONSTRAINT "cards_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_rules" ADD CONSTRAINT "card_rules_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_transactions" ADD CONSTRAINT "card_transactions_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "authorization_events" ADD CONSTRAINT "authorization_events_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "card_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_actions" ADD CONSTRAINT "admin_actions_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
