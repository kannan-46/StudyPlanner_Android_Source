import type { LocalDate } from '../domain/dates';
import type { RevisionState } from '../domain/schedule';
import type { Settings } from '../schemas/settings';

export interface UserView {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  onboardingCompletedAt: string | null;
  settings: Settings;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: UserView;
}

export interface ExamView {
  id: string;
  name: string;
  examDate: LocalDate | null;
}

export interface SubjectView {
  id: string;
  name: string;
  topicCount: number;
}

export type RevisionView = RevisionState;

export interface TopicView {
  id: string;
  name: string;
  subjectId: string;
  examIds: string[];
  studiedOn: LocalDate;
  intervals: number[];
  notes: string;
  revisions: RevisionView[];
  nextDueOn: LocalDate | null;
  status: 'active' | 'completed';
  createdAt: string;
  updatedAt: string;
}

export interface AgendaItem {
  topicId: string;
  topicName: string;
  subjectId: string;
  subjectName: string;
  revisionId: string;
  step: number;
  totalSteps: number;
  dueOn: LocalDate;
  bucket: 'overdue' | 'today' | 'upcoming';
}

export interface StatsView {
  topics: number;
  activeTopics: number;
  completedTopics: number;
  revisionsDone: number;
  revisionsPending: number;
  overdue: number;
  dueToday: number;
  bySubject: { subjectId: string; name: string; topicCount: number }[];
  byExam: { examId: string; name: string; topicCount: number }[];
}

export interface MockTestView {
  id: string;
  title: string;
  takenOn: LocalDate;
  score: number;
  maxScore: number;
  /** Percentage, rounded to 1 decimal. */
  percent: number;
  examId: string | null;
  notes: string;
}
