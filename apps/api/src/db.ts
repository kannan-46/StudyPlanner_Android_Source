import { MongoClient, type Collection, type Db } from "mongodb";
import { config } from "./config.js";
import type { PlannerDbDocument, UserDocument } from "./types.js";

const client = new MongoClient(config.mongodbUri, {
  appName: "SurgicalStudyPlannerAPI",
  maxPoolSize: 20,
  serverSelectionTimeoutMS: 10_000,
});

let database: Db | undefined;

export function createMemoizedInitializer(initialize: () => Promise<void>): () => Promise<void> {
  let initialization: Promise<void> | undefined;

  return () => {
    if (!initialization) {
      initialization = initialize().catch((error: unknown) => {
        initialization = undefined;
        throw error;
      });
    }
    return initialization;
  };
}

const initializeDatabase = createMemoizedInitializer(async () => {
  await client.connect();
  database = client.db();
  await Promise.all([
    users().createIndex({ emailNormalized: 1 }, { unique: true, name: "unique_normalized_email" }),
    planners().createIndex({ userId: 1 }, { unique: true, name: "unique_planner_per_user" }),
  ]);
});

export function connectDatabase(): Promise<void> {
  return initializeDatabase();
}

function getDatabase(): Db {
  if (!database) throw new Error("MongoDB has not connected yet");
  return database;
}

export function users(): Collection<UserDocument> {
  return getDatabase().collection<UserDocument>("users");
}

export function planners(): Collection<PlannerDbDocument> {
  return getDatabase().collection<PlannerDbDocument>("planners");
}

export async function closeDatabase(): Promise<void> {
  database = undefined;
  await client.close();
}
