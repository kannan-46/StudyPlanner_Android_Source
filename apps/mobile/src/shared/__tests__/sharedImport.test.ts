import { createSchedule } from '@planner/shared';

describe('@planner/shared import', () => {
  it('creates a schedule with the first revision due on day 4', () => {
    let n = 0;
    const result = createSchedule(
      '2026-11-01',
      [4, 7, 15, 30],
      () => `r${++n}`,
    );
    expect(result.revisions[0].dueOn).toBe('2026-11-05');
  });
});
