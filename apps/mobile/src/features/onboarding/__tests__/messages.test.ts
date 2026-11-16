import { addDays } from '@planner/shared';
import {
  ADDED_NAME_MAX,
  firstRevisionText,
  shortName,
  topicAddedMessage,
} from '../messages';

const today = '2026-11-16';

describe('firstRevisionText', () => {
  it('never shows a past date as upcoming', () => {
    expect(firstRevisionText('2026-10-20', today)).toBe(
      'first revision is due now',
    );
    expect(firstRevisionText(addDays(today, -1), today)).toBe(
      'first revision is due now',
    );
  });

  it('words today, tomorrow and later dates', () => {
    expect(firstRevisionText(today, today)).toBe('first revision is due today');
    expect(firstRevisionText('2026-11-17', today)).toBe(
      'first revision tomorrow',
    );
    expect(firstRevisionText('2026-11-20', today)).toBe(
      'first revision 20 Nov',
    );
    expect(firstRevisionText('2027-01-05', today)).toBe(
      'first revision 5 Jan 2027',
    );
  });

  it('falls back to "scheduled" without a date', () => {
    expect(firstRevisionText(null, today)).toBe('first revision scheduled');
  });
});

describe('shortName', () => {
  it('keeps short names as they are', () => {
    expect(shortName('Thyroid')).toBe('Thyroid');
    expect(shortName('a'.repeat(ADDED_NAME_MAX))).toBe(
      'a'.repeat(ADDED_NAME_MAX),
    );
  });

  it('cuts long names to the limit with an ellipsis', () => {
    const cut = shortName('b'.repeat(200));
    expect(Array.from(cut)).toHaveLength(ADDED_NAME_MAX);
    expect(cut.endsWith('…')).toBe(true);
  });

  it('does not leave a space before the ellipsis', () => {
    expect(shortName('Brachial plexus anatomy', 10)).toBe('Brachial…');
  });
});

describe('topicAddedMessage', () => {
  it('keeps the spec wording for a future date', () => {
    expect(topicAddedMessage('Thyroid', '2026-11-20', today)).toBe(
      'Thyroid added — first revision 20 Nov',
    );
  });
});
