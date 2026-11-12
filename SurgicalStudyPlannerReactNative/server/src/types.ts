import type { ObjectId } from "mongodb";

export type Exam = "MS General Surgery" | "NEET SS" | "Both";

export interface Revision {
  day: number;
  date: string;
  done: boolean;
  completedAt?: string;
}

export interface Topic {
  id: string;
  name: string;
  exam: Exam;
  subject: string;
  studyDate: string;
  intervals: number[];
  notes: string;
  revisions: Revision[];
}

export interface PlannerSettings {
  intervals: number[];
  time: string;
  dark: boolean;
}

export interface MockTest {
  id: string;
  exam: Exclude<Exam, "Both">;
  date: string;
  score: number;
  max: number;
  note: string;
  percent: number;
}

export interface PlannerDocument {
  version: number;
  settings: PlannerSettings;
  topics: Topic[];
  mockTests: MockTest[];
}

export interface UserDocument {
  _id: ObjectId;
  email: string;
  emailNormalized: string;
  passwordHash: string;
  createdAt: Date;
}

export interface PlannerDbDocument extends PlannerDocument {
  _id: ObjectId;
  userId: ObjectId;
  updatedAt: Date;
}
