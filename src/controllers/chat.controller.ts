import { db } from "../configs/db.config.js";
import { deleteChatService, getChatService } from "../services/chat.service.js";
import { asyncHandler } from "../utils/async.handler.util.js";
import { AppError } from "../utils/error.handler.util.js";

export const getChats = asyncHandler(async (req, res) => {
  const user = req.user!;

  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.max(Number(req.query.limit) || 10, 1);

  const where = {
    userId: user.userId,
  };

  const { chats, chatCount, hasMore } = await getChatService(
    page,
    limit,
    where,
  );
  return res.status(200).json({
    success: true,
    message: "Chats fetched successfully",
    data: {
      chats,
      pagination: {
        page,
        limit,
        total: chatCount,
        hasMore,
      },
    },
  });
});
export const deleteChat = asyncHandler(async (req, res) => {
  const user = req.user!;
  const chatId = String(req.params.chatId);

  if (!chatId) {
    throw new AppError("chatId not provided", 400);
  }

  const chat = await db.chats.findFirst({
    where: {
      id: chatId,
      userId: user.userId,
    },
  });

  if (!chat) {
    throw new AppError("Chat not found", 404);
  }

  const deletedChat = await deleteChatService(chatId);

  return res
    .status(200)
    .json({
      success: true,
      message: "chat Deleted Successfully",
      data: deletedChat,
    });
});
