import type { MockTestView } from '@planner/shared';
import { formatPercent, summariseMockTests, summaryLine } from '../mockSummary';

const t = (
  percent: number,
  examId: string | null = null,
  n = percent,
): MockTestView => ({
  id: String(n),
  title: `T${n}`,
  takenOn: '2026-11-01',
  score: percent,
  maxScore: 100,
  percent,
  examId,
  notes: '',
});

const names = new Map([
  ['a', 'NEET SS'],
  ['b', 'INI-SS'],
]);

describe('summariseMockTests', () => {
  it('groups by exam in order of the latest test, newest first', () => {
    const s = summariseMockTests(
      [t(60, 'b', 1), t(75, 'a', 2), t(70, 'a', 3), t(80, 'a', 4)],
      names,
    );
    expect(s.map(g => g.examName)).toEqual(['INI-SS', 'NEET SS']);
    expect(s[1]).toEqual({
      examName: 'NEET SS',
      count: 3,
      latest: 75,
      change: 5,
      best: 80,
      average: 75,
    });
    expect(s[0].change).toBeNull();
  });

  it('puts tests with no exam, or a deleted one, together', () => {
    const s = summariseMockTests([t(50, null, 1), t(70, 'gone', 2)], names);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ examName: null, count: 2, change: -20 });
  });
});

describe('summaryLine', () => {
  it('words a rise, a fall and no change plainly', () => {
    const [up] = summariseMockTests([t(75), t(70)], names);
    expect(summaryLine(up)).toBe(
      'Latest 75% (up 5 points) · Best 75% · Average 72.5% over 2 tests',
    );
    const [down] = summariseMockTests([t(69), t(70)], names);
    expect(summaryLine(down)).toContain('(down 1 point)');
    const [same] = summariseMockTests([t(70), t(70)], names);
    expect(summaryLine(same)).toContain('(same as the one before)');
  });

  it('keeps a single test short', () => {
    const [one] = summariseMockTests([t(80)], names);
    expect(summaryLine(one)).toBe('1 test · 80%');
  });

  it('rounds to one decimal place', () => {
    expect(formatPercent(72.345)).toBe('72.3%');
    expect(formatPercent(80)).toBe('80%');
  });
});
