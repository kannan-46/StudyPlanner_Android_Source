import React from 'react';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { ApiError } from '../../../shared/api/errors';
import { ManageExamsSubjectsScreen } from '../ManageExamsSubjectsScreen';
import {
  ID,
  cleanupClients,
  makeHttp,
  renderWithProviders,
} from '../../../test/testUtils';

let mockPickDate = new Date(2027, 0, 15);
jest.mock('@react-native-community/datetimepicker', () => {
  const { Pressable } = require('react-native');
  const R = require('react');
  return {
    __esModule: true,
    default: (props: { onChange: (e: unknown, d: Date) => void }) =>
      R.createElement(Pressable, {
        testID: 'date-picker',
        onPress: () => props.onChange({ type: 'set' }, mockPickDate),
      }),
  };
});
const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useFocusEffect: jest.fn(),
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
}));
afterEach(async () => {
  await cleanupClients();
  mockNavigate.mockClear();
});

const stats = (byExam: { examId: string; topicCount: number }[]) => ({
  topics: 0,
  activeTopics: 0,
  completedTopics: 0,
  revisionsDone: 0,
  revisionsPending: 0,
  overdue: 0,
  dueToday: 0,
  bySubject: [],
  byExam: byExam.map(e => ({ ...e, name: 'x' })),
});
const mock = (id: number, examId: string | null) => ({
  id: ID(id),
  title: `Mock ${id}`,
  takenOn: '2026-11-01',
  score: 1,
  maxScore: 2,
  percent: 50,
  examId,
  notes: '',
});

/** makeHttp plus stats and mock tests, for the counts. */
function httpWithCounts(
  byExam: { examId: string; topicCount: number }[],
  mockTests: ReturnType<typeof mock>[],
) {
  const http = makeHttp();
  const base = http.get.getMockImplementation() as (p: string) => unknown;
  http.get.mockImplementation(async (path: string) => {
    if (path === '/v1/stats') return stats(byExam);
    if (path === '/v1/mock-tests') return mockTests;
    return base(path);
  });
  return http;
}

const isDisabled = (label: string) =>
  screen.getByRole('button', { name: label }).props.accessibilityState.disabled;

const pressLast = async (label: string) => {
  const all = screen.getAllByText(label);
  await fireEvent.press(all[all.length - 1]);
};

it('renames an exam', async () => {
  const http = makeHttp();
  http.patch.mockResolvedValue({});
  await renderWithProviders(<ManageExamsSubjectsScreen />, http);
  await screen.findByText('MS General Surgery');
  await fireEvent.press(screen.getAllByText('Rename')[0]);
  await fireEvent.changeText(await screen.findByLabelText('Exam name'), 'FRCS');
  await screen.findByDisplayValue('FRCS');
  await fireEvent.press(screen.getByText('Save'));
  await waitFor(() =>
    expect(http.patch).toHaveBeenCalledWith(`/v1/exams/${ID(11)}`, {
      name: 'FRCS',
    }),
  );
  await waitFor(() => expect(screen.queryByText('Save')).toBeNull());
});

it('confirms exam deletion naming the exam, its topics and mock tests', async () => {
  const http = httpWithCounts(
    [{ examId: ID(11), topicCount: 48 }],
    [mock(60, ID(11)), mock(61, ID(11)), mock(62, ID(11)), mock(63, null)],
  );
  http.del.mockResolvedValue(undefined);
  await renderWithProviders(<ManageExamsSubjectsScreen />, http);
  await screen.findByText('MS General Surgery');
  // The exam row shows how many topics use it.
  expect(await screen.findByText('No date set · 48 topics')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Delete MS General Surgery'));
  expect(await screen.findByText('Delete MS General Surgery?')).toBeTruthy();
  expect(
    screen.getByText(
      "Your 48 topics and 3 mock tests will stay, but won't be linked to MS General Surgery any more.",
    ),
  ).toBeTruthy();
  await pressLast('Delete');
  await waitFor(() =>
    expect(http.del).toHaveBeenCalledWith(`/v1/exams/${ID(11)}`),
  );
  expect(await screen.findByText('MS General Surgery deleted')).toBeTruthy();
  expect(screen.queryByText('Delete MS General Surgery?')).toBeNull();
});

it('without counts the exam dialog still says topics and mock tests stay', async () => {
  const http = makeHttp();
  await renderWithProviders(<ManageExamsSubjectsScreen />, http);
  await screen.findByText('MS General Surgery');
  await fireEvent.press(screen.getAllByText('Delete')[0]);
  expect(
    await screen.findByText(
      "Your topics and mock tests will stay, but won't be linked to MS General Surgery any more.",
    ),
  ).toBeTruthy();
});

it('a subject with topics explains why and offers Show topics, not Delete', async () => {
  const http = makeHttp();
  await renderWithProviders(<ManageExamsSubjectsScreen />, http);
  await screen.findByText('Anatomy');
  await fireEvent.press(screen.getByLabelText('Delete Anatomy'));
  expect(await screen.findByText('Delete Anatomy?')).toBeTruthy();
  expect(
    screen.getByText(
      'Anatomy still has 1 topic (completed ones count too). Move it to another subject or delete it first.',
    ),
  ).toBeTruthy();
  // No red Delete that is sure to fail.
  expect(screen.queryByRole('button', { name: /^Delete$/ })).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Show topics' }));
  expect(mockNavigate).toHaveBeenCalledWith('MainTabs', {
    screen: 'Topics',
    params: { subjectId: ID(1) },
  });
  expect(http.del).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.queryByText('Delete Anatomy?')).toBeNull());
});

it('a subject with no topics deletes, and says so', async () => {
  const http = makeHttp();
  http.del.mockResolvedValue(undefined);
  await renderWithProviders(<ManageExamsSubjectsScreen />, http);
  await screen.findByText('Physiology');
  await fireEvent.press(screen.getByLabelText('Delete Physiology'));
  expect(
    await screen.findByText(
      'Physiology has no topics, so nothing else changes.',
    ),
  ).toBeTruthy();
  await pressLast('Delete');
  await waitFor(() =>
    expect(http.del).toHaveBeenCalledWith(`/v1/subjects/${ID(2)}`),
  );
  expect(await screen.findByText('Physiology deleted')).toBeTruthy();
});

it('SUBJECT_IN_USE (count out of date) offers Show topics in the snackbar', async () => {
  const http = makeHttp();
  http.del.mockRejectedValue(new ApiError('SUBJECT_IN_USE', 409));
  await renderWithProviders(<ManageExamsSubjectsScreen />, http);
  await screen.findByText('Physiology');
  await fireEvent.press(screen.getByLabelText('Delete Physiology'));
  await screen.findByText('Delete Physiology?');
  await pressLast('Delete');
  expect(
    await screen.findByText('Move or delete its topics first'),
  ).toBeTruthy();
  await fireEvent.press(screen.getByTestId('snackbar-action'));
  expect(mockNavigate).toHaveBeenCalledWith('MainTabs', {
    screen: 'Topics',
    params: { subjectId: ID(2) },
  });
});

it('opens the subject dialog with the latest topic count', async () => {
  const http = makeHttp();
  let anatomyCount = 1;
  const base = http.get.getMockImplementation() as (p: string) => unknown;
  http.get.mockImplementation(async (path: string) =>
    path === '/v1/subjects'
      ? [{ id: ID(1), name: 'Anatomy', topicCount: anatomyCount }]
      : base(path),
  );
  http.del.mockResolvedValue(undefined);
  await renderWithProviders(<ManageExamsSubjectsScreen />, http);
  await screen.findByText('1 topic');
  // Its last topic was moved elsewhere since the list loaded.
  anatomyCount = 0;
  await fireEvent.press(screen.getByLabelText('Delete Anatomy'));
  expect(
    await screen.findByText('Anatomy has no topics, so nothing else changes.'),
  ).toBeTruthy();
});

describe('name field in the dialogs', () => {
  it('is focused when adding, without selecting anything', async () => {
    await renderWithProviders(<ManageExamsSubjectsScreen />, makeHttp());
    await screen.findByText('Anatomy');
    await fireEvent.press(screen.getByText('Add subject'));
    const field = await screen.findByLabelText('Subject name');
    expect(field.props.autoFocus).toBe(true);
    expect(field.props.selectTextOnFocus).toBe(false);
    expect(field.props.returnKeyType).toBe('done');
  });

  it('selects the old name when renaming, and Done saves', async () => {
    const http = makeHttp();
    http.patch.mockResolvedValue({});
    await renderWithProviders(<ManageExamsSubjectsScreen />, http);
    await screen.findByText('Anatomy');
    await fireEvent.press(screen.getByLabelText('Rename Anatomy'));
    const field = await screen.findByLabelText('Subject name');
    expect(field.props.autoFocus).toBe(true);
    expect(field.props.selectTextOnFocus).toBe(true);
    await fireEvent.changeText(field, 'Gross anatomy');
    await fireEvent(screen.getByLabelText('Subject name'), 'submitEditing');
    await waitFor(() =>
      expect(http.patch).toHaveBeenCalledWith(`/v1/subjects/${ID(1)}`, {
        name: 'Gross anatomy',
      }),
    );
  });

  it('Done on a new exam name does not save before the date', async () => {
    const http = makeHttp();
    await renderWithProviders(<ManageExamsSubjectsScreen />, http);
    await screen.findByText('MS General Surgery');
    await fireEvent.press(screen.getByText('Add exam'));
    const field = await screen.findByLabelText('Exam name');
    expect(field.props.onSubmitEditing).toBeUndefined();
  });
});

it('shows the shared accent loading spinner while lists load', async () => {
  const http = makeHttp();
  http.get.mockReturnValue(new Promise(() => {}));
  await renderWithProviders(<ManageExamsSubjectsScreen />, http);
  expect(screen.getByLabelText('Loading')).toBeTruthy();
});

describe('adding', () => {
  it('adds an exam with a date', async () => {
    mockPickDate = new Date(2027, 0, 15);
    const http = makeHttp();
    http.post.mockResolvedValue({
      id: ID(12),
      name: 'NEET SS',
      examDate: '2027-01-15',
    });
    await renderWithProviders(<ManageExamsSubjectsScreen />, http);
    await screen.findByText('MS General Surgery');
    await fireEvent.press(screen.getByText('Add exam'));
    await fireEvent.changeText(
      await screen.findByLabelText('Exam name'),
      '  NEET   SS ',
    );
    const dateField = screen.getByLabelText('Exam date (optional)');
    expect(dateField).toHaveTextContent('No date set');
    await fireEvent.press(dateField);
    await fireEvent.press(screen.getByTestId('date-picker'));
    expect(await screen.findByText('15 Jan 2027')).toBeTruthy();
    await fireEvent.press(screen.getByText('Add'));
    await waitFor(() =>
      expect(http.post).toHaveBeenCalledWith('/v1/exams', {
        name: 'NEET SS',
        examDate: '2027-01-15',
      }),
    );
    expect(await screen.findByText('NEET SS added')).toBeTruthy();
    await waitFor(() => expect(screen.queryByText('Add')).toBeNull());
  });

  it('adds an exam without a date', async () => {
    const http = makeHttp();
    http.post.mockResolvedValue({ id: ID(12), name: 'INI-SS', examDate: null });
    await renderWithProviders(<ManageExamsSubjectsScreen />, http);
    await screen.findByText('MS General Surgery');
    await fireEvent.press(screen.getByText('Add exam'));
    await fireEvent.changeText(
      await screen.findByLabelText('Exam name'),
      'INI-SS',
    );
    await fireEvent.press(screen.getByText('Add'));
    await waitFor(() =>
      expect(http.post).toHaveBeenCalledWith('/v1/exams', { name: 'INI-SS' }),
    );
  });

  it('keeps the dialog and draft open with a friendly duplicate message', async () => {
    const http = makeHttp();
    http.post.mockRejectedValue(new ApiError('DUPLICATE_NAME', 409));
    await renderWithProviders(<ManageExamsSubjectsScreen />, http);
    await screen.findByText('MS General Surgery');
    await fireEvent.press(screen.getByText('Add exam'));
    await fireEvent.changeText(
      await screen.findByLabelText('Exam name'),
      'MS General Surgery',
    );
    await fireEvent.press(screen.getByText('Add'));
    expect(
      await screen.findByText('You already have one with that name'),
    ).toBeTruthy();
    expect(screen.getByDisplayValue('MS General Surgery')).toBeTruthy();
    expect(screen.getByText('Add')).toBeTruthy();
  });

  it('asks for a name before adding', async () => {
    const http = makeHttp();
    await renderWithProviders(<ManageExamsSubjectsScreen />, http);
    await screen.findByText('Anatomy');
    await fireEvent.press(screen.getByText('Add subject'));
    await fireEvent.press(await screen.findByText('Add'));
    expect(await screen.findByText('Enter a name')).toBeTruthy();
    expect(http.post).not.toHaveBeenCalled();
  });

  it('adds a subject', async () => {
    const http = makeHttp();
    http.post.mockResolvedValue({ id: ID(3), name: 'Surgery', topicCount: 0 });
    await renderWithProviders(<ManageExamsSubjectsScreen />, http);
    await screen.findByText('Anatomy');
    await fireEvent.press(screen.getByText('Add subject'));
    await fireEvent.changeText(
      await screen.findByLabelText('Subject name'),
      'Surgery',
    );
    await fireEvent.press(screen.getByText('Add'));
    await waitFor(() =>
      expect(http.post).toHaveBeenCalledWith('/v1/subjects', {
        name: 'Surgery',
      }),
    );
    expect(await screen.findByText('Surgery added')).toBeTruthy();
  });
});

describe('exam date', () => {
  it('Clear date shows "No date set" and saves no date', async () => {
    const http = makeHttp();
    http.get.mockImplementation(async (path: string) => {
      if (path === '/v1/exams') {
        return [{ id: ID(11), name: 'NEET SS', examDate: '2027-03-01' }];
      }
      return [];
    });
    http.patch.mockResolvedValue({});
    await renderWithProviders(<ManageExamsSubjectsScreen />, http);
    await screen.findByText('NEET SS');
    await fireEvent.press(screen.getByText('Edit date'));
    expect(await screen.findByLabelText('Exam date')).toHaveTextContent(
      '1 Mar 2027',
    );
    await fireEvent.press(screen.getByText('Clear date'));
    expect(screen.getByLabelText('Exam date')).toHaveTextContent('No date set');
    expect(screen.queryByText('Clear date')).toBeNull();
    await fireEvent.press(screen.getByText('Save'));
    await waitFor(() =>
      expect(http.patch).toHaveBeenCalledWith(`/v1/exams/${ID(11)}`, {
        examDate: null,
      }),
    );
  });

  it('an exam with no date opens on "No date set", not today', async () => {
    const http = makeHttp();
    await renderWithProviders(<ManageExamsSubjectsScreen />, http);
    await screen.findByText('MS General Surgery');
    await fireEvent.press(screen.getByText('Edit date'));
    expect(await screen.findByLabelText('Exam date')).toHaveTextContent(
      'No date set',
    );
  });
});

describe('busy states', () => {
  it('Save shows a spinner and cannot be sent twice', async () => {
    const http = makeHttp();
    let resolve: (v: unknown) => void = () => {};
    http.patch.mockReturnValue(new Promise(r => (resolve = r)));
    await renderWithProviders(<ManageExamsSubjectsScreen />, http);
    await screen.findByText('MS General Surgery');
    await fireEvent.press(screen.getAllByText('Rename')[0]);
    await fireEvent.changeText(await screen.findByLabelText('Exam name'), 'X');
    fireEvent.press(screen.getByText('Save'));
    expect(await screen.findByTestId('button-spinner')).toBeTruthy();
    expect(screen.queryByText('Save')).toBeNull();
    expect(isDisabled('Cancel')).toBe(true);
    // Back button on the dialog is ignored while saving.
    await fireEvent(screen.getByText('Cancel'), 'requestClose');
    expect(screen.getByText('Rename exam')).toBeTruthy();
    expect(http.patch).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolve({});
    });
    await waitFor(() => expect(screen.queryByText('Rename exam')).toBeNull());
  });

  it('Delete keeps the dialog open with a spinner until it finishes', async () => {
    const http = makeHttp();
    let resolve: (v: unknown) => void = () => {};
    http.del.mockReturnValue(new Promise(r => (resolve = r)));
    await renderWithProviders(<ManageExamsSubjectsScreen />, http);
    await screen.findByText('MS General Surgery');
    await fireEvent.press(screen.getAllByText('Delete')[0]);
    const all = screen.getAllByText('Delete');
    fireEvent.press(all[all.length - 1]);
    expect(await screen.findByTestId('button-spinner')).toBeTruthy();
    expect(screen.getByText('Delete MS General Surgery?')).toBeTruthy();
    expect(isDisabled('Cancel')).toBe(true);
    expect(http.del).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolve(undefined);
    });
    await waitFor(() =>
      expect(screen.queryByText('Delete MS General Surgery?')).toBeNull(),
    );
  });

  it('a delete that finds the item already gone shows no error', async () => {
    const http = makeHttp();
    http.del.mockRejectedValue(new ApiError('NOT_FOUND', 404));
    await renderWithProviders(<ManageExamsSubjectsScreen />, http);
    await screen.findByText('MS General Surgery');
    await fireEvent.press(screen.getAllByText('Delete')[0]);
    await pressLast('Delete');
    await waitFor(() =>
      expect(screen.queryByText('Delete MS General Surgery?')).toBeNull(),
    );
    expect(screen.queryByText('Not found.')).toBeNull();
  });
});
