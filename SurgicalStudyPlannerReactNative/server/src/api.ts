import { createServer } from "node:http";
import express, { type ErrorRequestHandler, type Express } from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { config } from "./config.js";
import { createAuthRouter, requireAuth } from "./auth.js";
import { connectDatabase } from "./db.js";
import { createPlannerRouter } from "./planner.js";
import { createRealtimeServer } from "./realtime.js";
import type { Server } from "socket.io";
import type { Server as HttpServer } from "node:http";

export function createApiServer(): {
  app: Express;
  httpServer: HttpServer;
  io: Server;
} {
  const app = express();
  if (config.trustProxyHops > 0) app.set("trust proxy", config.trustProxyHops);
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(express.json({ limit: "1mb", strict: true }));

  app.get("/health", (_req, res) => res.json({ status: "ok" }));
  app.get("/v1/config", (_req, res) => {
    res.json({ registrationEnabled: config.allowRegistration });
  });

  app.use("/v1/auth", rateLimit({
    windowMs: 15 * 60 * 1_000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { message: "Too many sign-in attempts. Please try again later." },
  }));
  app.use("/v1/auth", createAuthRouter(connectDatabase));

  const httpServer = createServer(app);
  const io = createRealtimeServer(httpServer);
  app.use("/v1/planner", createPlannerRouter(io, requireAuth, connectDatabase));

  app.use((_req, res) => res.status(404).json({ message: "Not found." }));
  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    // Do not return database, token, or stack details to a mobile client.
    console.error("API request failed:", error instanceof Error ? error.name : "unknown error");
    if (res.headersSent) return;
    res.status(500).json({ message: "The server could not complete the request." });
  };
  app.use(errorHandler);

  return { app, httpServer, io };
}
