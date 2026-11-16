import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { DateField } from '../DateField';
import { ThemeProvider } from '../ThemeProvider';

jest.mock('@react-native-community/datetimepicker', () => () => null);

const renderField = (value: string | null) =>
  render(
    <ThemeProvider mode="light">
      <DateField label="Exam date" value={value} onChange={() => {}} />
    </ThemeProvider>,
  );

it('tells TalkBack the chosen date, keeping the exact label', async () => {
  await renderField('2027-03-01');
  const field = screen.getByLabelText('Exam date');
  expect(field).toHaveAccessibilityValue({ text: '1 Mar 2027' });
  expect(field).toHaveProp(
    'accessibilityHint',
    'Opens a calendar to change the date',
  );
});

it('says when no date is set', async () => {
  await renderField(null);
  expect(screen.getByLabelText('Exam date')).toHaveAccessibilityValue({
    text: 'No date set',
  });
});

it('the caption is not read as a separate stop', async () => {
  await renderField(null);
  expect(screen.queryByText('Exam date')).toBeNull();
  expect(
    screen.getByText('Exam date', { includeHiddenElements: true }),
  ).toBeTruthy();
});
