import { db } from "../configs/db.config.js";
import type { AuthUser } from "../middlewares/auth.middleware.js";

type SubscriptionWithPlan = {
  usage: number;
  plan: {
    max_messages: number;
  };
};

export function getRemainingMessages(
  subscription: SubscriptionWithPlan | null | undefined
) {
  if (!subscription) return 0;
  return Math.max(0, subscription.plan.max_messages - subscription.usage);
}

export function hasReachedMessageLimit(
  subscription: SubscriptionWithPlan | null | undefined
) {
  if (!subscription) return true;
  if (subscription.plan.max_messages <= 0) return false;
  return subscription.usage >= subscription.plan.max_messages;
}

export async function getSubscriptionUsageService(user: AuthUser) {
  const subscription = await db.subscriptions.findFirst({
    where: {
      userId: user.userId,
    },
    select: {
      usage: true,
      plan: {
        select: {
          max_messages: true,
          name: true,
        },
      },
    },
  });

  if (!subscription) {
    return null;
  }

  const remaining_messages = getRemainingMessages(subscription);

  return {
    ...subscription,
    remaining_messages,
  };
}

export async function applyPlanChangeWithCreditCarryover(
  userId: string,
  newPlanId: string
) {
  const existing = await db.subscriptions.findUnique({
    where: { userId },
    include: {
      plan: {
        select: {
          max_messages: true,
        },
      },
    },
  });

  const remaining = existing
    ? Math.max(0, existing.plan.max_messages - existing.usage)
    : 0;

  return db.subscriptions.upsert({
    where: { userId },
    create: {
      usage: 0,
      planId: newPlanId,
      userId,
    },
    update: {
      usage: -remaining,
      planId: newPlanId,
    },
  });
}

export async function incrementSubscriptionUsage(userId: string) {
  return db.subscriptions.update({
    where: { userId },
    data: { usage: { increment: 1 } },
  });
}
