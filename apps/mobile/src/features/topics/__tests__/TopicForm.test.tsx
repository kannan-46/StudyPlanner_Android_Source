import React, { createRef } from 'react';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { onlineManager } from '@tanstack/react-query';
import { ApiError } from '../../../shared/api/errors';
import { ScreenScrollContext } from '../../../shared/ui/Screen';
import { TopicForm, type TopicFormHandle } from '../TopicForm';
import {
  ID,
  cleanupClients,
  makeHttp,
  renderWithProviders,
  topic,
} from '../../../test/testUtils';

afterEach(cleanupClients);

async function fillBasics() {
  await fireEvent.changeText(
    await screen.findByLabelText(/^Topic name/),
    'Hernia',
  );
  await fireEvent.press(await screen.findByText('Anatomy'));
}

describe('TopicForm', () => {
  it('keeps values and retries after a NETWORK error', async () => {
    const http = makeHttp();
    const created = topic();
    http.post
      .mockRejectedValueOnce(new ApiError('NETWORK', 0))
      .mockResolvedValueOnce(created);
    const onSaved = jest.fn();
    await renderWithProviders(
      <TopicForm mode="create" onSaved={onSaved} />,
      http,
    );
    await fillBasics();
    await fireEvent.press(screen.getByText('Add topic'));
    expect(
      await screen.findByText("Can't reach the server — try again"),
    ).toBeOnTheScreen();
    expect(screen.getByLabelText(/^Topic name/).props.value).toBe('Hernia');
    expect(
      screen.getByRole('radio', { name: 'Anatomy' }).props.accessibilityState
        .checked,
    ).toBe(true);
    expect(onSaved).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByText('Retry'));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(created));
    expect(http.post).toHaveBeenCalledTimes(2);
    expect(http.post.mock.calls[1][1]).toMatchObject({
      name: 'Hernia',
      subjectId: ID(1),
    });
  });

  it('shows a schema error for an empty name and does not call the API', async () => {
    const http = makeHttp();
    await renderWithProviders(
      <TopicForm mode="create" onSaved={jest.fn()} />,
      http,
    );
    await fireEvent.press(await screen.findByText('Anatomy'));
    await fireEvent.press(screen.getByText('Add topic'));
    expect(await screen.findByText('Enter a topic name')).toBeOnTheScreen();
    expect(http.post).not.toHaveBeenCalled();
  });

  it('clears each error as soon as that field is edited', async () => {
    await renderWithProviders(
      <TopicForm mode="create" onSaved={jest.fn()} />,
      makeHttp(),
    );
    await screen.findByText('Anatomy');
    await fireEvent.press(screen.getByText('Add topic'));
    expect(await screen.findByText('Enter a topic name')).toBeOnTheScreen();
    expect(screen.getByText('Choose a subject')).toBeOnTheScreen();
    expect(
      screen.getByText('Please check: Topic name, Subject'),
    ).toBeOnTheScreen();

    await fireEvent.changeText(screen.getByLabelText(/^Topic name/), 'Hernia');
    expect(screen.queryByText('Enter a topic name')).toBeNull();
    expect(screen.getByText('Choose a subject')).toBeOnTheScreen();
    expect(
      screen.getByText('Please check: Subject'),
    ).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('+ New subject'));
    expect(screen.queryByText('Choose a subject')).toBeNull();
    expect(screen.queryByText(/^Please check/)).toBeNull();

    await fireEvent.press(screen.getByText('Add topic'));
    expect(
      await screen.findByText('Enter a name for the new subject'),
    ).toBeOnTheScreen();
    await fireEvent.changeText(
      screen.getByLabelText(/^New subject name/),
      'Surgery',
    );
    expect(screen.queryByText('Enter a name for the new subject')).toBeNull();
  });

  it('fails fast with Retry when the phone is offline', async () => {
    onlineManager.setOnline(false);
    try {
      const http = makeHttp();
      http.post.mockRejectedValue(new ApiError('NETWORK', 0));
      await renderWithProviders(
        <TopicForm mode="create" onSaved={jest.fn()} />,
        http,
      );
      await fillBasics();
      await fireEvent.press(screen.getByText('Add topic'));
      expect(
        await screen.findByText("Can't reach the server — try again"),
      ).toBeOnTheScreen();
      expect(screen.getByText('Retry')).toBeOnTheScreen();
      expect(screen.queryByTestId('button-spinner')).toBeNull();
    } finally {
      onlineManager.setOnline(true);
    }
  });

  it('clears a connection error when the user edits a field', async () => {
    const http = makeHttp();
    http.post.mockRejectedValue(new ApiError('NETWORK', 0));
    await renderWithProviders(
      <TopicForm mode="create" onSaved={jest.fn()} />,
      http,
    );
    await fillBasics();
    await fireEvent.press(screen.getByText('Add topic'));
    expect(
      await screen.findByText("Can't reach the server — try again"),
    ).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText(/^Topic name/), 'Hernias');
    expect(screen.queryByText("Can't reach the server — try again")).toBeNull();
    expect(screen.queryByText('Retry')).toBeNull();
  });

  it('scrolls to the first invalid field after a failed save', async () => {
    const scrollToView = jest.fn();
    await renderWithProviders(
      <ScreenScrollContext.Provider value={{ scrollToView }}>
        <TopicForm mode="create" onSaved={jest.fn()} />
      </ScreenScrollContext.Provider>,
      makeHttp(),
    );
    await fireEvent.changeText(
      await screen.findByLabelText(/^Topic name/),
      'Hernia',
    );
    await screen.findByText('Anatomy');
    await fireEvent.press(screen.getByText('Add topic'));
    await screen.findByText('Choose a subject');
    expect(scrollToView).toHaveBeenCalledTimes(1);
    expect(scrollToView.mock.calls[0][0]).not.toBeNull();
    // Fixing a field does not jump the screen around.
    await fireEvent.press(screen.getByText('Anatomy'));
    expect(scrollToView).toHaveBeenCalledTimes(1);
  });

  it('custom intervals: number keyboard and plain messages', async () => {
    const http = makeHttp();
    http.post.mockResolvedValue(topic());
    await renderWithProviders(
      <TopicForm mode="create" onSaved={jest.fn()} />,
      http,
    );
    await fillBasics();
    await fireEvent.press(screen.getByText(/Advanced/));
    const field = () => screen.getByLabelText(/^Custom revision days \(after studying\)/);
    expect(field().props.keyboardType).toBe('numeric');

    await fireEvent.changeText(field(), '0, 7, 15');
    await fireEvent.press(screen.getByText('Add topic'));
    expect(
      await screen.findByText('Each interval must be between 1 and 999 days'),
    ).toBeOnTheScreen();

    await fireEvent.changeText(field(), '7, 4');
    expect(
      screen.queryByText('Each interval must be between 1 and 999 days'),
    ).toBeNull();
    await fireEvent.press(screen.getByText('Add topic'));
    expect(
      await screen.findByText('Use numbers that increase, like 4, 7, 15'),
    ).toBeOnTheScreen();
    expect(screen.queryByText(/Too small|expected/)).toBeNull();
    expect(http.post).not.toHaveBeenCalled();

    // Dots work as separators (some number keyboards have no comma).
    await fireEvent.changeText(field(), '4.7.15');
    await fireEvent.press(screen.getByText('Add topic'));
    await waitFor(() => expect(http.post).toHaveBeenCalled());
    expect(http.post.mock.calls[0][1].intervals).toEqual([4, 7, 15]);
  });

  it('shows a studied-date rejection under the date, with no Retry', async () => {
    const http = makeHttp();
    const t = topic();
    http.patch.mockRejectedValue(
      new ApiError('VALIDATION_FAILED', 400, undefined, {
        details: [
          {
            path: ['studiedOn'],
            message: 'studiedOn cannot be after a completed revision',
          },
        ],
      }),
    );
    const onSaved = jest.fn();
    await renderWithProviders(
      <TopicForm mode="edit" initial={t} onSaved={onSaved} />,
      http,
    );
    await fireEvent.changeText(await screen.findByLabelText('Notes'), 'New');
    await fireEvent.press(screen.getByText('Save'));
    expect(
      await screen.findByText(
        "This date can't be after a revision you've already done",
      ),
    ).toBeOnTheScreen();
    expect(screen.queryByText('Some fields are invalid.')).toBeNull();
    expect(screen.queryByText('Retry')).toBeNull();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('shows loading and a Retry when subjects fail to load', async () => {
    const http = makeHttp();
    const get = http.get.getMockImplementation()!;
    let failSubjects!: () => void;
    let held = true;
    http.get.mockImplementation((path: string) => {
      if (path === '/v1/subjects' && held) {
        held = false;
        return new Promise((_resolve, reject) => {
          failSubjects = () => reject(new ApiError('NETWORK', 0));
        });
      }
      return get(path);
    });
    await renderWithProviders(
      <TopicForm mode="create" onSaved={jest.fn()} />,
      http,
    );
    expect(screen.getByLabelText('Loading subjects')).toBeOnTheScreen();
    await act(async () => failSubjects());
    expect(
      await screen.findByText("Couldn't load your subjects"),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Retry'));
    expect(await screen.findByText('Anatomy')).toBeOnTheScreen();
    expect(screen.queryByText("Couldn't load your subjects")).toBeNull();
  });

  it('exposes submit() and hasDraft() through a ref', async () => {
    const http = makeHttp();
    const created = topic();
    http.post.mockResolvedValue(created);
    const ref = createRef<TopicFormHandle>();
    const onSaved = jest.fn();
    const onDraftChange = jest.fn();
    await renderWithProviders(
      <TopicForm
        ref={ref}
        mode="create"
        onSaved={onSaved}
        onDraftChange={onDraftChange}
      />,
      http,
    );
    await screen.findByText('Anatomy');
    expect(ref.current?.hasDraft()).toBe(false);
    let result: unknown;
    await act(async () => {
      result = await ref.current?.submit();
    });
    expect(result).toBeNull();
    expect(screen.getByText('Enter a topic name')).toBeOnTheScreen();

    await fillBasics();
    expect(ref.current?.hasDraft()).toBe(true);
    expect(onDraftChange).toHaveBeenLastCalledWith(true);
    await act(async () => {
      result = await ref.current?.submit();
    });
    expect(result).toEqual(created);
    expect(onSaved).toHaveBeenCalledWith(created);
  });

  it('creates a new subject then the topic with its id', async () => {
    const http = makeHttp();
    http.post.mockImplementation(async (path: string) =>
      path === '/v1/subjects'
        ? { id: ID(9), name: 'Surgery', topicCount: 0 }
        : topic({ subjectId: ID(9) }),
    );
    const onSaved = jest.fn();
    await renderWithProviders(
      <TopicForm mode="create" onSaved={onSaved} />,
      http,
    );
    await fireEvent.changeText(
      await screen.findByLabelText(/^Topic name/),
      'Hernia',
    );
    await fireEvent.press(await screen.findByText('+ New subject'));
    await fireEvent.changeText(
      screen.getByLabelText(/^New subject name/),
      'Surgery',
    );
    await fireEvent.press(screen.getByText('Add topic'));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(http.post.mock.calls[0]).toEqual([
      '/v1/subjects',
      { name: 'Surgery' },
    ]);
    expect(http.post.mock.calls[1][0]).toBe('/v1/topics');
    expect(http.post.mock.calls[1][1].subjectId).toBe(ID(9));
  });

  it('looks up the existing subject on DUPLICATE_NAME', async () => {
    const http = makeHttp();
    http.post.mockImplementation(async (path: string) => {
      if (path === '/v1/subjects') throw new ApiError('DUPLICATE_NAME', 409);
      return topic();
    });
    const onSaved = jest.fn();
    await renderWithProviders(
      <TopicForm mode="create" onSaved={onSaved} />,
      http,
    );
    await fireEvent.changeText(
      await screen.findByLabelText(/^Topic name/),
      'Hernia',
    );
    await fireEvent.press(await screen.findByText('+ New subject'));
    await fireEvent.changeText(
      screen.getByLabelText(/^New subject name/),
      'anatomy',
    );
    await fireEvent.press(screen.getByText('Add topic'));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(http.post.mock.calls[1][1].subjectId).toBe(ID(1));
  });

  it('edit mode sends only the changed fields', async () => {
    const http = makeHttp();
    const t = topic();
    http.patch.mockResolvedValue({ ...t, notes: 'New' });
    const onSaved = jest.fn();
    await renderWithProviders(
      <TopicForm mode="edit" initial={t} onSaved={onSaved} />,
      http,
    );
    await fireEvent.changeText(await screen.findByLabelText('Notes'), 'New');
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(http.patch).toHaveBeenCalledWith(`/v1/topics/${t.id}`, {
      notes: 'New',
    });
  });

  it('edit mode: clearing intervals resets to the settings intervals', async () => {
    const http = makeHttp();
    const t = topic();
    http.patch.mockResolvedValue(t);
    const onSaved = jest.fn();
    await renderWithProviders(
      <TopicForm mode="edit" initial={t} onSaved={onSaved} />,
      http,
    );
    await fireEvent.press(await screen.findByText(/Advanced/));
    await fireEvent.changeText(
      screen.getByLabelText(/^Custom revision days \(after studying\)/),
      '',
    );
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(http.patch).toHaveBeenCalledWith(`/v1/topics/${t.id}`, {
      intervals: [4, 7, 15],
    });
  });

  it('compact mode hides notes and advanced', async () => {
    await renderWithProviders(
      <TopicForm mode="create" compact onSaved={jest.fn()} />,
      makeHttp(),
    );
    await screen.findByLabelText(/^Topic name/);
    expect(screen.queryByLabelText('Notes')).toBeNull();
    expect(screen.queryByText('Advanced')).toBeNull();
  });
});
