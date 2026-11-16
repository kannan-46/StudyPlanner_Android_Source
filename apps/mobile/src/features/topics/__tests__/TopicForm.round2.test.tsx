import React, { createRef } from 'react';
import { AccessibilityInfo } from 'react-native';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { ExamView, TopicView } from '@planner/shared';
import { ApiError } from '../../../shared/api/errors';
import {
  TopicForm,
  defaultExamSelection,
  tooFewIntervalsMessage,
  type TopicFormHandle,
} from '../TopicForm';
import {
  ID,
  cleanupClients,
  exams,
  makeHttp,
  renderWithProviders,
  subjects,
  topic,
} from '../../../test/testUtils';

afterEach(cleanupClients);

const NEET: ExamView = { id: ID(12), name: 'NEET SS', examDate: null };

/** makeHttp with a different exams list. */
function httpWithExams(list: ExamView[], topics: TopicView[] = []) {
  const http = makeHttp(topics);
  const known = http.get.getMockImplementation() as (
    p: string,
    q?: unknown,
  ) => unknown;
  http.get.mockImplementation(async (path: string, q?: unknown) =>
    path === '/v1/exams' ? list : known(path, q),
  );
  return http;
}

const examChecked = (name: string) =>
  screen.getByRole('checkbox', { name }).props.accessibilityState.checked;

/** A topic with `done` of its three revisions done. */
const doneTopic = (done: number) =>
  topic({
    intervals: [4, 7, 15],
    revisions: [1, 2, 3].map(step => ({
      id: `R${step}`,
      step,
      dueOn: `2026-11-0${step + 1}`,
      doneOn: step <= done ? `2026-11-0${step + 1}` : null,
      dueOverride: null,
    })),
  });

describe('defaultExamSelection', () => {
  it('waits for exams, then picks all, the wanted ones or the only one', () => {
    expect(defaultExamSelection(undefined)).toBeNull();
    expect(defaultExamSelection([...exams, NEET], 'all')).toEqual([
      ID(11),
      ID(12),
    ]);
    expect(defaultExamSelection([...exams, NEET], [ID(12)])).toEqual([ID(12)]);
    expect(defaultExamSelection([...exams, NEET], ['gone'])).toEqual([]);
    expect(defaultExamSelection(exams)).toEqual([ID(11)]);
    expect(defaultExamSelection([...exams, NEET])).toEqual([]);
  });
});

describe('TopicForm exam defaults (F23)', () => {
  it('ticks the only exam on a new topic, without counting as a change', async () => {
    const http = makeHttp();
    http.post.mockResolvedValue(topic());
    const onDirtyChange = jest.fn();
    await renderWithProviders(
      <TopicForm
        mode="create"
        onSaved={jest.fn()}
        onDirtyChange={onDirtyChange}
      />,
      http,
    );
    await waitFor(() => expect(examChecked('MS General Surgery')).toBe(true));
    expect(onDirtyChange).not.toHaveBeenCalledWith(true);
    await fireEvent.changeText(screen.getByLabelText(/^Topic name/), 'Hernia');
    await fireEvent.press(screen.getByText('Anatomy'));
    await fireEvent.press(screen.getByText('Add topic'));
    await waitFor(() => expect(http.post).toHaveBeenCalled());
    expect(http.post.mock.calls[0][1].examIds).toEqual([ID(11)]);
  });

  it('ticks nothing when there are several exams', async () => {
    await renderWithProviders(
      <TopicForm mode="create" onSaved={jest.fn()} />,
      httpWithExams([...exams, NEET]),
    );
    await screen.findByText('NEET SS');
    expect(examChecked('NEET SS')).toBe(false);
    expect(examChecked('MS General Surgery')).toBe(false);
  });

  it('ticks every exam in setup ("all")', async () => {
    await renderWithProviders(
      <TopicForm mode="create" onSaved={jest.fn()} defaultExamIds="all" />,
      httpWithExams([...exams, NEET]),
    );
    await waitFor(() => expect(examChecked('NEET SS')).toBe(true));
    expect(examChecked('MS General Surgery')).toBe(true);
  });

  it('ticks the filtered exam', async () => {
    await renderWithProviders(
      <TopicForm mode="create" onSaved={jest.fn()} defaultExamIds={[ID(12)]} />,
      httpWithExams([...exams, NEET]),
    );
    await waitFor(() => expect(examChecked('NEET SS')).toBe(true));
    expect(examChecked('MS General Surgery')).toBe(false);
  });

  it('ticks the defaults when the exams arrive after the form opened', async () => {
    const http = makeHttp();
    const get = http.get.getMockImplementation()!;
    let releaseExams: (() => void) | undefined;
    http.get.mockImplementation((path: string, q?: unknown) =>
      path === '/v1/exams'
        ? new Promise(resolve => {
            releaseExams = () => resolve([...exams, NEET]);
          })
        : get(path, q),
    );
    const onDirtyChange = jest.fn();
    await renderWithProviders(
      <TopicForm
        mode="create"
        onSaved={jest.fn()}
        defaultExamIds="all"
        onDirtyChange={onDirtyChange}
      />,
      http,
    );
    await waitFor(() => expect(releaseExams).toBeDefined());
    await act(async () => releaseExams?.());
    await waitFor(() => expect(examChecked('NEET SS')).toBe(true));
    expect(examChecked('MS General Surgery')).toBe(true);
    expect(onDirtyChange).not.toHaveBeenCalledWith(true);
  });
});

describe('TopicForm new subject (F24)', () => {
  it('after "add another", selects the subject it just created', async () => {
    const http = makeHttp();
    const created = { id: ID(9), name: 'Surgery', topicCount: 0 };
    http.post.mockImplementation(async (path: string) =>
      path === '/v1/subjects' ? created : topic({ subjectId: ID(9) }),
    );
    // The subjects refetch still returns the old list (it may lag or fail).
    const onSaved = jest.fn();
    await renderWithProviders(
      <TopicForm mode="create" clearNameOnSave onSaved={onSaved} />,
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
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(
      screen.getByRole('radio', { name: 'Surgery' }).props.accessibilityState
        .checked,
    ).toBe(true);
    expect(
      screen.getByRole('radio', { name: '+ New subject' }).props
        .accessibilityState.checked,
    ).toBe(false);
    expect(screen.queryByLabelText(/^New subject name/)).toBeNull();
    expect(screen.getByLabelText(/^Topic name/).props.value).toBe('');

    await fireEvent.changeText(screen.getByLabelText(/^Topic name/), 'Appendix');
    await fireEvent.press(screen.getByText('Add topic'));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(2));
    const paths = http.post.mock.calls.map(c => c[0]);
    expect(paths).toEqual(['/v1/subjects', '/v1/topics', '/v1/topics']);
    expect(http.post.mock.calls[2][1].subjectId).toBe(ID(9));
  });
});

describe('TopicForm intervals vs done revisions (F27)', () => {
  it('asks to keep as many intervals as revisions done, before saving', async () => {
    const http = makeHttp();
    await renderWithProviders(
      <TopicForm mode="edit" initial={doneTopic(2)} onSaved={jest.fn()} />,
      http,
    );
    await fireEvent.press(await screen.findByText(/Advanced/));
    expect(
      screen.getByText("You've done 2 revisions, so keep at least 2 intervals"),
    ).toBeOnTheScreen();
    await fireEvent.changeText(
      screen.getByLabelText(/^Custom revision days \(after studying\)/),
      '4',
    );
    await fireEvent.press(screen.getByText('Save'));
    expect(await screen.findByText(tooFewIntervalsMessage(2))).toBeOnTheScreen();
    expect(screen.queryByText(/^Something here/)).toBeNull();
    expect(http.patch).not.toHaveBeenCalled();
  });

  it('the same message when the server refuses shortened intervals', async () => {
    const http = makeHttp();
    http.patch.mockRejectedValue(new ApiError('VALIDATION_FAILED', 400));
    await renderWithProviders(
      <TopicForm mode="edit" initial={doneTopic(1)} onSaved={jest.fn()} />,
      http,
    );
    await fireEvent.press(await screen.findByText(/Advanced/));
    await fireEvent.changeText(
      screen.getByLabelText(/^Custom revision days \(after studying\)/),
      '5, 9',
    );
    await fireEvent.press(screen.getByText('Save'));
    expect(
      await screen.findByText(
        "You've already done 1 revision — keep at least 1 interval",
      ),
    ).toBeOnTheScreen();
  });

  it('maps a server intervals detail about completed revisions', async () => {
    const http = makeHttp();
    http.patch.mockRejectedValue(
      new ApiError('VALIDATION_FAILED', 400, undefined, {
        details: [
          {
            path: ['intervals'],
            message:
              'intervals cannot have fewer entries than completed revisions',
          },
        ],
      }),
    );
    await renderWithProviders(
      <TopicForm mode="edit" initial={doneTopic(2)} onSaved={jest.fn()} />,
      http,
    );
    await fireEvent.changeText(await screen.findByLabelText('Notes'), 'x');
    await fireEvent.press(screen.getByText('Save'));
    expect(await screen.findByText(tooFewIntervalsMessage(2))).toBeOnTheScreen();
  });
});

describe('TopicForm exams section (F32)', () => {
  it('shows loading, then a Retry when exams fail to load', async () => {
    const http = makeHttp();
    const get = http.get.getMockImplementation()!;
    let failExams!: () => void;
    let held = true;
    http.get.mockImplementation((path: string, q?: unknown) => {
      if (path === '/v1/exams' && held) {
        held = false;
        return new Promise((_resolve, reject) => {
          failExams = () => reject(new ApiError('NETWORK', 0));
        });
      }
      return get(path, q);
    });
    await renderWithProviders(
      <TopicForm mode="create" onSaved={jest.fn()} />,
      http,
    );
    expect(screen.getByLabelText('Loading exams')).toBeOnTheScreen();
    await act(async () => failExams());
    expect(
      await screen.findByText("Couldn't load your exams"),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Retry'));
    expect(await screen.findByText('MS General Surgery')).toBeOnTheScreen();
  });

  it('says "No exams yet" and lets the student add one there', async () => {
    const http = httpWithExams([]);
    http.post.mockResolvedValue(NEET);
    await renderWithProviders(
      <TopicForm mode="create" onSaved={jest.fn()} />,
      http,
    );
    expect(await screen.findByText('No exams yet')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('+ New exam'));
    await fireEvent.press(screen.getByRole('button', { name: 'Add exam' }));
    expect(
      await screen.findByText('Enter a name for the exam'),
    ).toBeOnTheScreen();
    expect(http.post).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText(/^Exam name/), 'NEET SS');
    await fireEvent.press(screen.getByRole('button', { name: 'Add exam' }));
    await waitFor(() =>
      expect(http.post).toHaveBeenCalledWith('/v1/exams', { name: 'NEET SS' }),
    );
    await waitFor(() => expect(examChecked('NEET SS')).toBe(true));
    expect(screen.queryByText('New exam')).toBeNull();
  });

  it('a duplicate exam name ticks the existing exam', async () => {
    const http = httpWithExams([...exams, NEET]);
    http.post.mockRejectedValue(new ApiError('DUPLICATE_NAME', 409));
    await renderWithProviders(
      <TopicForm mode="create" onSaved={jest.fn()} />,
      http,
    );
    await screen.findByText('NEET SS');
    await fireEvent.press(screen.getByText('+ New exam'));
    await fireEvent.changeText(screen.getByLabelText(/^Exam name/), 'neet ss');
    await fireEvent.press(screen.getByRole('button', { name: 'Add exam' }));
    await waitFor(() => expect(examChecked('NEET SS')).toBe(true));
  });
});

describe('TopicForm deleted exams (F78)', () => {
  it('never sends an exam that no longer exists', async () => {
    const http = httpWithExams([...exams, NEET]);
    const t = topic({ examIds: ['gone-exam', ID(11)] });
    http.patch.mockResolvedValue(t);
    const onSaved = jest.fn();
    await renderWithProviders(
      <TopicForm mode="edit" initial={t} onSaved={onSaved} />,
      http,
    );
    await screen.findByText('NEET SS');
    expect(examChecked('MS General Surgery')).toBe(true);
    await fireEvent.changeText(screen.getByLabelText('Notes'), 'New');
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(http.patch).toHaveBeenCalledWith(`/v1/topics/${t.id}`, {
      notes: 'New',
    });
  });

  it('unticks a gone exam when the server refuses it', async () => {
    let examList: ExamView[] = [...exams, NEET];
    const http = makeHttp();
    const known = http.get.getMockImplementation() as (
      p: string,
      q?: unknown,
    ) => unknown;
    http.get.mockImplementation(async (path: string, q?: unknown) =>
      path === '/v1/exams' ? examList : known(path, q),
    );
    http.patch.mockRejectedValueOnce(
      new ApiError('VALIDATION_FAILED', 400, undefined, {
        details: [{ path: ['examIds'], message: 'unknown exam' }],
      }),
    );
    const t = topic({ examIds: [ID(11)] });
    await renderWithProviders(
      <TopicForm mode="edit" initial={t} onSaved={jest.fn()} />,
      http,
    );
    await fireEvent.press(await screen.findByText('NEET SS'));
    examList = [...exams];
    await fireEvent.press(screen.getByText('Save'));
    expect(
      await screen.findByText(
        'One of the chosen exams no longer exists — check the exams and save again',
      ),
    ).toBeOnTheScreen();
    await waitFor(() => expect(screen.queryByText('NEET SS')).toBeNull());
  });

  it('sends only existing exams when exams change', async () => {
    const http = httpWithExams([...exams, NEET]);
    const t = topic({ examIds: ['gone-exam'] });
    http.patch.mockResolvedValue(t);
    const onSaved = jest.fn();
    await renderWithProviders(
      <TopicForm mode="edit" initial={t} onSaved={onSaved} />,
      http,
    );
    await fireEvent.press(await screen.findByText('NEET SS'));
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(http.patch).toHaveBeenCalledWith(`/v1/topics/${t.id}`, {
      examIds: [ID(12)],
    });
  });

  it('a name-only edit does not send the stale exam', async () => {
    const http = httpWithExams([...exams]);
    const t = topic({ examIds: ['gone-exam', ID(11)] });
    http.patch.mockResolvedValue(t);
    const onSaved = jest.fn();
    await renderWithProviders(
      <TopicForm mode="edit" initial={t} onSaved={onSaved} />,
      http,
    );
    await screen.findByText('MS General Surgery');
    await fireEvent.changeText(screen.getByLabelText(/^Topic name/), 'Hernias');
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(http.patch).toHaveBeenCalledWith(`/v1/topics/${t.id}`, {
      name: 'Hernias',
    });
  });
});

describe('TopicForm accessibility and saving (F58, F116)', () => {
  it('announces an error that has no field to focus', async () => {
    const spy = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    try {
      await renderWithProviders(
        <TopicForm mode="create" onSaved={jest.fn()} />,
        makeHttp(),
      );
      await fireEvent.changeText(
        await screen.findByLabelText(/^Topic name/),
        'Hernia',
      );
      await screen.findByText(subjects[0].name);
      spy.mockClear();
      await fireEvent.press(screen.getByText('Add topic'));
      await screen.findByText('Choose a subject');
      expect(spy).toHaveBeenCalledWith('Subject: Choose a subject');
      expect(screen.getByText('Please check: Subject')).toBeOnTheScreen();
    } finally {
      spy.mockRestore();
    }
  });

  it('reports when a save starts and ends', async () => {
    const http = makeHttp();
    let resolve!: (t: TopicView) => void;
    http.post.mockReturnValue(new Promise(r => (resolve = r)));
    const onSavingChange = jest.fn();
    const ref = createRef<TopicFormHandle>();
    await renderWithProviders(
      <TopicForm
        ref={ref}
        mode="create"
        onSaved={jest.fn()}
        onSavingChange={onSavingChange}
      />,
      http,
    );
    await fireEvent.changeText(
      await screen.findByLabelText(/^Topic name/),
      'Hernia',
    );
    await fireEvent.press(await screen.findByText('Anatomy'));
    // Not through a press: that would wait for the held save.
    let saved: Promise<unknown> = Promise.resolve();
    await act(async () => {
      saved = ref.current!.submit();
    });
    await waitFor(() => expect(onSavingChange).toHaveBeenLastCalledWith(true));
    await act(async () => {
      resolve(topic());
      await saved;
    });
    await waitFor(() => expect(onSavingChange).toHaveBeenLastCalledWith(false));
  });

  it('says nothing when the save ends because the user signed out', async () => {
    const http = makeHttp();
    http.post.mockRejectedValue(
      new ApiError('UNAUTHENTICATED', 401, undefined, { sessionEnded: true }),
    );
    await renderWithProviders(
      <TopicForm mode="create" onSaved={jest.fn()} />,
      http,
    );
    await fireEvent.changeText(
      await screen.findByLabelText(/^Topic name/),
      'Hernia',
    );
    await fireEvent.press(await screen.findByText('Anatomy'));
    await fireEvent.press(screen.getByText('Add topic'));
    await waitFor(() => expect(http.post).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.queryByText(/session ended/i)).toBeNull();
    expect(screen.queryByText('Retry')).toBeNull();
  });

  it('a full topic list says how many topics are allowed, with no Retry', async () => {
    const http = makeHttp();
    http.post.mockRejectedValue(new ApiError('LIMIT_EXCEEDED', 409));
    await renderWithProviders(
      <TopicForm mode="create" onSaved={jest.fn()} />,
      http,
    );
    await fireEvent.changeText(
      await screen.findByLabelText(/^Topic name/),
      'Hernia',
    );
    await fireEvent.press(await screen.findByText('Anatomy'));
    await fireEvent.press(screen.getByText('Add topic'));
    expect(
      await screen.findByText(
        'You can have up to 5,000 topics — delete some to add more',
      ),
    ).toBeOnTheScreen();
    expect(screen.queryByText('Retry')).toBeNull();
  });
});

describe('TopicForm with many subjects (F29)', () => {
  it('puts many subjects on one sideways row, "+ New subject" first', async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      id: ID(200 + i),
      name: `Subject ${i + 1}`,
      topicCount: 0,
    }));
    const http = makeHttp();
    const known = http.get.getMockImplementation() as (
      p: string,
      q?: unknown,
    ) => unknown;
    http.get.mockImplementation(async (path: string, q?: unknown) =>
      path === '/v1/subjects' ? many : known(path, q),
    );
    await renderWithProviders(
      <TopicForm mode="create" onSaved={jest.fn()} />,
      http,
    );
    await screen.findByText('Subject 12');
    expect(screen.getByTestId('chip-scroll-subject').props.horizontal).toBe(
      true,
    );
    const radios = screen.getAllByRole('radio');
    expect(radios[0].props.accessibilityHint).toBe('Subject');
  });
});
