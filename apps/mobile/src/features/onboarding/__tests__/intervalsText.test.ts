import { WHOLE_NUMBERS_MESSAGE, parseIntervalsText } from '../intervalsText';

describe('parseIntervalsText', () => {
  it.each([
    '4, 7, 15',
    '4 7 15',
    '4.7.15',
    '4-7-15',
    '4/7/15',
    '4;7;15',
    ' 4 ,7, 15 ',
  ])('reads %p as [4, 7, 15]', text => {
    expect(parseIntervalsText(text)).toEqual({ value: [4, 7, 15] });
  });

  it('asks for whole numbers for letters or an empty field', () => {
    expect(parseIntervalsText('4, a')).toEqual({
      error: WHOLE_NUMBERS_MESSAGE,
    });
    expect(parseIntervalsText('  ')).toEqual({ error: WHOLE_NUMBERS_MESSAGE });
  });

  it('uses the shared plain messages for order and range', () => {
    expect(parseIntervalsText('4, 4').error).toBe(
      'Intervals must increase, e.g. 4, 7, 15',
    );
    expect(parseIntervalsText('4, 1000').error).toBe(
      'Each interval must be between 1 and 999 days',
    );
  });
});
