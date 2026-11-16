import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { onlineManager } from '@tanstack/react-query';
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
    await fireEvent.changeText(screen.getByLabelText(/^Title/), 'Mock 1');
    await fireEvent.changeText(screen.getByLabelText('Score'), '110');
    await fireEvent.changeText(screen.getByLabelText(/^Max score/), '100');
    await fireEvent.press(screen.getByText('Save'));
    expect(
      await screen.findByText('Score cannot exceed max score'),
    ).toBeOnTheScreen();
    expect(http.post).not.toHaveBeenCalled();
  });

  it('uses plain messages and clears them as the user fixes each field', async () => {
    const http = makeHttp();
    await renderWithProviders(<MockTestForm onSaved={jest.fn()} />, http);
    await fireEvent.changeText(screen.getByLabelText('Score'), '-1');
    await fireEvent.changeText(screen.getByLabelText(/^Max score/), '0');
    await fireEvent.press(screen.getByText('Save'));
    expect(await screen.findByText('Enter a title')).toBeOnTheScreen();
    expect(screen.getByText("Score can't be negative")).toBeOnTheScreen();
    expect(screen.getByText('Max score must be more than 0')).toBeOnTheScreen();
    expect(screen.queryByText(/Too small|expected/)).toBeNull();

    await fireEvent.changeText(screen.getByLabelText(/^Title/), 'Mock 1');
    expect(screen.queryByText('Enter a title')).toBeNull();
    expect(screen.getByText("Score can't be negative")).toBeOnTheScreen();

    // Score and max are checked together, so editing either clears both.
    await fireEvent.changeText(screen.getByLabelText(/^Max score/), '100');
    expect(screen.queryByText("Score can't be negative")).toBeNull();
    expect(screen.queryByText('Max score must be more than 0')).toBeNull();
    expect(http.post).not.toHaveBeenCalled();
  });

  it('clears the score-above-max error when max score changes', async () => {
    await renderWithProviders(<MockTestForm onSaved={jest.fn()} />, makeHttp());
    await fireEvent.changeText(screen.getByLabelText(/^Title/), 'Mock 1');
    await fireEvent.changeText(screen.getByLabelText('Score'), '120');
    await fireEvent.changeText(screen.getByLabelText(/^Max score/), '100');
    await fireEvent.press(screen.getByText('Save'));
    expect(
      await screen.findByText('Score cannot exceed max score'),
    ).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText(/^Max score/), '150');
    expect(screen.queryByText('Score cannot exceed max score')).toBeNull();
  });

  it('fails fast with Retry when the phone is offline', async () => {
    onlineManager.setOnline(false);
    try {
      const http = makeHttp();
      http.post.mockRejectedValue(new ApiError('NETWORK', 0));
      await renderWithProviders(<MockTestForm onSaved={jest.fn()} />, http);
      await fireEvent.changeText(screen.getByLabelText(/^Title/), 'Mock 1');
      await fireEvent.changeText(screen.getByLabelText('Score'), '80');
      await fireEvent.changeText(screen.getByLabelText(/^Max score/), '100');
      await fireEvent.press(screen.getByText('Save'));
      expect(
        await screen.findByText("Can't reach the server — try again"),
      ).toBeOnTheScreen();
      expect(screen.queryByTestId('button-spinner')).toBeNull();
    } finally {
      onlineManager.setOnline(true);
    }
  });

  it('keeps the draft on a network error and retries', async () => {
    const http = makeHttp();
    const saved = { id: ID(5) };
    http.post
      .mockRejectedValueOnce(new ApiError('NETWORK', 0))
      .mockResolvedValueOnce(saved);
    const onSaved = jest.fn();
    await renderWithProviders(<MockTestForm onSaved={onSaved} />, http);
    await fireEvent.changeText(screen.getByLabelText(/^Title/), 'Mock 1');
    await fireEvent.changeText(screen.getByLabelText('Score'), '80');
    await fireEvent.changeText(screen.getByLabelText(/^Max score/), '100');
    await fireEvent.press(await screen.findByText('MS General Surgery'));
    await fireEvent.press(screen.getByText('Save'));
    expect(
      await screen.findByText("Can't reach the server — try again"),
    ).toBeOnTheScreen();
    expect(screen.getByLabelText(/^Title/).props.value).toBe('Mock 1');
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

  it('edits an existing test: starts with its values and saves only the changes', async () => {
    const http = makeHttp();
    http.patch.mockResolvedValue({ id: ID(50) });
    const onSaved = jest.fn();
    const onDirtyChange = jest.fn();
    await renderWithProviders(
      <MockTestForm
        initial={{
          id: ID(50),
          title: 'Mock A',
          takenOn: '2026-11-01',
          score: 7,
          maxScore: 100,
          percent: 7,
          examId: ID(11),
          notes: 'Kept as is',
        }}
        onSaved={onSaved}
        onDirtyChange={onDirtyChange}
      />,
      http,
    );
    expect(screen.getByLabelText(/^Title/).props.value).toBe('Mock A');
    expect(screen.getByLabelText('Score').props.value).toBe('7');
    expect(screen.getByLabelText(/^Max score/).props.value).toBe('100');
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    await fireEvent.changeText(screen.getByLabelText('Score'), '70');
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    await fireEvent.press(screen.getByText('Save changes'));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(http.post).not.toHaveBeenCalled();
    expect(http.patch).toHaveBeenCalledWith(`/v1/mock-tests/${ID(50)}`, {
      title: 'Mock A',
      takenOn: '2026-11-01',
      score: 70,
      maxScore: 100,
      examId: ID(11),
    });
  });

  it('accepts a decimal comma in score fields', async () => {
    const http = makeHttp();
    http.post.mockResolvedValue({ id: ID(5) });
    await renderWithProviders(<MockTestForm onSaved={jest.fn()} />, http);
    await fireEvent.changeText(screen.getByLabelText(/^Title/), 'Mock 1');
    await fireEvent.changeText(screen.getByLabelText('Score'), '72,5');
    await fireEvent.changeText(screen.getByLabelText(/^Max score/), '100,0');
    await fireEvent.press(await screen.findByText('MS General Surgery'));
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(http.post).toHaveBeenCalled());
    expect(http.post.mock.calls[0][1]).toMatchObject({
      score: 72.5,
      maxScore: 100,
    });
  });
});
