import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { ApiError } from '../../../shared/api/errors';
import { TopicForm } from '../TopicForm';
import {
  ID,
  cleanupClients,
  makeHttp,
  renderWithProviders,
  topic,
} from '../testUtils';

afterEach(cleanupClients);

async function fillBasics() {
  await fireEvent.changeText(
    await screen.findByLabelText('Topic name'),
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
    expect(screen.getByLabelText('Topic name').props.value).toBe('Hernia');
    expect(
      screen.getByRole('radio', { name: 'Anatomy' }).props.accessibilityState
        .selected,
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
    expect(await screen.findByText('Required')).toBeOnTheScreen();
    expect(http.post).not.toHaveBeenCalled();
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
      await screen.findByLabelText('Topic name'),
      'Hernia',
    );
    await fireEvent.press(await screen.findByText('+ New subject'));
    await fireEvent.changeText(
      screen.getByLabelText('New subject name'),
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
      await screen.findByLabelText('Topic name'),
      'Hernia',
    );
    await fireEvent.press(await screen.findByText('+ New subject'));
    await fireEvent.changeText(
      screen.getByLabelText('New subject name'),
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

  it('compact mode hides notes and advanced', async () => {
    await renderWithProviders(
      <TopicForm mode="create" compact onSaved={jest.fn()} />,
      makeHttp(),
    );
    await screen.findByLabelText('Topic name');
    expect(screen.queryByLabelText('Notes')).toBeNull();
    expect(screen.queryByText('Advanced')).toBeNull();
  });
});
