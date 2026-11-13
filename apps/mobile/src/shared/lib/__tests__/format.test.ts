import { formatDate, relativeDay } from '../format';

describe('format', () => {
  it('relativeDay', () => {
    expect(relativeDay('2026-11-10', '2026-11-13')).toBe('3 days overdue');
    expect(relativeDay('2026-11-12', '2026-11-13')).toBe('1 day overdue');
    expect(relativeDay('2026-11-13', '2026-11-13')).toBe('Today');
    expect(relativeDay('2026-11-14', '2026-11-13')).toBe('Tomorrow');
    expect(relativeDay('2026-11-17', '2026-11-13')).toBe('in 4 days');
  });
  it('formatDate omits current year', () => {
    expect(formatDate('2026-11-05', '2026-11-13')).toBe('5 Nov');
  });
  it('formatDate adds other year', () => {
    expect(formatDate('2027-01-05', '2026-11-13')).toBe('5 Jan 2027');
  });
});
