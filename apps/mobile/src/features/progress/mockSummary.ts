import type { MockTestView } from '@planner/shared';

export type MockSummary = {
  /** The exam's name, or null for tests with no (known) exam. */
  examName: string | null;
  count: number;
  latest: number;
  /** Latest minus the test before it, in percentage points; null for one test. */
  change: number | null;
  best: number;
  average: number;
};

/** Percentages are shown as whole numbers or with one decimal place. */
export const formatPercent = (p: number) => `${Math.round(p * 10) / 10}%`;

/**
 * One summary per exam (tests with no exam together), from tests sorted
 * newest first as the API sends them. Groups come in the order of their
 * latest test.
 */
export function summariseMockTests(
  tests: MockTestView[],
  examNames: Map<string, string>,
): MockSummary[] {
  const groups = new Map<string, { name: string | null; p: number[] }>();
  for (const t of tests) {
    const name = t.examId ? examNames.get(t.examId) ?? null : null;
    const key = name === null ? '' : (t.examId as string);
    const g = groups.get(key) ?? { name, p: [] };
    g.p.push(t.percent);
    groups.set(key, g);
  }
  return [...groups.values()].map(({ name, p }) => ({
    examName: name,
    count: p.length,
    latest: p[0] ?? 0,
    change:
      p.length > 1 ? Math.round(((p[0] ?? 0) - (p[1] ?? 0)) * 10) / 10 : null,
    best: Math.max(...p),
    average: p.reduce((a, b) => a + b, 0) / p.length,
  }));
}

/** "Latest 75% (up 5 points) · Best 80% · Average 72% over 4 tests" */
export function summaryLine(s: MockSummary): string {
  if (s.count === 1) return `1 test · ${formatPercent(s.latest)}`;
  const change =
    s.change === null
      ? ''
      : s.change === 0
      ? ' (same as the one before)'
      : ` (${s.change > 0 ? 'up' : 'down'} ${formatPercent(
          Math.abs(s.change),
        ).replace('%', '')} ${Math.abs(s.change) === 1 ? 'point' : 'points'})`;
  return `Latest ${formatPercent(s.latest)}${change} · Best ${formatPercent(
    s.best,
  )} · Average ${formatPercent(s.average)} over ${s.count} tests`;
}
