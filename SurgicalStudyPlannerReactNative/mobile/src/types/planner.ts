export type Exam = 'MS General Surgery' | 'NEET SS' | 'Both';

export type Revision = {
  day: number;
  date: string;
  done: boolean;
  completedAt?: string;
};

export type Topic = {
  id: string;
  name: string;
  exam: Exam;
  subject: string;
  studyDate: string;
  intervals: number[];
  notes: string;
  revisions: Revision[];
};

export type PlannerSettings = {
  intervals: number[];
  time: string;
  dark: boolean;
};

export type MockTest = {
  id: string;
  exam: Exclude<Exam, 'Both'>;
  date: string;
  score: number;
  max: number;
  note: string;
  percent: number;
};

export type PlannerDocument = {
  version: number;
  settings: PlannerSettings;
  topics: Topic[];
  mockTests: MockTest[];
};

export type PlannerDraft = Omit<PlannerDocument, 'version'>;

export type Account = {
  id: string;
  email: string;
};

export type AuthResponse = {
  token: string;
  user: Account;
};

export const DEFAULT_SETTINGS: PlannerSettings = {
  intervals: [4, 7, 15, 30, 60, 90],
  time: '08:00',
  dark: false,
};

export function emptyPlanner(): PlannerDocument {
  return {
    version: 0,
    settings: {...DEFAULT_SETTINGS, intervals: [...DEFAULT_SETTINGS.intervals]},
    topics: [],
    mockTests: [],
  };
}
