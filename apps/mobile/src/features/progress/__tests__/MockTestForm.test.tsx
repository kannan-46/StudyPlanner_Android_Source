import React from 'react';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { onlineManager } from '@tanstack/react-query';
import type { MockTestView } from '@planner/shared';
import { ApiError } from '../../../shared/api/errors';
import { ScreenScrollContext } from '../../../shared/ui/Screen';
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
    // The exam and notes did not change, so they are not sent.
    expect(http.patch).toHaveBeenCalledWith(`/v1/mock-tests/${ID(50)}`, {
      title: 'Mock A',
      takenOn: '2026-11-01',
      score: 70,
      maxScore: 100,
    });
  });

  const saved = (over: Partial<MockTestView> = {}): MockTestView => ({
    id: ID(50),
    title: 'Mock A',
    takenOn: '2026-11-01',
    score: 7,
    maxScore: 100,
    percent: 7,
    examId: ID(11),
    notes: '',
    ...over,
  });

  it('saves a test whose exam was deleted: no chip chosen, no exam sent', async () => {
    const http = makeHttp();
    http.patch.mockResolvedValue({ id: ID(50) });
    const onSaved = jest.fn();
    const onDirtyChange = jest.fn();
    await renderWithProviders(
      <MockTestForm
        initial={saved({ examId: ID(99) })}
        onSaved={onSaved}
        onDirtyChange={onDirtyChange}
      />,
      http,
    );
    const chip = await screen.findByRole('radio', {
      name: /MS General Surgery/,
    });
    expect(chip.props.accessibilityState.checked).toBe(false);
    // Clearing the dead link is not a change the user made.
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    await fireEvent.changeText(screen.getByLabelText('Score'), '70');
    await fireEvent.press(screen.getByText('Save changes'));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(http.patch.mock.calls[0][1]).not.toHaveProperty('examId');
  });

  it('sends a changed exam, including taking it off', async () => {
    const http = makeHttp();
    http.patch.mockResolvedValue({ id: ID(50) });
    const onSaved = jest.fn();
    await renderWithProviders(
      <MockTestForm initial={saved()} onSaved={onSaved} />,
      http,
    );
    await fireEvent.press(await screen.findByText('MS General Surgery'));
    await fireEvent.press(screen.getByText('Save changes'));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(http.patch.mock.calls[0][1]).toMatchObject({ examId: null });
  });

  it('shows a deleted exam next to the Exam field, without Retry', async () => {
    const http = makeHttp();
    http.post.mockRejectedValue(
      new ApiError('VALIDATION_FAILED', 400, undefined, {
        details: [{ path: ['examId'] }],
      }),
    );
    await renderWithProviders(<MockTestForm onSaved={jest.fn()} />, http);
    await fireEvent.changeText(screen.getByLabelText(/^Title/), 'Mock 1');
    await fireEvent.changeText(screen.getByLabelText('Score'), '80');
    await fireEvent.changeText(screen.getByLabelText(/^Max score/), '100');
    await fireEvent.press(await screen.findByText('MS General Surgery'));
    await fireEvent.press(screen.getByText('Save'));
    expect(
      await screen.findByText('That exam no longer exists — choose another'),
    ).toBeOnTheScreen();
    expect(screen.getByText('Fix the exam above')).toBeOnTheScreen();
    expect(screen.queryByText('Retry')).toBeNull();
    expect(
      screen.queryByText("Something here isn't right — check it and try again"),
    ).toBeNull();
  });

  describe('notes', () => {
    it('starts with the saved notes and saves a change', async () => {
      const http = makeHttp();
      http.patch.mockResolvedValue({ id: ID(50) });
      const onSaved = jest.fn();
      const onDirtyChange = jest.fn();
      await renderWithProviders(
        <MockTestForm
          initial={saved({ notes: 'Grand test 01' })}
          onSaved={onSaved}
          onDirtyChange={onDirtyChange}
        />,
        http,
      );
      const notes = screen.getByLabelText(/^Notes/);
      expect(notes.props.value).toBe('Grand test 01');
      expect(notes.props.maxLength).toBe(1000);
      expect(notes.props.multiline).toBe(true);
      await fireEvent.changeText(notes, 'Grand test 01 · weak in ortho');
      expect(onDirtyChange).toHaveBeenLastCalledWith(true);
      await fireEvent.press(screen.getByText('Save changes'));
      await waitFor(() => expect(onSaved).toHaveBeenCalled());
      expect(http.patch.mock.calls[0][1]).toMatchObject({
        notes: 'Grand test 01 · weak in ortho',
      });
    });

    it('sends notes with a new test', async () => {
      const http = makeHttp();
      http.post.mockResolvedValue({ id: ID(5) });
      await renderWithProviders(<MockTestForm onSaved={jest.fn()} />, http);
      await fireEvent.changeText(screen.getByLabelText(/^Title/), 'Mock 1');
      await fireEvent.changeText(screen.getByLabelText('Score'), '80');
      await fireEvent.changeText(screen.getByLabelText(/^Max score/), '100');
      await fireEvent.changeText(screen.getByLabelText(/^Notes/), 'Marrow GT');
      await fireEvent.press(screen.getByText('Save'));
      await waitFor(() => expect(http.post).toHaveBeenCalled());
      expect(http.post.mock.calls[0][1]).toMatchObject({ notes: 'Marrow GT' });
    });
  });

  it('scrolls to and focuses the first invalid field after a failed save', async () => {
    const scrollToView = jest.fn();
    await renderWithProviders(
      <ScreenScrollContext.Provider value={{ scrollToView }}>
        <MockTestForm onSaved={jest.fn()} />
      </ScreenScrollContext.Provider>,
      makeHttp(),
    );
    await fireEvent.changeText(screen.getByLabelText('Score'), '80');
    await fireEvent.changeText(screen.getByLabelText(/^Max score/), '100');
    await fireEvent.press(screen.getByText('Save'));
    expect(await screen.findByText('Enter a title')).toBeOnTheScreen();
    expect(screen.getByText('Fix the title above')).toBeOnTheScreen();
    expect(scrollToView).toHaveBeenCalledTimes(1);
    expect(scrollToView.mock.calls[0][0]).not.toBeNull();
    // Fixing a field does not scroll again.
    await fireEvent.changeText(screen.getByLabelText(/^Title/), 'M');
    expect(scrollToView).toHaveBeenCalledTimes(1);
  });

  it('reports while it is saving', async () => {
    const http = makeHttp();
    let resolve!: (v: unknown) => void;
    http.post.mockReturnValue(new Promise(r => (resolve = r)));
    const onSavingChange = jest.fn();
    await renderWithProviders(
      <MockTestForm onSaved={jest.fn()} onSavingChange={onSavingChange} />,
      http,
    );
    await fireEvent.changeText(screen.getByLabelText(/^Title/), 'Mock 1');
    await fireEvent.changeText(screen.getByLabelText('Score'), '80');
    await fireEvent.changeText(screen.getByLabelText(/^Max score/), '100');
    // Not awaited: the save stays pending until resolve() below.
    fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(onSavingChange).toHaveBeenLastCalledWith(true));
    await act(async () => resolve({ id: ID(5) }));
    await waitFor(() => expect(onSavingChange).toHaveBeenLastCalledWith(false));
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
