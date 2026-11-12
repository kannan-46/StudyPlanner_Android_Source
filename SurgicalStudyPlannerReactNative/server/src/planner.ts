import { Router, type RequestHandler } from "express";
import type { Server } from "socket.io";
import { ObjectId } from "mongodb";
import { planners } from "./db.js";
import { defaultSettings, plannerWriteSchema } from "./planner-schema.js";
import type { PlannerDbDocument, PlannerDocument } from "./types.js";

async function ensurePlanner(userId: ObjectId): Promise<PlannerDbDocument> {
  const collection = planners();
  try {
    await collection.updateOne(
      { userId },
      {
        $setOnInsert: {
          userId,
          version: 0,
          settings: defaultSettings,
          topics: [],
          mockTests: [],
          updatedAt: new Date(),
        },
      },
      { upsert: true },
    );
  } catch (error) {
    // Two first-time requests can race to create the same user's planner.
    if (!isDuplicateKey(error)) throw error;
  }

  const planner = await collection.findOne({ userId });
  if (!planner) throw new Error("Could not load the user's planner");
  return planner;
}

function toPlannerDocument(document: PlannerDbDocument): PlannerDocument {
  return {
    version: document.version,
    settings: document.settings,
    topics: document.topics,
    mockTests: document.mockTests,
  };
}

export function createPlannerRouter(io: Server, authenticated: RequestHandler): Router {
  const router = Router();
  router.use(authenticated);

  router.get("/", async (req, res) => {
    const document = await ensurePlanner(new ObjectId(req.auth!.userId));
    res.json(toPlannerDocument(document));
  });

  router.put("/", async (req, res) => {
    const parsed = plannerWriteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "The planner data is invalid.", issues: parsed.error.issues });
      return;
    }

    const userId = new ObjectId(req.auth!.userId);
    const collection = planners();
    const current = await ensurePlanner(userId);
    if (current.version !== parsed.data.expectedVersion) {
      res.status(409).json({
        message: "This planner changed on another device. Reload it before saving.",
        currentVersion: current.version,
      });
      return;
    }

    const result = await collection.updateOne(
      { userId, version: parsed.data.expectedVersion },
      {
        $set: {
          settings: parsed.data.settings,
          topics: parsed.data.topics,
          mockTests: parsed.data.mockTests.map((test) => ({
            ...test,
            percent: test.percent ?? Math.round((test.score / test.max) * 1_000) / 10,
          })),
          updatedAt: new Date(),
        },
        $inc: { version: 1 },
      },
    );

    if (result.matchedCount === 0) {
      const latest = await ensurePlanner(userId);
      res.status(409).json({
        message: "This planner changed on another device. Reload it before saving.",
        currentVersion: latest.version,
      });
      return;
    }

    const saved = await collection.findOne({ userId });
    if (!saved) throw new Error("Planner save succeeded but the document could not be reloaded");
    const savedDocument = toPlannerDocument(saved);
    io.to(userId.toHexString()).emit("planner:changed", { version: savedDocument.version });
    res.json(savedDocument);
  });

  return router;
}

function isDuplicateKey(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === 11000;
}
