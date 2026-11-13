import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { localToday, type RevisionView } from '@planner/shared';
import { RevisionRow } from '../RevisionRow';
import { ApiError } from '../../../shared/api/errors';
import {
  cleanupClients,
  makeHttp,
  renderWithProviders,
} from '../../../test/testUtils';

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useFocusEffect: jest.fn(),
  useNavigation: () => ({ navigate: jest.fn() }),
}));

afterEach(cleanupClients);

const today = localToday();
const rev = (over: Partial<RevisionView> = {}): RevisionView => ({
  id: 'R2',
  step: 2,
  dueOn: today,
  doneOn: null,
  dueOverride: null,
  ...over,
});

describe('RevisionRow', () => {
  it('Done completes with today, shows snackbar and Undo calls undo', async () => {
    const http = makeHttp();
    http.post.mockResolvedValue({});
    await renderWithProviders(
      <RevisionRow
        topicId="T1"
        topicName="Hernia"
        revision={rev()}
        isNextPending
        isLastDone={false}
        total={4}
      />,
      http,
    );
    await fireEvent.press(screen.getByText('Done'));
    expect(await screen.findByText('Revision 2 done')).toBeOnTheScreen();
    expect(http.post).toHaveBeenCalledWith(
      '/v1/topics/T1/revisions/R2/complete',
      { doneOn: today },
    );
    await fireEvent.press(screen.getByText('Undo'));
    await waitFor(() =>
      expect(http.post).toHaveBeenCalledWith('/v1/topics/T1/revisions/R2/undo'),
    );
  });

  it('Snooze 1 day sends today,1 and shows the new date', async () => {
    const http = makeHttp();
    http.post.mockResolvedValue({});
    await renderWithProviders(
      <RevisionRow
        topicId="T1"
        revision={rev()}
        isNextPending
        isLastDone={false}
        total={4}
      />,
      http,
    );
    await fireEvent.press(screen.getByText('Snooze 1 day'));
    expect(await screen.findByText(/^Snoozed to /)).toBeOnTheScreen();
    expect(http.post).toHaveBeenCalledWith(
      '/v1/topics/T1/revisions/R2/snooze',
      { today, days: 1 },
    );
  });

  it('shows an error snackbar and Done again when complete rejects', async () => {
    const http = makeHttp();
    http.post.mockRejectedValue(new ApiError('NETWORK', 0));
    await renderWithProviders(
      <RevisionRow
        topicId="T1"
        revision={rev()}
        isNextPending
        isLastDone={false}
        total={4}
      />,
      http,
    );
    await fireEvent.press(screen.getByText('Done'));
    expect(
      await screen.findByText("Can't reach the server — try again"),
    ).toBeOnTheScreen();
    expect(screen.getByText('Done')).toBeOnTheScreen();
  });

  it('non-next pending row has no actions; last done row shows Undo', async () => {
    const http = makeHttp();
    await renderWithProviders(
      <>
        <RevisionRow
          topicId="T1"
          revision={rev({ id: 'R3', step: 3 })}
          isNextPending={false}
          isLastDone={false}
          total={4}
        />
        <RevisionRow
          topicId="T1"
          revision={rev({ id: 'R1', step: 1, doneOn: today })}
          isNextPending={false}
          isLastDone
          total={4}
        />
      </>,
      http,
    );
    expect(screen.queryByText('Done')).toBeNull();
    expect(screen.queryByText('Snooze 1 day')).toBeNull();
    expect(screen.getAllByText('Undo')).toHaveLength(1);
  });
});
