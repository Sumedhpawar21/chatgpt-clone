-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "bonus_messages" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "usage" SET DEFAULT 0;
