import { config } from "./config.js";
import { connectDatabase, closeDatabase } from "./db.js";
import { createApiServer } from "./api.js";

async function start(): Promise<void> {
  await connectDatabase();
  const { httpServer, io } = createApiServer();

  httpServer.listen(config.port, "0.0.0.0", () => {
    console.log(`Surgical Study Planner API listening on port ${config.port}`);
  });

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`Received ${signal}; shutting down.`);
    await new Promise<void>((resolve) => io.close(() => resolve()));
    await closeDatabase();
    process.exit(0);
  };
  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
}

start().catch(async (error: unknown) => {
  console.error("API startup failed:", error instanceof Error ? error.name : "unknown error");
  await closeDatabase().catch(() => undefined);
  process.exitCode = 1;
});
