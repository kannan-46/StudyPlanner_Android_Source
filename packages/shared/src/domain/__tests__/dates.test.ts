import {
  addDays,
  compareDates,
  daysBetween,
  isLocalDate,
  localToday,
  maxDate,
} from '../dates';

describe('dates', () => {
  it('validates real calendar dates only', () => {
    expect(isLocalDate('2024-02-29')).toBe(true);
    expect(isLocalDate('2023-02-29')).toBe(false);
    expect(isLocalDate('2024-2-9')).toBe(false);
    expect(isLocalDate('2024-13-01')).toBe(false);
    expect(isLocalDate(20240101)).toBe(false);
  });
  it('adds days across month, year and leap boundaries', () => {
    expect(addDays('2026-11-01', 4)).toBe('2026-11-05');
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('compares and diffs', () => {
    expect(compareDates('2026-11-05', '2026-11-12')).toBe(-1);
    expect(compareDates('2026-11-05', '2026-11-05')).toBe(0);
    expect(daysBetween('2026-11-05', '2026-11-12')).toBe(7);
    expect(maxDate('2026-11-05', '2026-11-12')).toBe('2026-11-12');
  });
  it('localToday uses local date fields', () => {
    expect(localToday(new Date(2026, 10, 13, 23, 59))).toBe('2026-11-13');
  });
});
