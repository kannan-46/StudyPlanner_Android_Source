import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { verifyAccessToken } from "./tokens.js";

export function createRealtimeServer(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    path: "/socket.io",
    transports: ["websocket"],
    pingInterval: 25_000,
    pingTimeout: 20_000,
  });

  io.use(async (socket, next) => {
    const candidate = socket.handshake.auth?.token;
    if (typeof candidate !== "string" || !candidate) {
      next(new Error("unauthorized"));
      return;
    }

    try {
      const payload = await verifyAccessToken(candidate);
      if (!payload.sub) throw new Error("Missing token subject");
      socket.data.userId = payload.sub;
      socket.data.expiresAt = payload.exp;
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.data.userId;
    if (typeof userId === "string") void socket.join(userId);

    const expiresAt = socket.data.expiresAt;
    if (typeof expiresAt === "number") {
      const remainingMs = Math.max(0, expiresAt * 1_000 - Date.now());
      const expiryTimer = setTimeout(() => socket.disconnect(true), remainingMs);
      expiryTimer.unref();
      socket.once("disconnect", () => clearTimeout(expiryTimer));
    }
  });

  return io;
}
