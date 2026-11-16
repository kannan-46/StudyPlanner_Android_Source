import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ErrorRetry } from '../ErrorRetry';
import { ThemeProvider } from '../ThemeProvider';
import { ApiError } from '../../api/errors';

const renderRetry = async (
  error: unknown,
  extra: Partial<React.ComponentProps<typeof ErrorRetry>> = {},
) => {
  const onRetry = jest.fn();
  await render(
    <ThemeProvider mode="light">
      <ErrorRetry error={error} onRetry={onRetry} {...extra} />
    </ThemeProvider>,
  );
  return onRetry;
};

describe('ErrorRetry', () => {
  it('offers Retry for errors that can pass on a second try', async () => {
    const onRetry = await renderRetry(new ApiError('NETWORK', 0));
    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('hides Retry when trying again cannot help', async () => {
    await renderRetry(new ApiError('LIMIT_EXCEEDED', 422), {
      context: 'topic',
    });
    expect(screen.getByText(/5,000 topics/)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('names the deleted item when given a context', async () => {
    await renderRetry(new ApiError('NOT_FOUND', 404), { context: 'topic' });
    expect(screen.getByText('This topic has been deleted')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('keeps Retry for an unexpected app error', async () => {
    await renderRetry(new Error('boom'));
    expect(screen.getByRole('button', { name: 'Retry' })).toBeOnTheScreen();
  });
});
