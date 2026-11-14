import { dueStatus, formatClockTime, formatDate, relativeDay } from '../format';

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

describe('formatClockTime', () => {
  it('keeps 24-hour times when the phone uses a 24-hour clock', () => {
    expect(formatClockTime('20:30', true)).toBe('20:30');
    expect(formatClockTime('08:00', true)).toBe('08:00');
  });

  it('shows AM/PM when the phone uses a 12-hour clock', () => {
    expect(formatClockTime('20:30', false)).toBe('8:30 PM');
    expect(formatClockTime('08:05', false)).toBe('8:05 AM');
    expect(formatClockTime('00:15', false)).toBe('12:15 AM');
    expect(formatClockTime('12:00', false)).toBe('12:00 PM');
  });

  it('returns anything unexpected unchanged', () => {
    expect(formatClockTime('soon', false)).toBe('soon');
  });
});

describe('dueStatus', () => {
  const today = '2026-11-14';
  it('words overdue, today, tomorrow and later dates plainly', () => {
    expect(dueStatus('2026-11-11', today)).toEqual({
      text: 'Overdue by 3 days',
      overdue: true,
    });
    expect(dueStatus('2026-11-13', today).text).toBe('Overdue by 1 day');
    expect(dueStatus(today, today)).toEqual({
      text: 'Due today',
      overdue: false,
    });
    expect(dueStatus('2026-11-15', today).text).toBe('Due tomorrow');
    expect(dueStatus('2026-11-18', today).text).toBe('In 4 days, 18 Nov');
  });
});
