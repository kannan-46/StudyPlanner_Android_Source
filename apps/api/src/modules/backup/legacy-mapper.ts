import {
  LEGACY_EXAMS,
  maxDate,
  type LegacyBackup,
  type LegacyMock,
  type LegacyTopic,
  type LocalDate,
  type Settings,
} from '@planner/shared';

/**
 * A backup normalised to plain names and per-topic schedules. Both the v1 and
 * the legacy formats are converted to this before anything is written.
 */
export interface ImportPlan {
  settings: Partial<Settings>;
  exams: { name: string; examDate: LocalDate | null }[];
  subjects: string[];
  topics: {
    legacyId: string;
    name: string;
    subjectName: string;
    examNames: string[];
    studiedOn: LocalDate;
    intervals: number[];
    notes: string;
    /** Indexed by step - 1; length equals intervals.length. */
    revisions: { doneOn: LocalDate | null; dueOverride: LocalDate | null }[];
    /** Old-app text was cut to this app's limits. */
    shortened?: boolean;
  }[];
  mockTests: {
    title: string;
    takenOn: LocalDate;
    score: number;
    maxScore: number;
    examName: string | null;
    /**
     * Stable key of the backup record: the v1 sourceId or file id, or a
     * 'legacy:' key. On merge it is matched against existing mock test _ids
     * and stored sourceIds, so the same record is never imported twice.
     */
    sourceId?: string;
    notes: string;
    /** The old-app note was cut to 1,000 characters. */
    shortened?: boolean;
  }[];
}

export const DEFAULT_SUBJECT = 'General';

function cleanIntervals(raw: number[]): number[] {
  const valid = raw.filter(n => Number.isInteger(n) && n >= 1 && n <= 999);
  return [...new Set(valid)].sort((a, b) => a - b).slice(0, 20);
}

function examNamesOf(exam: LegacyTopic['exam']): string[] {
  return exam === 'Both' ? [...LEGACY_EXAMS] : [exam];
}

function cleanName(s: string, max: number, fallback: string): string {
  const v = s.trim().replace(/\s+/g, ' ').slice(0, max).trim();
  return v || fallback;
}

/**
 * Old revision k becomes step k. Done revisions keep their date (clamped so
 * the chain never goes backwards); pending ones are recomputed later by
 * rebuildSchedule. A done revision after a pending one cannot be expressed
 * in the strict-order model, so it is imported as pending.
 */
function mapRevisions(
  topic: LegacyTopic,
  intervals: number[],
): ImportPlan['topics'][number]['revisions'] {
  const old = [...topic.revisions]
    .sort((a, b) => a.day - b.day)
    .slice(0, intervals.length);
  let floor: LocalDate = topic.studyDate;
  let pending = false;
  return intervals.map((_, i) => {
    const rev = old[i];
    if (!rev || !rev.done || pending) {
      pending = true;
      return { doneOn: null, dueOverride: null };
    }
    floor = maxDate(rev.completedAt ?? rev.date, floor);
    return { doneOn: floor, dueOverride: null };
  });
}

/**
 * Old mock test ids are not checked for uniqueness, so a repeated id gets
 * its occurrence number. The key stays the same for the same file.
 */
function legacyMockKeys(mocks: LegacyMock[]): string[] {
  const seen = new Map<string, number>();
  return mocks.map(m => {
    const n = (seen.get(m.id) ?? 0) + 1;
    seen.set(m.id, n);
    return n === 1 ? `legacy:${m.id}` : `legacy:${m.id}#${n}`;
  });
}

function mapMock(
  m: LegacyMock,
  sourceId: string,
): ImportPlan['mockTests'][number] {
  return {
    sourceId,
    title: `${m.exam} mock`,
    takenOn: m.date,
    score: m.score,
    maxScore: m.max,
    examName: m.exam === 'Both' ? null : m.exam,
    notes: m.note,
  };
}

export function mapLegacyBackup(
  data: LegacyBackup,
  currentIntervals: number[],
): ImportPlan {
  const settingsIntervals = cleanIntervals(data.settings.intervals);
  const settings: Partial<Settings> = {};
  if (settingsIntervals.length > 0) settings.intervals = settingsIntervals;
  if (data.settings.time !== undefined) {
    settings.reminderTime = data.settings.time;
  }
  if (data.settings.dark !== undefined) {
    settings.theme = data.settings.dark ? 'dark' : 'system';
  }
  const fallbackIntervals = settings.intervals ?? currentIntervals;

  const topics = data.topics.map(t => {
    const own = cleanIntervals(t.intervals);
    const intervals = own.length > 0 ? own : fallbackIntervals;
    return {
      legacyId: t.id,
      name: t.name,
      subjectName: cleanName(t.subject, 80, DEFAULT_SUBJECT),
      examNames: examNamesOf(t.exam),
      studiedOn: t.studyDate,
      intervals,
      notes: t.notes,
      revisions: mapRevisions(t, intervals),
    };
  });
  const legacyMocks = data.tests ?? data.mockTests ?? [];
  const keys = legacyMockKeys(legacyMocks);
  const mockTests = legacyMocks.map((m, i) => mapMock(m, keys[i] as string));

  const examNames = new Set<string>();
  topics.forEach(t => t.examNames.forEach(n => examNames.add(n)));
  mockTests.forEach(m => m.examName && examNames.add(m.examName));

  return {
    settings,
    exams: [...examNames].map(name => ({ name, examDate: null })),
    subjects: [...new Set(topics.map(t => t.subjectName))],
    topics,
    mockTests,
  };
}
