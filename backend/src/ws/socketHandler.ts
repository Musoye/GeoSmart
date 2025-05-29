import { Server, Socket } from "socket.io";
import { verifyToken } from "../utils/jwt";

export const registerSocketEvents = (io: Server, userSockets: Map<string, string>) => {
  io.on("connection", (socket: Socket) => {
    console.log("New socket connected:", socket.id);

    socket.on("register", (token: string) => {
      try {
        const decoded = verifyToken(token);
        userSockets.set(decoded.id, socket.id);
        console.log(`User ${decoded.id} registered socket ${socket.id}`);
      } catch (error) {
        console.error("Invalid token on register:", error);
      }
    });

    socket.on("disconnect", () => {
      for (const [userId, sockId] of userSockets.entries()) {
        if (sockId === socket.id) {
          userSockets.delete(userId);
          console.log(`User ${userId} disconnected from socket ${socket.id}`);
          break;
        }
      }
      console.log("Socket disconnected:", socket.id);
    });
  });
};