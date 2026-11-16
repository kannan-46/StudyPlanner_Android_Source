import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ChipSelect } from '../ChipSelect';
import { lightColors } from '../theme';
import { ThemeProvider } from '../ThemeProvider';

const options = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

const renderChips = (
  props: Partial<React.ComponentProps<typeof ChipSelect<string>>> = {},
) =>
  render(
    <ThemeProvider mode="light">
      <ChipSelect<string>
        options={options}
        value="light"
        onChange={() => {}}
        {...props}
      />
    </ThemeProvider>,
  );

it('marks the chosen chip only as checked (not also selected)', async () => {
  await renderChips();
  const light = screen.getByRole('radio', { name: 'Light' });
  expect(light.props.accessibilityState).toEqual({ checked: true });
  expect(
    screen.getByRole('radio', { name: 'Dark' }).props.accessibilityState,
  ).toEqual({ checked: false });
});

it('names the group for TalkBack with groupLabel', async () => {
  await renderChips({ groupLabel: 'Theme', testID: 'theme' });
  expect(screen.getByRole('radio', { name: 'Light' })).toHaveProp(
    'accessibilityHint',
    'Theme',
  );
  expect(screen.getByTestId('theme-group')).toHaveProp(
    'accessibilityRole',
    'radiogroup',
  );
});

it('a visible label also names the group, without being read twice', async () => {
  await renderChips({ label: 'Theme' });
  expect(
    screen.getByText('Theme', { includeHiddenElements: true }),
  ).toBeTruthy();
  expect(screen.queryByText('Theme')).toBeNull();
  expect(screen.getByRole('radio', { name: 'Dark' })).toHaveProp(
    'accessibilityHint',
    'Theme',
  );
});

it('multiple choice chips are checkboxes with no radiogroup', async () => {
  const onChange = jest.fn();
  await renderChips({
    multiple: true,
    value: ['light'],
    onChange,
    testID: 'exams',
  });
  expect(screen.getByTestId('exams-group').props.accessibilityRole).toBe(
    undefined,
  );
  await fireEvent.press(screen.getByRole('checkbox', { name: 'Dark' }));
  expect(onChange).toHaveBeenCalledWith(['light', 'dark']);
});

it('wraps by default and scrolls sideways on one line with scroll', async () => {
  const view = await renderChips();
  expect(screen.queryByTestId('chip-scroll')).toBeNull();
  await view.unmount();
  const onChange = jest.fn();
  await renderChips({ scroll: true, onChange, testID: 'subject-filter' });
  const row = screen.getByTestId('subject-filter');
  expect(row.props.horizontal).toBe(true);
  expect(row.props.keyboardShouldPersistTaps).toBe('handled');
  for (const o of options) {
    expect(screen.getByRole('radio', { name: o.label })).toBeOnTheScreen();
  }
  await fireEvent.press(screen.getByRole('radio', { name: 'System' }));
  expect(onChange).toHaveBeenCalledWith('system');
});

it('unselected chips have a 3:1 border', async () => {
  await renderChips();
  const dark = StyleSheet.flatten(
    screen.getByRole('radio', { name: 'Dark' }).props.style,
  );
  expect(dark.borderColor).toBe(lightColors.border);
});

it('two scroll rows without a testID get distinct ids from their names', async () => {
  await render(
    <ThemeProvider mode="light">
      <ChipSelect<string>
        scroll
        label="Subject"
        options={options}
        value="light"
        onChange={() => {}}
      />
      <ChipSelect<string>
        scroll
        groupLabel="Exam"
        options={options}
        value="light"
        onChange={() => {}}
      />
      <ChipSelect<string>
        scroll
        options={options}
        value="light"
        onChange={() => {}}
      />
    </ThemeProvider>,
  );
  expect(screen.getByTestId('chip-scroll-subject')).toBeOnTheScreen();
  expect(screen.getByTestId('chip-scroll-exam')).toBeOnTheScreen();
  expect(screen.getByTestId('chip-scroll')).toBeOnTheScreen();
});
