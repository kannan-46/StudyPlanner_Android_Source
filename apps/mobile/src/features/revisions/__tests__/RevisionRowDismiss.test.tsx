import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { localToday } from '@planner/shared';
import { RevisionRow } from '../RevisionRow';
import { ApiError } from '../../../shared/api/errors';
import {
  cleanupClients,
  makeHttp,
  renderWithProviders,
} from '../../../test/testUtils';

const mockSnackbar = {
  show: jest.fn(() => 7),
  update: jest.fn(() => true),
  dismiss: jest.fn(),
};

jest.mock('../../../shared/ui/Snackbar', () => ({
  ...jest.requireActual('../../../shared/ui/Snackbar'),
  useSnackbar: () => mockSnackbar,
}));

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useFocusEffect: jest.fn(),
  useNavigation: () => ({ navigate: jest.fn() }),
}));

afterEach(() => {
  cleanupClients();
  jest.clearAllMocks();
});

const row = () => (
  <RevisionRow
    topicId="T1"
    topicName="Hernia"
    revision={{
      id: 'R2',
      step: 2,
      dueOn: localToday(),
      doneOn: null,
      dueOverride: null,
    }}
    isNextPending
    isLastDone={false}
    total={4}
  />
);

describe('RevisionRow with a snackbar that can be dismissed', () => {
  it.each([
    ['Done', 'Done'],
    ['Snooze', 'Snooze 1 day'],
  ])(
    'a %s save ended by sign-out dismisses its snackbar',
    async (_name, button) => {
      const http = makeHttp();
      http.post.mockRejectedValue(
        new ApiError('UNAUTHENTICATED', 401, undefined, {
          sessionEnded: true,
        }),
      );
      await renderWithProviders(row(), http);
      await fireEvent.press(screen.getByText(button));
      await waitFor(() => expect(mockSnackbar.dismiss).toHaveBeenCalledWith(7));
      expect(mockSnackbar.update).not.toHaveBeenCalledWith(
        7,
        expect.objectContaining({ durationMs: 1 }),
      );
    },
  );
});
