import { z } from "zod";

const date = z.iso.date();
const exam = z.enum(["MS General Surgery", "NEET SS", "Both"]);
const intervalList = z.array(z.number().int().min(1).max(999)).min(1).max(20);

const revisionSchema = z.object({
  day: z.number().int().min(1).max(999),
  date,
  done: z.boolean(),
  completedAt: date.optional(),
}).strict();

const topicSchema = z.object({
  id: z.string().min(1).max(128),
  name: z.string().trim().min(1).max(240),
  exam,
  subject: z.string().max(200),
  studyDate: date,
  intervals: intervalList,
  notes: z.string().max(10_000),
  revisions: z.array(revisionSchema).max(100),
}).strict();

const settingsSchema = z.object({
  intervals: intervalList,
  time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  dark: z.boolean(),
}).strict();

const mockTestSchema = z.object({
  id: z.string().min(1).max(128),
  exam: z.enum(["MS General Surgery", "NEET SS"]),
  date,
  score: z.number().min(0).max(1_000_000),
  max: z.number().positive().max(1_000_000),
  note: z.string().max(500),
  percent: z.number().min(0).max(100).optional(),
}).strict().superRefine((test, context) => {
  if (test.score > test.max) {
    context.addIssue({ code: "custom", path: ["score"], message: "Score cannot exceed maximum marks." });
  }
});

export const plannerWriteSchema = z.object({
  expectedVersion: z.number().int().min(0),
  settings: settingsSchema,
  topics: z.array(topicSchema).max(5_000),
  mockTests: z.array(mockTestSchema).max(2_000),
}).strict().superRefine((planner, context) => {
  const topicIds = new Set<string>();
  planner.topics.forEach((topic, index) => {
    if (topicIds.has(topic.id)) {
      context.addIssue({ code: "custom", path: ["topics", index, "id"], message: "Topic IDs must be unique." });
    }
    topicIds.add(topic.id);
  });
  const testIds = new Set<string>();
  planner.mockTests.forEach((test, index) => {
    if (testIds.has(test.id)) {
      context.addIssue({ code: "custom", path: ["mockTests", index, "id"], message: "Mock test IDs must be unique." });
    }
    testIds.add(test.id);
  });
});

export type PlannerWrite = z.infer<typeof plannerWriteSchema>;

export const defaultSettings = {
  intervals: [4, 7, 15, 30, 60, 90],
  time: "08:00",
  dark: false,
};
