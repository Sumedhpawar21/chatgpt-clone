import crypto from "crypto"
import { db } from "../configs/db.config.js"
import { envConfig } from "../configs/env.config.js"
import { razorpayClient } from "../configs/razorpay.config.js"
import { applyPlanChangeWithCreditCarryover } from "./subscription.service.js"
import type { AuthUser } from "../middlewares/auth.middleware.js"

function assertRazorpayConfigured() {
  if (!envConfig.RAZORPAY_KEY_ID || !envConfig.RAZORPAY_KEY_SECRET) {
    throw new RazorpayConfigError("Razorpay credentials are not configured")
  }
}

export class RazorpayConfigError extends Error {
  statusCode = 500
  constructor(message: string) {
    super(message)
    this.name = "RazorpayConfigError"
  }
}

export class RazorpayApiError extends Error {
  statusCode: number
  constructor(message: string, statusCode = 500) {
    super(message)
    this.name = "RazorpayApiError"
    this.statusCode = statusCode
  }
}

export async function createOrderService(
  user: AuthUser,
  input: {
    amount: number
    currency: string
    receipt?: string | undefined
    planId?: string | undefined
  }
) {
  assertRazorpayConfigured()

  if (input.planId) {
    const plan = await db.plans.findUnique({ where: { id: input.planId } })
    if (!plan) {
      throw new RazorpayApiError("Plan not found", 404)
    }
    if (plan.price <= 0) {
      throw new RazorpayApiError("This plan does not require payment", 400)
    }
  }

  try {
    const order = await razorpayClient.orders.create({
      amount: input.amount,
      currency: input.currency,
      receipt: input.receipt ?? `rcpt_${Date.now()}`,
      notes: {
        userId: user.userId,
        name: user.name,
        email: user.email,
        ...(input.planId ? { planId: input.planId } : {}),
      },
    })

    if (input.planId) {
      await db.payments.create({
        data: {
          amount: input.amount / 100,
          status: "PENDING",
          planId: input.planId,
          razorpayOrderId: order.id,
          userId: user.userId,
        },
      })
    }

    return {
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
    }
  } catch (error: unknown) {
    const err = error as { statusCode?: number; error?: { description?: string } }
    if (err?.statusCode === 401) {
      throw new RazorpayApiError("Razorpay authentication failed", 401)
    }
    throw new RazorpayApiError(
      err?.error?.description || "Failed to create Razorpay order",
      err?.statusCode || 500
    )
  }
}

export async function verifyPaymentService(
  razorpay_order_id: string,
  razorpay_payment_id: string,
  razorpay_signature: string
) {
  assertRazorpayConfigured()

  const sign = `${razorpay_order_id}|${razorpay_payment_id}`
  const expectedSignature = crypto
    .createHmac("sha256", envConfig.RAZORPAY_KEY_SECRET)
    .update(sign)
    .digest("hex")

  if (razorpay_signature !== expectedSignature) {
    return { success: false, message: "Payment verification failed" }
  }

  try {
    const paymentDetails = await razorpayClient.payments.fetch(razorpay_payment_id)

    if (
      paymentDetails.status !== "captured" &&
      paymentDetails.status !== "authorized"
    ) {
      await db.payments.updateMany({
        where: { razorpayOrderId: razorpay_order_id },
        data: { status: "FAIL" },
      })
      return { success: false, message: "Payment failed" }
    }

    const payment = await db.payments.update({
      where: { razorpayOrderId: razorpay_order_id },
      data: { status: "SUCCESS", paymentId: razorpay_payment_id },
    })

    await applyPlanChangeWithCreditCarryover(payment.userId, payment.planId)

    return { success: true, message: "Payment verified successfully" }
  } catch {
    return { success: false, message: "Payment verification failed" }
  }
}
