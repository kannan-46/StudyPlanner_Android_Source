import { ERROR_CODES } from '../../errors/codes';
import {
  intervalsSchema,
  localDateSchema,
  nameKey,
  nameSchema,
} from '../common';
import { mockTestInputSchema } from '../mockTests';
import { snoozeRevisionSchema, topicUpdateSchema } from '../topics';

describe('intervalsSchema', () => {
  it('accepts increasing intervals', () => {
    expect(intervalsSchema.safeParse([4, 7, 15]).success).toBe(true);
  });
  it.each([
    [[4, 4]],
    [[7, 4]],
    [[]],
    [Array.from({ length: 21 }, (_, i) => i + 1)],
    [[0]],
    [[1000]],
  ])('rejects %j', v => {
    expect(intervalsSchema.safeParse(v).success).toBe(false);
  });
});

describe('names', () => {
  it('nameKey normalises', () => {
    expect(nameKey(' Gen  Surgery ')).toBe('gen surgery');
  });
  it('nameSchema collapses whitespace', () => {
    expect(nameSchema(80).parse(' Gen  Surgery ')).toBe('Gen Surgery');
  });
});

describe('schemas', () => {
  it('rejects impossible dates', () => {
    expect(localDateSchema.safeParse('2023-02-29').success).toBe(false);
  });
  it('mock test refine fails at score path', () => {
    const r = mockTestInputSchema.safeParse({
      title: 'T',
      takenOn: '2025-01-01',
      score: 110,
      maxScore: 100,
    });
    expect(r.success).toBe(false);
    if (!r.success)
      expect([...(r.error.issues[0]?.path ?? [])]).toEqual(['score']);
  });
  it('topicUpdateSchema rejects empty', () => {
    expect(topicUpdateSchema.safeParse({}).success).toBe(false);
  });
  it('snooze defaults and bounds', () => {
    expect(snoozeRevisionSchema.parse({ today: '2025-01-01' }).days).toBe(1);
    expect(
      snoozeRevisionSchema.safeParse({ today: '2025-01-01', days: 31 }).success,
    ).toBe(false);
  });
  it('error codes have 4xx/5xx statuses', () => {
    for (const c of Object.values(ERROR_CODES)) {
      expect(c.status).toBeGreaterThanOrEqual(400);
      expect(c.status).toBeLessThanOrEqual(599);
    }
  });
});
