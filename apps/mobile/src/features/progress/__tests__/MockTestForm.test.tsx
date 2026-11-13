import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { ApiError } from '../../../shared/api/errors';
import { MockTestForm } from '../MockTestForm';
import {
  ID,
  cleanupClients,
  makeHttp,
  renderWithProviders,
} from '../../../test/testUtils';

afterEach(cleanupClients);

describe('MockTestForm', () => {
  it('rejects score above max without calling the API', async () => {
    const http = makeHttp();
    await renderWithProviders(<MockTestForm onSaved={jest.fn()} />, http);
    await fireEvent.changeText(screen.getByLabelText('Title'), 'Mock 1');
    await fireEvent.changeText(screen.getByLabelText('Score'), '110');
    await fireEvent.changeText(screen.getByLabelText('Max score'), '100');
    await fireEvent.press(screen.getByText('Save'));
    expect(
      await screen.findByText('Score cannot exceed max score'),
    ).toBeOnTheScreen();
    expect(http.post).not.toHaveBeenCalled();
  });

  it('keeps the draft on a network error and retries', async () => {
    const http = makeHttp();
    const saved = { id: ID(5) };
    http.post
      .mockRejectedValueOnce(new ApiError('NETWORK', 0))
      .mockResolvedValueOnce(saved);
    const onSaved = jest.fn();
    await renderWithProviders(<MockTestForm onSaved={onSaved} />, http);
    await fireEvent.changeText(screen.getByLabelText('Title'), 'Mock 1');
    await fireEvent.changeText(screen.getByLabelText('Score'), '80');
    await fireEvent.changeText(screen.getByLabelText('Max score'), '100');
    await fireEvent.press(await screen.findByText('MS General Surgery'));
    await fireEvent.press(screen.getByText('Save'));
    expect(
      await screen.findByText("Can't reach the server — try again"),
    ).toBeOnTheScreen();
    expect(screen.getByLabelText('Title').props.value).toBe('Mock 1');
    expect(screen.getByLabelText('Score').props.value).toBe('80');
    await fireEvent.press(screen.getByText('Retry'));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(http.post.mock.calls[1][1]).toMatchObject({
      title: 'Mock 1',
      score: 80,
      maxScore: 100,
      examId: ID(11),
    });
  });

  it('accepts a decimal comma in score fields', async () => {
    const http = makeHttp();
    http.post.mockResolvedValue({ id: ID(5) });
    await renderWithProviders(<MockTestForm onSaved={jest.fn()} />, http);
    await fireEvent.changeText(screen.getByLabelText('Title'), 'Mock 1');
    await fireEvent.changeText(screen.getByLabelText('Score'), '72,5');
    await fireEvent.changeText(screen.getByLabelText('Max score'), '100,0');
    await fireEvent.press(await screen.findByText('MS General Surgery'));
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(http.post).toHaveBeenCalled());
    expect(http.post.mock.calls[0][1]).toMatchObject({
      score: 72.5,
      maxScore: 100,
    });
  });
});
