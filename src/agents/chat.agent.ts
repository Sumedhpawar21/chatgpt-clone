import { isStepCount, streamText, type ModelMessage } from "ai";
import type { Messages, User } from "../generated/prisma/client.js";
import { chatModel } from "../configs/ai.config.js";
import { generateMemories, getMemories, saveMemories } from "../services/rag.service.js";
import { incrementSubscriptionUsage } from "../services/subscription.service.js";
import { getUserMemoryTool } from "../tools/agent.tool.js";
import type { AuthUser } from "../middlewares/auth.middleware.js";
import { db } from "../configs/db.config.js";

export async function chatAgent(
    messages: Messages[],
    user: AuthUser,
    query: string,
    chatId: string
) {
    let memories: string[] = [];
    try {
        memories = await getMemories(user.userId, query);
    } catch (error) {
        console.error("Failed to fetch memories:", error);
    }

    const context = {
        SYSTEM_PROMPT: `You are AI assistant who understands user's messages. Use a warm and natural tone`,
        user: {
            name: user.name,
        },
        memories: memories,
        messages: messages.map((m) => {
            return {
                content: m.content,
                role: m.role === "AGENT" ? "assistant" : "user",
            } as ModelMessage;
        }),
    };
    await db.messages.create({
        data: {
            chatId,
            content: query,
            role: "User",
        },
    });
    return streamText({
        model: chatModel,
        instructions: context.SYSTEM_PROMPT,
        allowSystemInMessages: true,
        stopWhen: isStepCount(5),
        messages: [
            { role: "system", content: `USER: ${JSON.stringify(context.user)}` },
            { role: "system", content: `Memory: ${context.memories}` },
            ...context.messages,
            { role: "user", content: query }
        ],
        tools: { getUserMemoryTool },
        onEnd: async ({ text }) => {
            const reply = text.trim()
            if (!reply) {
                console.warn("Agent finished without text for chat:", chatId)
                return
            }

            await db.messages.create({
                data: {
                    role: "AGENT",
                    content: reply,
                    chatId: chatId
                }
            })
            const memories = await generateMemories(query)
            console.log(
                "Extracted memories:",
                memories,
            );
            await saveMemories(user.userId, memories)
            try {
                await incrementSubscriptionUsage(user.userId)
            } catch (error) {
                console.error("Failed to increment subscription usage:", error)
            }
        }
    });
}
