import React from 'react';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { addDays, localToday, type RevisionView } from '@planner/shared';
import { RevisionRow } from '../RevisionRow';
import { ApiError } from '../../../shared/api/errors';
import { formatDate } from '../../../shared/lib/format';
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

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const row = (over: Partial<RevisionView> = {}, today?: string) => (
  <RevisionRow
    topicId="T1"
    topicName="Hernia"
    revision={rev(over)}
    isNextPending
    isLastDone={false}
    total={4}
    today={today}
  />
);
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
    await fireEvent.press(await screen.findByText('Undo'));
    await waitFor(() =>
      expect(http.post).toHaveBeenCalledWith('/v1/topics/T1/revisions/R2/undo'),
    );
    expect(await screen.findByText('Revision 2 restored')).toBeOnTheScreen();
  });

  it('Done shows the snackbar with Undo at once, then the next date', async () => {
    const http = makeHttp();
    const gate = deferred<unknown>();
    http.post.mockReturnValueOnce(gate.promise);
    await renderWithProviders(row(), http);
    await fireEvent.press(screen.getByText('Done'));
    expect(screen.getByText('Revision 2 done')).toBeOnTheScreen();
    expect(screen.getByText('Undo')).toBeOnTheScreen();
    const next = addDays(today, 3);
    await act(async () =>
      gate.resolve({
        revisions: [rev({ doneOn: today })],
        nextDueOn: next,
        status: 'active',
      }),
    );
    expect(
      await screen.findByText(`Revision 2 done · next on ${formatDate(next)}`),
    ).toBeOnTheScreen();
    expect(screen.getByText('Undo')).toBeOnTheScreen();
  });

  it('says so when the last revision is done', async () => {
    const http = makeHttp();
    http.post.mockResolvedValue({
      revisions: [rev({ doneOn: today })],
      nextDueOn: null,
      status: 'completed',
    });
    await renderWithProviders(row(), http);
    await fireEvent.press(screen.getByText('Done'));
    expect(
      await screen.findByText('Revision 2 done · all revisions done'),
    ).toBeOnTheScreen();
  });

  it('an Undo tapped before the Done is saved waits for it', async () => {
    const http = makeHttp();
    const gate = deferred<unknown>();
    http.post.mockReturnValueOnce(gate.promise).mockResolvedValue({});
    await renderWithProviders(row(), http);
    await fireEvent.press(screen.getByText('Done'));
    await fireEvent.press(screen.getByText('Undo'));
    expect(http.post).toHaveBeenCalledTimes(1);
    expect(http.post.mock.calls[0]![0]).toMatch(/complete$/);
    await act(async () => gate.resolve({ revisions: [], nextDueOn: today }));
    await waitFor(() => expect(http.post).toHaveBeenCalledTimes(2));
    expect(http.post.mock.calls[1]![0]).toMatch(/undo$/);
    expect(await screen.findByText('Revision 2 restored')).toBeOnTheScreen();
    // The saved Done does not bring its snackbar back.
    expect(screen.queryByText(/^Revision 2 done/)).toBeNull();
  });

  it('an early Undo of a Done that fails sends nothing more', async () => {
    const http = makeHttp();
    const gate = deferred<unknown>();
    http.post.mockReturnValueOnce(gate.promise);
    await renderWithProviders(row(), http);
    await fireEvent.press(screen.getByText('Done'));
    await fireEvent.press(screen.getByText('Undo'));
    await act(async () => gate.reject(new ApiError('NETWORK', 0)));
    expect(await screen.findByText('Revision 2 restored')).toBeOnTheScreen();
    expect(http.post).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Retry')).toBeNull();
  });

  it('a failed Done replaces the snackbar with the error and Retry', async () => {
    const http = makeHttp();
    http.post
      .mockRejectedValueOnce(new ApiError('NETWORK', 0))
      .mockResolvedValueOnce({});
    await renderWithProviders(row(), http);
    await fireEvent.press(screen.getByText('Done'));
    expect(
      await screen.findByText("Can't reach the server — try again"),
    ).toBeOnTheScreen();
    expect(screen.queryByText('Revision 2 done')).toBeNull();
    await fireEvent.press(screen.getByText('Retry'));
    expect(await screen.findByText('Revision 2 done')).toBeOnTheScreen();
    expect(screen.getByText('Undo')).toBeOnTheScreen();
    await waitFor(() => expect(http.post).toHaveBeenCalledTimes(2));
  });

  it('the row Undo stays disabled while Done is still being saved', async () => {
    const http = makeHttp();
    const gate = deferred<unknown>();
    http.post.mockReturnValueOnce(gate.promise).mockResolvedValue({});
    let flip = () => {};
    // Topic detail flips the row to done straight away (optimistic update);
    // the same row instance then shows Undo.
    function Host() {
      const [isDone, setDone] = React.useState(false);
      flip = () => setDone(true);
      return (
        <RevisionRow
          topicId="T1"
          revision={rev({ doneOn: isDone ? today : null })}
          isNextPending={!isDone}
          isLastDone={isDone}
          total={4}
        />
      );
    }
    await renderWithProviders(<Host />, http);
    await fireEvent.press(screen.getByText('Done'));
    await act(async () => flip());
    const undoButtons = screen.getAllByRole('button', { name: 'Undo' });
    expect(undoButtons[0]).toBeDisabled();
    await act(async () => gate.resolve({}));
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: 'Undo' })[0]).toBeEnabled(),
    );
  });

  it('words the status plainly', async () => {
    const http = makeHttp();
    await renderWithProviders(
      <>
        {row({ id: 'A', dueOn: addDays(today, -3) }, today)}
        {row({ id: 'B', dueOn: today }, today)}
        {row({ id: 'C', step: 1, dueOn: addDays(today, 4) }, today)}
      </>,
      http,
    );
    expect(
      screen.getByText('Revision 2 of 4 · Overdue by 3 days'),
    ).toBeOnTheScreen();
    expect(screen.getByText('Revision 2 of 4 · Due today')).toBeOnTheScreen();
    expect(
      screen.getByText(/^Revision 1 of 4 · In 4 days, /),
    ).toBeOnTheScreen();
  });

  it('Snooze shows the new date the server saved', async () => {
    const http = makeHttp();
    const later = addDays(today, 5);
    http.post.mockResolvedValue({
      revisions: [{ ...rev({ dueOn: later, dueOverride: later }) }],
    });
    await renderWithProviders(row({ dueOn: addDays(today, 4) }), http);
    await fireEvent.press(screen.getByText('Snooze 1 day'));
    const [y, m, d] = later.split('-').map(Number);
    const months = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');
    const label = `${d} ${months[m - 1]}${
      y === Number(today.slice(0, 4)) ? '' : ` ${y}`
    }`;
    expect(await screen.findByText(`Snoozed to ${label}`)).toBeOnTheScreen();
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
