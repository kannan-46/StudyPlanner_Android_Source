import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { TextField } from '../TextField';
import { lightColors } from '../theme';
import { ThemeProvider } from '../ThemeProvider';

const renderField = (error?: string) =>
  render(
    <ThemeProvider mode="light">
      <TextField label="Title" value="" onChangeText={() => {}} error={error} />
    </ThemeProvider>,
  );

it('renders the error text', async () => {
  const { getByText } = await renderField('Required');
  expect(getByText('Required')).toBeTruthy();
});

it('speaks the error as part of the field name', async () => {
  await renderField('Enter a title');
  expect(screen.getByLabelText('Title, Enter a title')).toBeOnTheScreen();
});

it('is named by its label alone when there is no error', async () => {
  await renderField();
  expect(screen.getByLabelText('Title')).toBeOnTheScreen();
});

it('draws a 3:1 border, or red when invalid', async () => {
  const view = await renderField();
  const border = () =>
    StyleSheet.flatten(screen.getByLabelText(/^Title/).props.style).borderColor;
  expect(border()).toBe(lightColors.border);
  await view.rerender(
    <ThemeProvider mode="light">
      <TextField label="Title" value="" onChangeText={() => {}} error="Bad" />
    </ThemeProvider>,
  );
  expect(border()).toBe(lightColors.danger);
});
