import {
  dayLabel,
  doneLabel,
  dueStatus,
  formatClockTime,
  formatDate,
  onDayLabel,
  relativeDay,
  snoozedLabel,
} from '../format';

describe('format', () => {
  it('relativeDay (deprecated, kept for old callers)', () => {
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
      tone: 'overdue',
    });
    expect(dueStatus('2026-11-13', today).text).toBe('Overdue by 1 day');
    expect(dueStatus(today, today)).toEqual({
      text: 'Due today',
      overdue: false,
      tone: 'today',
    });
    expect(dueStatus('2026-11-15', today)).toMatchObject({
      text: 'Due tomorrow',
      tone: 'upcoming',
    });
    expect(dueStatus('2026-11-18', today).text).toBe('In 4 days, 18 Nov');
    expect(dueStatus('2027-01-02', today).text).toBe('In 49 days, 2 Jan 2027');
  });
});

describe('day wording inside sentences', () => {
  const today = '2026-11-16';
  it('dayLabel says today, tomorrow, yesterday or the date', () => {
    expect(dayLabel('2026-11-16', today)).toBe('today');
    expect(dayLabel('2026-11-17', today)).toBe('tomorrow');
    expect(dayLabel('2026-11-15', today)).toBe('yesterday');
    expect(dayLabel('2026-11-20', today)).toBe('20 Nov');
    expect(dayLabel('2027-02-01', today)).toBe('1 Feb 2027');
  });

  it('onDayLabel adds "on" only before a date', () => {
    expect(onDayLabel('2026-11-16', today)).toBe('today');
    expect(onDayLabel('2026-11-17', today)).toBe('tomorrow');
    expect(onDayLabel('2026-11-20', today)).toBe('on 20 Nov');
  });

  it('doneLabel and snoozedLabel match the due wording', () => {
    expect(doneLabel('2026-11-16', today)).toBe('Done today');
    expect(doneLabel('2026-11-15', today)).toBe('Done yesterday');
    expect(doneLabel('2026-11-02', today)).toBe('Done 2 Nov');
    expect(snoozedLabel('2026-11-17', today)).toBe('Snoozed to tomorrow');
    expect(snoozedLabel('2026-11-25', today)).toBe('Snoozed to 25 Nov');
  });
});
