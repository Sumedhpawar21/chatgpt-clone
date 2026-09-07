import { db } from "../configs/db.config.js";
import { envConfig } from "../configs/env.config.js";
import { googleClient } from "../configs/google.config.js";
import type { User } from "../generated/prisma/client.js";
import jwt from "jsonwebtoken";

export const loginService = async (id_token: string) => {
  const ticket = await googleClient.verifyIdToken({
    idToken: id_token,
    audience: envConfig.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();

  let user = await db.user.findUnique({
    where: {
      email: payload?.email || "",
    },
  });
  if (!user) {
    user = await db.user.create({
      data: {
        email: payload?.email || "",
        name: payload?.name || "",
        avatar: payload?.picture || "",
      },
    });
    const smallestPlan = await db.plans.findFirst({
      orderBy: {
        max_messages: "asc",
      },
    });
    await db.subscriptions.create({
      data: {
        usage: 0,
        planId: String(smallestPlan?.id || ""),
        userId: user.id,
      },
    });
  } else {
    const existingSubscription = await db.subscriptions.findUnique({
      where: { userId: user.id },
    });

    if (!existingSubscription) {
      const smallestPlan = await db.plans.findFirst({
        orderBy: {
          max_messages: "asc",
        },
      });

      if (smallestPlan) {
        await db.subscriptions.create({
          data: {
            usage: 0,
            planId: smallestPlan.id,
            userId: user.id,
          },
        });
      }
    }
  }
  const token = generateToken(user);
  return { user, token };
};

function generateToken(user: User) {
  return jwt.sign(
    { userId: user.id, name: user.name, email: user.email },
    envConfig.JWT_SECRET,
    { expiresIn: "7d" },
  );
}
export async function getProfileService(userId: string) {
  return await db.user.findUnique({
    where: {
      id: userId,
    },
    include: {
      subscriptions: {
        select: {
          usage: true,
          plan: {
            select: {
              name: true,
              max_messages: true
            }
          }
        }
      }
    },
  });
}
