

import { Server } from "socket.io";
import { AuthenticatedSocket } from "../middleware/socketAuth.js";
import { Message } from "../models/Message.js";
import { onlineUsers } from "./index.js";

export function setupChatHandler(io: Server, socket: AuthenticatedSocket) {
  
  socket.on(
    "chat:room_message",
    async ({ code, text }: { code: string; text: string }) => {
      if (!text?.trim()) return;

      const message = {
        from: socket.displayName,
        fromId: socket.userId,
        text: text.trim().slice(0, 1000),
        timestamp: new Date().toISOString(),
      };

      socket.to(`room:${code}`).emit("chat:room_message", message);

      if (!socket.isGuest && socket.userId) {
        try {
          await Message.create({
            type: "room",
            roomId: code,
            from: socket.userId,
            content: text.trim().slice(0, 1000),
          });
        } catch {}
      }
    },
  );

  
  
  
  socket.on(
    "chat:direct_message",
    async ({ toUserId, text }: { toUserId: string; text: string }) => {
      if (!text?.trim() || socket.isGuest) return;

      const targetSocketId = onlineUsers.get(toUserId);
      const message = {
        from: socket.displayName,
        fromId: socket.userId,
        text: text.trim().slice(0, 1000),
        timestamp: new Date().toISOString(),
      };

      if (targetSocketId) {
        io.to(targetSocketId).emit("chat:direct_message", message);
      }

      if (socket.userId) {
        try {
          await Message.create({
            type: "direct",
            from: socket.userId,
            to: toUserId,
            content: text.trim().slice(0, 1000),
          });
        } catch {}
      }
    },
  );

  
  
  
  socket.on(
    "chat:get_history",
    async (
      { withUserId }: { withUserId: string },
      callback: (messages: any[]) => void,
    ) => {
      if (socket.isGuest || !socket.userId) {
        callback([]);
        return;
      }

      try {
        const messages = await Message.find({
          type: "direct",
          $or: [
            { from: socket.userId, to: withUserId },
            { from: withUserId, to: socket.userId },
          ],
        })
          .sort({ createdAt: -1 })
          .limit(50)
          .lean();

        callback(messages.reverse());
      } catch {
        callback([]);
      }
    },
  );
}
