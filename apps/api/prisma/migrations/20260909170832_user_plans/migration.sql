-- CreateEnum
CREATE TYPE "UserPlan" AS ENUM ('STARTER', 'TEAM', 'BUSINESS');

-- AlterEnum
ALTER TYPE "AdminActionType" ADD VALUE 'PLAN_CHANGED';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "plan" "UserPlan" NOT NULL DEFAULT 'STARTER',
ADD COLUMN     "planDunningSince" TIMESTAMP(3);
