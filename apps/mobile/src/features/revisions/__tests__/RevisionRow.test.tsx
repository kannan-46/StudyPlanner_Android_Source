import React, { useState } from 'react';
import { StyleSheet } from 'react-native';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useQueryClient } from '@tanstack/react-query';
import {
  addDays,
  localToday,
  type AgendaItem,
  type RevisionView,
  type TopicView,
} from '@planner/shared';
import {
  plannedDates,
  renderRevisionRow,
  RevisionRow,
  shortTopicName,
} from '../RevisionRow';
import { AgendaRow } from '../../agenda/AgendaRow';
import { ApiError } from '../../../shared/api/errors';
import { queryKeys } from '../../../shared/api/queryClient';
import { formatDate } from '../../../shared/lib/format';
import {
  cleanupClients,
  makeHttp,
  renderWithProviders,
  topic as makeTopic,
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

const rev = (over: Partial<RevisionView> = {}): RevisionView => ({
  id: 'R2',
  step: 2,
  dueOn: today,
  doneOn: null,
  dueOverride: null,
  ...over,
});
const row = (over: Partial<RevisionView> = {}, day?: string) => (
  <RevisionRow
    topicId="T1"
    topicName="Hernia"
    revision={rev(over)}
    isNextPending
    isLastDone={false}
    total={4}
    today={day}
  />
);

/** Puts `t` in the topic cache before its children render. */
function WithCachedTopic({
  t,
  children,
}: {
  t: Partial<TopicView>;
  children: React.ReactNode;
}) {
  const qc = useQueryClient();
  useState(() => qc.setQueryData(queryKeys.topic('T1'), makeTopic(t)));
  return <>{children}</>;
}

const label = (d: string) => formatDate(d, today);

describe('RevisionRow', () => {
  it('Done completes with today, shows snackbar and Undo calls undo', async () => {
    const http = makeHttp();
    http.post.mockResolvedValue({});
    await renderWithProviders(row(), http);
    await fireEvent.press(screen.getByText('Done'));
    expect(
      await screen.findByText('Hernia · revision 2 done'),
    ).toBeOnTheScreen();
    expect(http.post).toHaveBeenCalledWith(
      '/v1/topics/T1/revisions/R2/complete',
      { doneOn: today },
    );
    await fireEvent.press(await screen.findByText('Undo'));
    await waitFor(() =>
      expect(http.post).toHaveBeenCalledWith('/v1/topics/T1/revisions/R2/undo'),
    );
    expect(
      await screen.findByText('Hernia · revision 2 restored'),
    ).toBeOnTheScreen();
  });

  it('Done shows the snackbar with Undo at once, then the next date', async () => {
    const http = makeHttp();
    const gate = deferred<unknown>();
    http.post.mockReturnValueOnce(gate.promise);
    await renderWithProviders(row(), http);
    await fireEvent.press(screen.getByText('Done'));
    expect(screen.getByText('Hernia · revision 2 done')).toBeOnTheScreen();
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
      await screen.findByText(
        `Hernia · revision 2 done · next on ${label(next)}`,
      ),
    ).toBeOnTheScreen();
    expect(screen.getByText('Undo')).toBeOnTheScreen();
  });

  it('words a next revision due tomorrow as "next tomorrow"', async () => {
    const http = makeHttp();
    http.post.mockResolvedValue({
      revisions: [rev({ doneOn: today })],
      nextDueOn: addDays(today, 1),
      status: 'active',
    });
    await renderWithProviders(row(), http);
    await fireEvent.press(screen.getByText('Done'));
    expect(
      await screen.findByText('Hernia · revision 2 done · next tomorrow'),
    ).toBeOnTheScreen();
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
      await screen.findByText('Hernia · revision 2 done · all revisions done'),
    ).toBeOnTheScreen();
  });

  it('names the topic from the cache when the row shows no name', async () => {
    const http = makeHttp();
    http.post.mockResolvedValue({});
    await renderWithProviders(
      <WithCachedTopic t={{ id: 'T1', name: 'Appendicitis' }}>
        <RevisionRow
          topicId="T1"
          revision={rev()}
          isNextPending
          isLastDone={false}
          total={4}
        />
      </WithCachedTopic>,
      http,
    );
    expect(screen.queryByText('Appendicitis')).toBeNull();
    await fireEvent.press(screen.getByText('Done'));
    expect(
      await screen.findByText('Appendicitis · revision 2 done'),
    ).toBeOnTheScreen();
  });

  it('shortens a long topic name in snackbars', () => {
    expect(shortTopicName('Short')).toBe('Short');
    expect(shortTopicName('  ')).toBeUndefined();
    const long = shortTopicName('A'.repeat(50)) as string;
    expect(long).toHaveLength(30);
    expect(long.endsWith('…')).toBe(true);
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
    expect(
      await screen.findByText('Hernia · revision 2 restored'),
    ).toBeOnTheScreen();
    // The saved Done does not bring its snackbar back.
    expect(screen.queryByText(/revision 2 done/)).toBeNull();
    // Undo of today's Done offers no Redo (Done is right there again).
    expect(screen.queryByText('Redo')).toBeNull();
  });

  it('an early Undo of a Done that fails sends nothing more', async () => {
    const http = makeHttp();
    const gate = deferred<unknown>();
    http.post.mockReturnValueOnce(gate.promise);
    await renderWithProviders(row(), http);
    await fireEvent.press(screen.getByText('Done'));
    await fireEvent.press(screen.getByText('Undo'));
    await act(async () => gate.reject(new ApiError('NETWORK', 0)));
    expect(
      await screen.findByText('Hernia · revision 2 restored'),
    ).toBeOnTheScreen();
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
    expect(screen.queryByText('Hernia · revision 2 done')).toBeNull();
    await fireEvent.press(screen.getByText('Retry'));
    expect(
      await screen.findByText('Hernia · revision 2 done'),
    ).toBeOnTheScreen();
    expect(screen.getByText('Undo')).toBeOnTheScreen();
    await waitFor(() => expect(http.post).toHaveBeenCalledTimes(2));
  });

  it('shows nothing when the save fails because the user signed out', async () => {
    const http = makeHttp();
    http.post.mockRejectedValue(
      new ApiError('UNAUTHENTICATED', 401, undefined, { sessionEnded: true }),
    );
    await renderWithProviders(row(), http);
    await fireEvent.press(screen.getByText('Done'));
    await waitFor(() => expect(http.post).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.queryByText('Hernia · revision 2 done')).toBeNull(),
    );
    expect(screen.queryByText(/session ended/i)).toBeNull();
    expect(screen.queryByText('Retry')).toBeNull();
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
    const undo = () => screen.getByRole('button', { name: 'Undo, revision 2' });
    expect(undo()).toBeDisabled();
    await act(async () => gate.resolve({}));
    await waitFor(() => expect(undo()).toBeEnabled());
  });

  it('words the status plainly', async () => {
    const http = makeHttp();
    await renderWithProviders(
      <>
        {row({ id: 'A', dueOn: addDays(today, -3) }, today)}
        {row({ id: 'B', dueOn: today }, today)}
        {row({ id: 'C', step: 1, dueOn: addDays(today, 4) }, today)}
        {row({ id: 'D', step: 1, doneOn: today }, today)}
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
    expect(screen.getByText('Revision 1 of 4 · Done today')).toBeOnTheScreen();
  });

  it('gives each button a spoken name with the topic and revision', async () => {
    const http = makeHttp();
    await renderWithProviders(
      <>
        {row()}
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
    expect(
      screen.getByRole('button', { name: 'Done, Hernia revision 2' }),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: 'Snooze 1 day, Hernia revision 2' }),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: 'Undo, revision 1' }),
    ).toBeOnTheScreen();
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

describe('RevisionRow snooze', () => {
  it('shows the expected date at once, then the date the server saved', async () => {
    const http = makeHttp();
    const gate = deferred<unknown>();
    http.post.mockReturnValueOnce(gate.promise);
    await renderWithProviders(row({ dueOn: addDays(today, 4) }), http);
    await fireEvent.press(screen.getByText('Snooze 1 day'));
    const expected = addDays(today, 5);
    expect(
      screen.getByText(`Hernia · revision 2 snoozed to ${label(expected)}`),
    ).toBeOnTheScreen();
    const saved = addDays(today, 6);
    await act(async () =>
      gate.resolve({
        revisions: [rev({ dueOn: saved, dueOverride: saved })],
      }),
    );
    expect(
      await screen.findByText(`Hernia · revision 2 snoozed to ${label(saved)}`),
    ).toBeOnTheScreen();
  });

  it('a row due today says "snoozed to tomorrow"', async () => {
    const http = makeHttp();
    http.post.mockResolvedValue({});
    await renderWithProviders(row(), http);
    await fireEvent.press(screen.getByText('Snooze 1 day'));
    expect(
      await screen.findByText('Hernia · revision 2 snoozed to tomorrow'),
    ).toBeOnTheScreen();
  });

  it('Snooze 1 day sends today,1; without a name it says "Snoozed to"', async () => {
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
    expect(await screen.findByText('Snoozed to tomorrow')).toBeOnTheScreen();
    expect(http.post).toHaveBeenCalledWith(
      '/v1/topics/T1/revisions/R2/snooze',
      { today, days: 1 },
    );
  });

  it('a failed snooze offers Retry, which snoozes again', async () => {
    const http = makeHttp();
    http.post
      .mockRejectedValueOnce(new ApiError('NETWORK', 0))
      .mockResolvedValueOnce({});
    await renderWithProviders(row(), http);
    await fireEvent.press(screen.getByText('Snooze 1 day'));
    expect(
      await screen.findByText("Can't reach the server — try again"),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Retry'));
    await waitFor(() => expect(http.post).toHaveBeenCalledTimes(2));
    expect(http.post.mock.calls[1]![0]).toMatch(/snooze$/);
  });

  it('Undo puts the snoozed revision back on the date it showed', async () => {
    const http = makeHttp();
    const overdue = addDays(today, -3);
    http.post.mockResolvedValue({});
    await renderWithProviders(row({ dueOn: overdue }), http);
    await fireEvent.press(screen.getByText('Snooze 1 day'));
    expect(
      await screen.findByText('Hernia · revision 2 snoozed to tomorrow'),
    ).toBeOnTheScreen();
    await waitFor(() => expect(http.post).toHaveBeenCalledTimes(1));
    await fireEvent.press(screen.getByText('Undo'));
    expect(
      await screen.findByText('Hernia · revision 2 snooze undone'),
    ).toBeOnTheScreen();
    expect(http.post).toHaveBeenLastCalledWith(
      '/v1/topics/T1/revisions/R2/unsnooze',
      { dueOn: overdue },
    );
  });

  it('an Undo tapped before the snooze is saved waits for it', async () => {
    const http = makeHttp();
    const gate = deferred<unknown>();
    http.post.mockReturnValueOnce(gate.promise).mockResolvedValue({});
    await renderWithProviders(row(), http);
    await fireEvent.press(screen.getByText('Snooze 1 day'));
    await fireEvent.press(screen.getByText('Undo'));
    expect(http.post).toHaveBeenCalledTimes(1);
    expect(http.post.mock.calls[0]![0]).toMatch(/snooze$/);
    await act(async () =>
      gate.resolve({
        revisions: [
          rev({ dueOn: addDays(today, 1), dueOverride: addDays(today, 1) }),
        ],
      }),
    );
    await waitFor(() => expect(http.post).toHaveBeenCalledTimes(2));
    expect(http.post.mock.calls[1]).toEqual([
      '/v1/topics/T1/revisions/R2/unsnooze',
      { dueOn: today },
    ]);
    expect(
      await screen.findByText('Hernia · revision 2 snooze undone'),
    ).toBeOnTheScreen();
    // The saved snooze does not bring its snackbar back.
    expect(screen.queryByText(/snoozed to/)).toBeNull();
  });

  it('an early Undo of a snooze that fails sends nothing more', async () => {
    const http = makeHttp();
    const gate = deferred<unknown>();
    http.post.mockReturnValueOnce(gate.promise);
    await renderWithProviders(row(), http);
    await fireEvent.press(screen.getByText('Snooze 1 day'));
    await fireEvent.press(screen.getByText('Undo'));
    await act(async () => gate.reject(new ApiError('NETWORK', 0)));
    expect(
      await screen.findByText('Hernia · revision 2 snooze undone'),
    ).toBeOnTheScreen();
    expect(http.post).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Retry')).toBeNull();
  });

  it('a failed Undo of a snooze offers Retry, which tries again', async () => {
    const http = makeHttp();
    http.post
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new ApiError('NETWORK', 0))
      .mockResolvedValueOnce({});
    await renderWithProviders(row(), http);
    await fireEvent.press(screen.getByText('Snooze 1 day'));
    await waitFor(() => expect(http.post).toHaveBeenCalledTimes(1));
    await fireEvent.press(await screen.findByText('Undo'));
    expect(
      await screen.findByText("Can't reach the server — try again"),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Retry'));
    await waitFor(() => expect(http.post).toHaveBeenCalledTimes(3));
    expect(http.post.mock.calls[2]).toEqual([
      '/v1/topics/T1/revisions/R2/unsnooze',
      { dueOn: today },
    ]);
    expect(
      await screen.findByText('Hernia · revision 2 snooze undone'),
    ).toBeOnTheScreen();
  });
});

describe('RevisionRow slow saves', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('keeps the Done snackbar up while a 6 s save runs, then updates it', async () => {
    const http = makeHttp();
    const next = addDays(today, 3);
    http.post.mockImplementationOnce(
      () =>
        new Promise(resolve =>
          setTimeout(
            () =>
              resolve({
                revisions: [rev({ doneOn: today })],
                nextDueOn: next,
                status: 'active',
              }),
            6000,
          ),
        ),
    );
    await renderWithProviders(row(), http);
    await fireEvent.press(screen.getByText('Done'));
    for (let ms = 0; ms < 5900; ms += 1000) {
      expect(screen.getByText('Hernia · revision 2 done')).toBeOnTheScreen();
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });
    }
    await act(async () => {
      jest.advanceTimersByTime(200);
    });
    expect(
      screen.getByText(`Hernia · revision 2 done · next on ${label(next)}`),
    ).toBeOnTheScreen();
    expect(screen.getByText('Undo')).toBeOnTheScreen();
    // The normal 5 s start once the save is answered.
    await act(async () => {
      jest.advanceTimersByTime(5100);
    });
    expect(screen.queryByTestId('snackbar')).toBeNull();
  });
});

describe('Undo of a revision done on an earlier day', () => {
  const doneEarlier = addDays(today, -10);
  const lastDone = (
    <RevisionRow
      topicId="T1"
      topicName="Hernia"
      revision={rev({ id: 'R1', step: 1, doneOn: doneEarlier })}
      isNextPending={false}
      isLastDone
      total={4}
      today={today}
    />
  );

  it('asks first and sends nothing on Cancel', async () => {
    const http = makeHttp();
    await renderWithProviders(lastDone, http);
    expect(
      screen.getByText(`Revision 1 of 4 · Done ${label(doneEarlier)}`),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Undo'));
    expect(screen.getByText('Mark revision 1 as not done?')).toBeOnTheScreen();
    expect(
      screen.getByText(new RegExp(`done on ${label(doneEarlier)}`)),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Cancel'));
    expect(screen.queryByText('Mark revision 1 as not done?')).toBeNull();
    expect(http.post).not.toHaveBeenCalled();
  });

  it('on confirm undoes, then Redo puts the original date back', async () => {
    const http = makeHttp();
    http.post.mockResolvedValue({});
    await renderWithProviders(lastDone, http);
    await fireEvent.press(screen.getByText('Undo'));
    await fireEvent.press(screen.getByText('Mark not done'));
    await waitFor(() =>
      expect(http.post).toHaveBeenCalledWith('/v1/topics/T1/revisions/R1/undo'),
    );
    expect(
      await screen.findByText('Hernia · revision 1 restored'),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Redo'));
    await waitFor(() =>
      expect(http.post).toHaveBeenCalledWith(
        '/v1/topics/T1/revisions/R1/complete',
        { doneOn: doneEarlier },
      ),
    );
    expect(
      await screen.findByText(
        `Hernia · revision 1 done again (${label(doneEarlier)})`,
      ),
    ).toBeOnTheScreen();
  });

  it('a Done from today is undone at once', async () => {
    const http = makeHttp();
    http.post.mockResolvedValue({});
    await renderWithProviders(
      <RevisionRow
        topicId="T1"
        revision={rev({ id: 'R1', step: 1, doneOn: today })}
        isNextPending={false}
        isLastDone
        total={4}
        today={today}
      />,
      http,
    );
    await fireEvent.press(screen.getByText('Undo'));
    expect(screen.queryByText(/as not done\?/)).toBeNull();
    await waitFor(() =>
      expect(http.post).toHaveBeenCalledWith('/v1/topics/T1/revisions/R1/undo'),
    );
  });
});

describe('row look', () => {
  const item: AgendaItem = {
    topicId: 'T1',
    topicName: 'Thyroid',
    subjectId: 's2',
    subjectName: 'Surgery',
    revisionId: 'R2',
    step: 2,
    totalSteps: 6,
    dueOn: addDays(today, 1),
    bucket: 'upcoming',
  };

  it('the name and status open the topic, with a chevron', async () => {
    const http = makeHttp();
    const open = jest.fn();
    await renderWithProviders(
      <AgendaRow item={item} onOpenTopic={open} today={today} />,
      http,
    );
    expect(screen.getByTestId('revision-row-chevron')).toBeOnTheScreen();
    const link = screen.getByRole('link', {
      name: 'Thyroid, Surgery, Revision 2 of 6 · Due tomorrow',
    });
    expect(link).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Revision 2 of 6 · Due tomorrow'));
    expect(open).toHaveBeenCalledWith('T1');
  });

  it('shows the subject, so topics with the same name differ', async () => {
    const http = makeHttp();
    await renderWithProviders(
      <>
        <AgendaRow item={item} onOpenTopic={jest.fn()} today={today} />
        <AgendaRow
          item={{ ...item, topicId: 'T2', subjectName: 'Anatomy' }}
          onOpenTopic={jest.fn()}
          today={today}
        />
        <AgendaRow
          item={{ ...item, topicId: 'T3', subjectName: '' }}
          onOpenTopic={jest.fn()}
          today={today}
        />
      </>,
      http,
    );
    expect(screen.getAllByText('Thyroid')).toHaveLength(3);
    expect(screen.getByText('Surgery')).toBeOnTheScreen();
    expect(screen.getByText('Anatomy')).toBeOnTheScreen();
  });

  it('has no chevron or link without onOpenTopic', async () => {
    const http = makeHttp();
    await renderWithProviders(row(), http);
    expect(screen.queryByTestId('revision-row-chevron')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('draws a divider only when asked', async () => {
    const http = makeHttp();
    await renderWithProviders(
      <>
        <AgendaRow item={item} onOpenTopic={jest.fn()} today={today} />
        <AgendaRow
          item={{ ...item, topicId: 'T2' }}
          onOpenTopic={jest.fn()}
          today={today}
          divider
        />
      </>,
      http,
    );
    const rows = screen.getAllByTestId('revision-row');
    const border = (i: number) =>
      StyleSheet.flatten(rows[i]!.props.style).borderTopWidth;
    expect(border(0)).toBeUndefined();
    expect(border(1)).toBe(1);
  });
});

describe('Topic detail rows', () => {
  // Studied 1 Nov-style chain: R1 overdue by 11 days, the later stored dates
  // are projections that are already in the past.
  const chain: RevisionView[] = [
    rev({ id: 'R1', step: 1, dueOn: addDays(today, -11) }),
    rev({ id: 'R2', step: 2, dueOn: addDays(today, -8) }),
    rev({ id: 'R3', step: 3, dueOn: today }),
    rev({ id: 'R4', step: 4, dueOn: addDays(today, 15) }),
  ];

  it('plans later revisions from the day the next one can be done', () => {
    const planned = plannedDates(chain, today);
    expect(planned.has('R1')).toBe(false);
    expect(planned.get('R2')).toBe(addDays(today, 3));
    expect(planned.get('R3')).toBe(addDays(today, 11));
    expect(planned.get('R4')).toBe(addDays(today, 26));
  });

  it('keeps stored dates when the next revision is on time', () => {
    const onTime: RevisionView[] = [
      rev({ id: 'R1', step: 1, dueOn: '2026-01-05', doneOn: '2026-01-05' }),
      rev({ id: 'R2', step: 2, dueOn: addDays(today, 2) }),
      rev({ id: 'R3', step: 3, dueOn: addDays(today, 10) }),
    ];
    expect(plannedDates(onTime, today).get('R3')).toBe(addDays(today, 10));
  });

  it('keeps a snoozed later date and counts on from it', () => {
    const snoozed: RevisionView[] = [
      rev({ id: 'R1', step: 1, dueOn: addDays(today, -2) }),
      rev({
        id: 'R2',
        step: 2,
        dueOn: addDays(today, 20),
        dueOverride: addDays(today, 20),
      }),
      rev({ id: 'R3', step: 3, dueOn: addDays(today, 25) }),
    ];
    const planned = plannedDates(snoozed, today);
    expect(planned.get('R2')).toBe(addDays(today, 20));
    expect(planned.get('R3')).toBe(addDays(today, 25));
  });

  it('only the next pending revision has a due status', async () => {
    const http = makeHttp();
    const render = renderRevisionRow('T1', undefined, today);
    await renderWithProviders(
      <>
        {chain.map(r => (
          <React.Fragment key={r.id}>{render(r, chain)}</React.Fragment>
        ))}
      </>,
      http,
    );
    expect(
      screen.getByText('Revision 1 of 4 · Overdue by 11 days'),
    ).toBeOnTheScreen();
    expect(screen.getAllByText(/Overdue/)).toHaveLength(1);
    expect(screen.queryByText(/Due today/)).toBeNull();
    expect(
      screen.getByText(
        `Revision 2 of 4 · Planned around ${label(addDays(today, 3))}`,
      ),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(
        `Revision 4 of 4 · Planned around ${label(addDays(today, 26))}`,
      ),
    ).toBeOnTheScreen();
    expect(screen.getAllByText('Done')).toHaveLength(1);
    // Rows after the first are separated by a line.
    const rows = screen.getAllByTestId('revision-row');
    const border = (i: number) =>
      StyleSheet.flatten(rows[i]!.props.style).borderTopWidth;
    expect(border(0)).toBeUndefined();
    expect(border(1)).toBe(1);
    expect(border(3)).toBe(1);
  });
});
