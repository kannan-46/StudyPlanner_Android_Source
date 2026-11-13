import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { ApiError } from '../../../shared/api/errors';
import { ManageExamsSubjectsScreen } from '../ManageExamsSubjectsScreen';
import {
  ID,
  cleanupClients,
  makeHttp,
  renderWithProviders,
} from '../../../test/testUtils';

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useFocusEffect: jest.fn(),
}));
afterEach(cleanupClients);

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
  await fireEvent.changeText(await screen.findByLabelText('Name'), 'FRCS');
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
