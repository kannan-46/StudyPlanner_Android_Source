import React from 'react';
import { render } from '@testing-library/react-native';
import { TextField } from '../TextField';
import { ThemeProvider } from '../ThemeProvider';

it('renders the error text', async () => {
  const { getByText } = await render(
    <ThemeProvider mode="light">
      <TextField
        label="Title"
        value=""
        onChangeText={() => {}}
        error="Required"
      />
    </ThemeProvider>,
  );
  expect(getByText('Required')).toBeTruthy();
});
