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
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useFocusEffect: jest.fn(),
}));
afterEach(cleanupClients);

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

it('confirms exam deletion with the explanatory text', async () => {
  const http = makeHttp();
  http.del.mockResolvedValue(undefined);
  await renderWithProviders(<ManageExamsSubjectsScreen />, http);
  await screen.findByText('MS General Surgery');
  await fireEvent.press(screen.getAllByText('Delete')[0]);
  expect(
    await screen.findByText(
      'Topics keep existing; the exam is removed from them',
    ),
  ).toBeTruthy();
  await pressLast('Delete');
  await waitFor(() =>
    expect(http.del).toHaveBeenCalledWith(`/v1/exams/${ID(11)}`),
  );
  await waitFor(() => expect(screen.queryByText('Delete exam?')).toBeNull());
});

it('SUBJECT_IN_USE shows the move-or-delete message', async () => {
  const http = makeHttp();
  http.del.mockRejectedValue(new ApiError('SUBJECT_IN_USE', 409));
  await renderWithProviders(<ManageExamsSubjectsScreen />, http);
  await screen.findByText('Anatomy');
  // exam Delete is first, subject Deletes follow.
  await fireEvent.press(screen.getAllByText('Delete')[1]);
  await screen.findByText('Delete subject?');
  await pressLast('Delete');
  expect(
    await screen.findByText('Move or delete its topics first'),
  ).toBeTruthy();
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
      await screen.findByText('You already have one with that name.'),
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
    expect(screen.getByText('Delete exam?')).toBeTruthy();
    expect(isDisabled('Cancel')).toBe(true);
    expect(http.del).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolve(undefined);
    });
    await waitFor(() => expect(screen.queryByText('Delete exam?')).toBeNull());
  });

  it('a delete that finds the item already gone shows no error', async () => {
    const http = makeHttp();
    http.del.mockRejectedValue(new ApiError('NOT_FOUND', 404));
    await renderWithProviders(<ManageExamsSubjectsScreen />, http);
    await screen.findByText('MS General Surgery');
    await fireEvent.press(screen.getAllByText('Delete')[0]);
    await pressLast('Delete');
    await waitFor(() => expect(screen.queryByText('Delete exam?')).toBeNull());
    expect(screen.queryByText('Not found.')).toBeNull();
  });
});
