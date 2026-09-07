import { toTextStream } from "ai";
import { db } from "../configs/db.config.js";
import { getMessagesService, sendMessageService } from "../services/message.service.js";
import {
  getSubscriptionUsageService,
  hasReachedMessageLimit,
} from "../services/subscription.service.js";
import { asyncHandler } from "../utils/async.handler.util.js";
import { AppError } from "../utils/error.handler.util.js";
import type { Chats } from "../generated/prisma/client.js";

export const getMessages = asyncHandler(async (req, res) => {
    const user = req.user!
    const chatId = String(req.params.chatId);
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.max(Number(req.query.limit) || 10, 1);

    const chat = await db.chats.findFirst({
        where: {
            id: chatId,
            userId: user.userId,
        },
    });

    if (!chat) {
        throw new AppError("Chat not found", 404);
    }

    const where = {
        chatId: chatId
    }
    const { messages, messageCount, hasMore } = await getMessagesService(page, limit, where);

    return res.status(200).json({
        success: true, message: "messages fetched Successfully", data: {
            messages,
            pagination: {
                page,
                limit,
                total: messageCount,
                hasMore,
            },
        },
    })
})

export const sendMessages = asyncHandler(async (req, res) => {
    const user = req.user!
    let { user_message, chatId } = req.body

    if (!String(user_message || "").trim()) {
        throw new AppError("Message cannot be empty", 400);
    }

    const usage = await getSubscriptionUsageService(user)
    if (hasReachedMessageLimit(usage)) {
        throw new AppError("max message limit reached", 403);
    }
    let chat: Chats
    if (!chatId) {
        chat = await db.chats.create({
            data: {
                userId: user.userId,
            },
        });

        chatId = chat.id;
    } else {
        const existingChat = await db.chats.findFirst({
            where: {
                id: chatId,
                userId: user.userId,
            },
        });

        if (!existingChat) {
            throw new AppError("Chat not found", 404);
        }

        chat = existingChat;
    }
    const result = await sendMessageService(
        chat,
        user_message,
        user,
    );

    res.setHeader("X-Chat-Id", chatId);

    res.setHeader(
        "Content-Type",
        "text/plain; charset=utf-8",
    );

    res.setHeader(
        "Cache-Control",
        "no-cache",
    );

    res.setHeader(
        "Connection",
        "keep-alive",
    );

    const textStream = toTextStream(result);

    for await (const chunk of textStream) {
        res.write(chunk);
    }
    res.end();
})


