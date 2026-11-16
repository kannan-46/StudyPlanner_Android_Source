import React, { useState } from 'react';
import {
  NativeModules,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import {
  addDays,
  localToday,
  type AgendaItem,
  type TopicView,
} from '@planner/shared';
import { HomeScreen, NOTIFICATIONS_BLOCKED_TEXT } from '../HomeScreen';
import { ApiError } from '../../../shared/api/errors';
import { formatDate } from '../../../shared/lib/format';
import {
  ID,
  cleanupClients,
  topic,
  makeHttp,
  renderWithProviders,
} from '../../../test/testUtils';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useFocusEffect: jest.fn(),
  useNavigation: () => ({ navigate: mockNavigate }),
}));
type MeasureLayout = {
  measureLayout: (
    relativeTo: unknown,
    onSuccess: (x: number, y: number) => void,
    onFail: () => void,
  ) => void;
};
const mockScrollRefs: { current: unknown }[] = [];
jest.mock('../../../shared/ui/ScrollToTopOnTabPress', () => ({
  ScrollToTopOnTabPress: ({
    scrollRef,
  }: {
    scrollRef: { current: unknown };
  }) => {
    mockScrollRefs.push(scrollRef);
    return null;
  },
}));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(),
}));
const mockDims = (width: number, height = 800) =>
  (useWindowDimensions as jest.Mock).mockReturnValue({
    width,
    height,
    scale: 2,
    fontScale: 1,
  });

const today = localToday();
const mk = (
  n: number,
  bucket: AgendaItem['bucket'],
  dueOn: string,
): AgendaItem => ({
  topicId: ID(200 + n),
  topicName: `Topic ${n}`,
  subjectId: ID(1),
  subjectName: 'Anatomy',
  revisionId: `R${n}`,
  step: 1,
  totalSteps: 2,
  dueOn,
  bucket,
});

function setup(
  agenda: AgendaItem[] | ((q: { today: string }) => AgendaItem[]),
  topics: TopicView[] | (() => TopicView[] | Promise<TopicView[]>) = [topic()],
  settings: { dailyReminder?: boolean } = { dailyReminder: true },
) {
  const http = makeHttp();
  http.get.mockImplementation(async (path: string, q?: { today: string }) => {
    if (path === '/v1/agenda') {
      return { items: typeof agenda === 'function' ? agenda(q!) : agenda };
    }
    if (path === '/v1/topics') {
      return typeof topics === 'function' ? topics() : topics;
    }
    if (path === '/v1/me') return { name: 'Asha Rao', settings };
    if (path === '/v1/exams') {
      return [
        { id: ID(11), name: 'Past', examDate: addDays(today, -5) },
        { id: ID(12), name: 'NEET SS', examDate: addDays(today, 42) },
        { id: ID(13), name: 'Far', examDate: addDays(today, 90) },
      ];
    }
    return [];
  });
  return http;
}

beforeEach(() => {
  mockNavigate.mockReset();
  mockDims(360);
  NativeModules.Reminders = undefined;
});
afterEach(cleanupClients);

describe('HomeScreen', () => {
  it('greets, counts down, lists all due items and 5 upcoming', async () => {
    const agenda = [
      ...[1, 2, 3, 4, 5, 6, 7].map(n => mk(n, 'today', today)),
      mk(8, 'overdue', addDays(today, -2)),
      ...[10, 11, 12, 13, 14, 15, 16].map(n =>
        mk(n, 'upcoming', addDays(today, 3)),
      ),
    ];
    await renderWithProviders(<HomeScreen />, setup(agenda));
    expect(await screen.findByText(/Asha/)).toBeOnTheScreen();
    expect(screen.queryByText(/Rao/)).toBeNull();
    expect(await screen.findByText('NEET SS in 42 days')).toBeOnTheScreen();
    expect(await screen.findByText('Topic 7')).toBeOnTheScreen();
    expect(screen.getByText('Topic 8')).toBeOnTheScreen();
    // Overdue and today only: nothing coming up can be marked done here.
    expect(screen.getAllByText('Done')).toHaveLength(8);
    expect(screen.getAllByText('Snooze 1 day')).toHaveLength(8);
    expect(screen.getByText('Topic 14')).toBeOnTheScreen();
    expect(screen.queryByText('Topic 15')).toBeNull();
  });

  it('separates the rows in a list with a thin line', async () => {
    const agenda = [mk(1, 'today', today), mk(2, 'today', today)];
    await renderWithProviders(<HomeScreen />, setup(agenda));
    await screen.findByText('Topic 2');
    const rows = screen.getAllByTestId('revision-row');
    const border = (i: number) =>
      StyleSheet.flatten(rows[i]!.props.style).borderTopWidth;
    expect(border(0)).toBeUndefined();
    expect(border(1)).toBe(1);
  });

  it('shows the reminder banner when notifications are off', async () => {
    NativeModules.Reminders = {
      getStatus: jest.fn().mockResolvedValue({ notificationsEnabled: false }),
    };
    await renderWithProviders(<HomeScreen />, setup([]));
    expect(
      await screen.findByText(NOTIFICATIONS_BLOCKED_TEXT),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Fix'));
    expect(mockNavigate).toHaveBeenCalledWith('ReminderHealth');
  });

  it('no reminder banner when only battery optimisation is on', async () => {
    NativeModules.Reminders = {
      getStatus: jest.fn().mockResolvedValue({
        notificationsEnabled: true,
        exactAlarmsAllowed: true,
        ignoringBatteryOptimizations: false,
      }),
    };
    await renderWithProviders(<HomeScreen />, setup([]));
    await waitFor(() =>
      expect(NativeModules.Reminders.getStatus).toHaveBeenCalled(),
    );
    expect(screen.queryByText(NOTIFICATIONS_BLOCKED_TEXT)).toBeNull();
  });

  it('no reminder banner when the daily reminder is switched off', async () => {
    NativeModules.Reminders = {
      getStatus: jest.fn().mockResolvedValue({ notificationsEnabled: false }),
    };
    await renderWithProviders(
      <HomeScreen />,
      setup([], [topic()], { dailyReminder: false }),
    );
    expect(await screen.findByText('+ Add topic')).toBeOnTheScreen();
    await waitFor(() =>
      expect(NativeModules.Reminders.getStatus).toHaveBeenCalled(),
    );
    expect(screen.queryByText(NOTIFICATIONS_BLOCKED_TEXT)).toBeNull();
  });

  it('Add topic navigates to the form', async () => {
    await renderWithProviders(<HomeScreen />, setup([]));
    await fireEvent.press(await screen.findByText('+ Add topic'));
    expect(mockNavigate).toHaveBeenCalledWith('TopicForm');
  });

  it('renders at 320 dp', async () => {
    mockDims(320, 640);
    await renderWithProviders(<HomeScreen />, setup([mk(1, 'today', today)]));
    expect(await screen.findByText('Topic 1')).toBeOnTheScreen();
  });

  it('uses two columns at expanded width', async () => {
    mockDims(1000, 700);
    await renderWithProviders(
      <HomeScreen />,
      setup([mk(2, 'upcoming', addDays(today, 2))]),
    );
    expect(await screen.findByText('Topic 2')).toBeOnTheScreen();
    expect(screen.getByTestId('home-columns')).toBeOnTheScreen();
  });

  it('keeps a running focus timer when the phone is rotated', async () => {
    // Re-renders HomeScreen on demand, as a window size change does.
    function Harness() {
      const [, setN] = useState(0);
      return (
        <>
          <Pressable onPress={() => setN(n => n + 1)}>
            <Text>re-render</Text>
          </Pressable>
          <HomeScreen />
        </>
      );
    }
    await AsyncStorage.clear();
    const getItem = AsyncStorage.getItem as jest.Mock;
    getItem.mockClear();
    const timerReads = () =>
      getItem.mock.calls.filter(c => c[0] === 'prefs.focusTimer').length;

    mockDims(360, 800);
    await renderWithProviders(<Harness />, setup([]));
    await fireEvent.press(await screen.findByText('Start'));
    expect(screen.getByText('Pause')).toBeOnTheScreen();
    expect(screen.queryByTestId('home-columns')).toBeNull();

    mockDims(800, 360);
    await fireEvent.press(screen.getByText('re-render'));
    expect(screen.getByTestId('home-columns')).toBeOnTheScreen();
    expect(screen.getByText('Pause')).toBeOnTheScreen();
    // Same component instance: it never had to reload its saved session.
    expect(timerReads()).toBe(1);
  });

  it('lists overdue revisions apart from today, with plain wording', async () => {
    await renderWithProviders(
      <HomeScreen />,
      setup([mk(1, 'overdue', addDays(today, -3)), mk(2, 'today', today)]),
    );
    expect(await screen.findByText('Overdue')).toBeOnTheScreen();
    expect(
      screen.getByText('Revision 1 of 2 · Overdue by 3 days'),
    ).toBeOnTheScreen();
    expect(screen.getByText('Revision 1 of 2 · Due today')).toBeOnTheScreen();
  });

  it('explains an empty day and names the next revision', async () => {
    const soon = addDays(today, 4);
    await renderWithProviders(
      <HomeScreen />,
      setup([{ ...mk(3, 'upcoming', soon), topicName: 'Thyroid' }]),
    );
    expect(
      await screen.findByText(
        /^Nothing to revise today. Thyroid's first revision is on /,
      ),
    ).toBeOnTheScreen();
    expect(screen.getByText(/^Revision 1 of 2 · In 4 days/)).toBeOnTheScreen();
  });

  it('names a next revision beyond the agenda window from the topics', async () => {
    const later = addDays(today, 45);
    const far = topic({
      name: 'Breast',
      nextDueOn: later,
      revisions: [
        { id: 'R1', step: 1, dueOn: today, doneOn: today, dueOverride: null },
        { id: 'R2', step: 2, dueOn: later, doneOn: null, dueOverride: null },
      ],
    });
    await renderWithProviders(<HomeScreen />, setup([], [far]));
    expect(
      await screen.findByText(/Next up: Breast, revision 2, on /),
    ).toBeOnTheScreen();
  });

  it('a brand-new user gets an Add your first topic button', async () => {
    await renderWithProviders(<HomeScreen />, setup([], []));
    expect(await screen.findByText('No topics yet')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Add your first topic'));
    expect(mockNavigate).toHaveBeenCalledWith('TopicForm');
  });

  it('says All done once the last due revision is done', async () => {
    let done = false;
    // Like the server: once saved, the topic lists today's revision as done.
    const saved = topic({
      revisions: [
        { id: 'R1', step: 1, dueOn: today, doneOn: today, dueOverride: null },
      ],
    });
    const http = setup(
      () => (done ? [] : [mk(1, 'today', today)]),
      () => (done ? [saved] : [topic()]),
    );
    http.post.mockImplementation(async () => {
      done = true;
      return {};
    });
    await renderWithProviders(<HomeScreen />, http);
    expect(await screen.findByText('Topic 1')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Done'));
    expect(
      await screen.findByText(/^All done for today. Well done!/),
    ).toBeOnTheScreen();
    expect(screen.getByText(/evision 1 done$/)).toBeOnTheScreen();
  });

  it('moves to the new day after midnight without a restart', async () => {
    jest.useFakeTimers({ now: new Date(2026, 10, 14, 23, 59, 0) });
    try {
      const http = setup(q =>
        q.today === '2026-11-15'
          ? [{ ...mk(5, 'today', '2026-11-15'), topicName: 'Thyroid' }]
          : [{ ...mk(5, 'upcoming', '2026-11-15'), topicName: 'Thyroid' }],
      );
      await renderWithProviders(<HomeScreen />, http);
      expect(
        await screen.findByText(/Thyroid's first revision is on 15 Nov/),
      ).toBeOnTheScreen();
      await act(async () => {
        jest.advanceTimersByTime(90_000);
      });
      expect(
        await screen.findByText('Revision 1 of 2 · Due today'),
      ).toBeOnTheScreen();
      expect(http.get).toHaveBeenCalledWith('/v1/agenda', {
        today: '2026-11-15',
        days: 30,
      });
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('HomeScreen Done and Undo', () => {
  function deferred<T>() {
    let resolve!: (v: T) => void;
    const promise = new Promise<T>(r => {
      resolve = r;
    });
    return { promise, resolve };
  }

  it('Coming up rows show the topic and date but no Done or Snooze', async () => {
    await renderWithProviders(
      <HomeScreen />,
      setup([{ ...mk(4, 'upcoming', addDays(today, 1)), topicName: 'Test' }]),
    );
    expect(await screen.findByText('Test')).toBeOnTheScreen();
    expect(
      screen.getByText('Revision 1 of 2 · Due tomorrow'),
    ).toBeOnTheScreen();
    expect(screen.queryByText('Done')).toBeNull();
    expect(screen.queryByText('Snooze 1 day')).toBeNull();
    await fireEvent.press(screen.getByText('Test'));
    expect(mockNavigate).toHaveBeenCalledWith('TopicDetail', {
      topicId: ID(204),
    });
  });

  it('Done: row stays gone, Undo at once, next date once saved', async () => {
    const next = addDays(today, 3);
    const gate = deferred<unknown>();
    let saved = false;
    const row = mk(1, 'today', today);
    const http = setup(() =>
      saved
        ? [
            {
              ...row,
              revisionId: 'R1b',
              step: 2,
              dueOn: next,
              bucket: 'upcoming',
            },
          ]
        : [row],
    );
    http.post.mockImplementationOnce(() => gate.promise);
    await renderWithProviders(<HomeScreen />, http);
    expect(await screen.findByText('Topic 1')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Done'));
    expect(screen.queryByText('Topic 1')).toBeNull();
    expect(screen.getByText(/evision 1 done$/)).toBeOnTheScreen();
    expect(screen.getByText('Undo')).toBeOnTheScreen();

    await act(async () => {
      saved = true;
      gate.resolve({
        ...topic({ id: row.topicId, name: 'Topic 1' }),
        revisions: [
          { id: 'R1', step: 1, dueOn: today, doneOn: today, dueOverride: null },
          { id: 'R1b', step: 2, dueOn: next, doneOn: null, dueOverride: null },
        ],
        nextDueOn: next,
      });
    });
    expect(
      await screen.findByText(
        new RegExp(`evision 1 done · next on ${formatDate(next)}$`),
      ),
    ).toBeOnTheScreen();
    expect(screen.getByText('Undo')).toBeOnTheScreen();
    // Back under Coming up with its next revision, not under Today.
    expect(
      await screen.findByText(/^Revision 2 of 2 · In 3 days, /),
    ).toBeOnTheScreen();
    expect(screen.queryByText('Done')).toBeNull();
  });

  it('an Undo tapped before the Done is saved brings the row back', async () => {
    const gate = deferred<unknown>();
    const http = setup([mk(1, 'today', today)]);
    http.post.mockImplementationOnce(() => gate.promise).mockResolvedValue({});
    await renderWithProviders(<HomeScreen />, http);
    expect(await screen.findByText('Topic 1')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Done'));
    expect(screen.queryByText('Topic 1')).toBeNull();
    await fireEvent.press(screen.getByText('Undo'));
    expect(await screen.findByText('Topic 1')).toBeOnTheScreen();
    expect(screen.getByText('Revision 1 of 2 · Due today')).toBeOnTheScreen();
    expect(http.post).toHaveBeenCalledTimes(1);
    await act(async () => gate.resolve({}));
    expect(await screen.findByText(/evision 1 restored$/)).toBeOnTheScreen();
    expect(http.post.mock.calls[1]![0]).toMatch(/undo$/);
    expect(screen.getByText('Topic 1')).toBeOnTheScreen();
  });
});

describe('HomeScreen states (UX round 2)', () => {
  function deferred<T>() {
    let resolve!: (v: T) => void;
    const promise = new Promise<T>(r => {
      resolve = r;
    });
    return { promise, resolve };
  }
  const offline = "Can't reach the server — try again";
  const refreshHome = async () => {
    const scroll = screen.getByTestId('home-scroll');
    await act(async () => {
      await scroll.props.refreshControl.props.onRefresh();
    });
  };

  it('uses the shared title and section heading styles', async () => {
    await renderWithProviders(<HomeScreen />, setup([mk(1, 'today', today)]));
    expect(
      await screen.findByRole('header', { name: 'Hello, Asha' }),
    ).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Today' })).toBeOnTheScreen();
  });

  it('a tab re-press scrolls the Home list back to the top', async () => {
    mockScrollRefs.length = 0;
    await renderWithProviders(<HomeScreen />, setup([mk(1, 'today', today)]));
    await screen.findByText('Topic 1');
    const ref = mockScrollRefs.at(-1) as { current: { scrollTo?: unknown } };
    expect(ref.current).toBeTruthy();
    expect(typeof ref.current.scrollTo).toBe('function');
  });

  it('on a phone, a Focus timer shortcut scrolls down to the timer', async () => {
    mockScrollRefs.length = 0;
    await renderWithProviders(<HomeScreen />, setup([mk(1, 'today', today)]));
    expect(await screen.findByText('Topic 1')).toBeOnTheScreen();
    expect(screen.getByTestId('home-focus-timer')).toBeOnTheScreen();
    const sv = (mockScrollRefs.at(-1) as { current: object }).current as {
      getInnerViewRef: () => unknown;
      scrollTo: (o: { y: number }) => void;
    };
    const inner = { inner: true };
    const innerSpy = jest.spyOn(sv, 'getInnerViewRef').mockReturnValue(inner);
    const scrollSpy = jest.spyOn(sv, 'scrollTo').mockImplementation(() => {});
    // The timer card measures itself against the scroll content.
    const measureSpy = jest
      .spyOn(View.prototype as unknown as MeasureLayout, 'measureLayout')
      .mockImplementation((_rel, ok) => ok(0, 600));
    try {
      await fireEvent.press(screen.getByText('Go to focus timer'));
      expect(measureSpy).toHaveBeenCalledWith(
        inner,
        expect.any(Function),
        expect.any(Function),
      );
      expect(scrollSpy).toHaveBeenCalledTimes(1);
      const { y } = scrollSpy.mock.calls[0][0];
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(600);
    } finally {
      innerSpy.mockRestore();
      scrollSpy.mockRestore();
      measureSpy.mockRestore();
    }
  });

  it('no Focus timer shortcut on a tablet', async () => {
    mockDims(1000, 700);
    await renderWithProviders(<HomeScreen />, setup([mk(1, 'today', today)]));
    expect(await screen.findByText('Topic 1')).toBeOnTheScreen();
    expect(screen.queryByText('Go to focus timer')).toBeNull();
  });

  it('no Focus timer shortcut without due revisions', async () => {
    await renderWithProviders(
      <HomeScreen />,
      setup([mk(2, 'upcoming', addDays(today, 2))]),
    );
    expect(await screen.findByText('Topic 2')).toBeOnTheScreen();
    expect(screen.queryByText('Go to focus timer')).toBeNull();
  });

  it('Coming up says how many more and opens Schedule', async () => {
    const agenda = [1, 2, 3, 4, 5, 6, 7].map(n =>
      mk(n, 'upcoming', addDays(today, 3)),
    );
    await renderWithProviders(<HomeScreen />, setup(agenda));
    expect(
      await screen.findByText('2 more in the next 30 days'),
    ).toBeOnTheScreen();
    // No count on the link: Schedule may still have an exam filter on.
    expect(screen.queryByText(/^See all \d/)).toBeNull();
    await fireEvent.press(screen.getByText('See all upcoming'));
    expect(mockNavigate).toHaveBeenCalledWith('MainTabs', {
      screen: 'Schedule',
    });
  });

  it('no See all link when Coming up shows every revision', async () => {
    const agenda = [1, 2, 3, 4, 5].map(n =>
      mk(n, 'upcoming', addDays(today, 3)),
    );
    await renderWithProviders(<HomeScreen />, setup(agenda));
    expect(await screen.findByText('Topic 5')).toBeOnTheScreen();
    expect(screen.queryByText(/^See all/)).toBeNull();
    expect(screen.queryByText(/more in the next/)).toBeNull();
  });

  it('Coming up names a revision beyond its 30 days', async () => {
    const later = addDays(today, 45);
    const far = topic({
      name: 'Breast',
      nextDueOn: later,
      revisions: [
        { id: 'R1', step: 1, dueOn: later, doneOn: null, dueOverride: null },
      ],
    });
    await renderWithProviders(<HomeScreen />, setup([], [far]));
    expect(
      await screen.findByText(
        `Nothing coming up in the next 30 days. Next: Breast on ${formatDate(
          later,
        )}.`,
      ),
    ).toBeOnTheScreen();
    expect(screen.queryByText('Nothing coming up')).toBeNull();
  });

  it('finishing the last active topic does not say No topics yet', async () => {
    let done = false;
    const earlier = '2026-11-05';
    const last = topic({
      id: ID(201),
      name: 'Topic 1',
      nextDueOn: today,
      revisions: [
        {
          id: 'A',
          step: 1,
          dueOn: earlier,
          doneOn: earlier,
          dueOverride: null,
        },
        { id: 'R1', step: 2, dueOn: today, doneOn: null, dueOverride: null },
      ],
    });
    const finished = topic({
      id: ID(300),
      name: 'Old',
      status: 'completed',
      nextDueOn: null,
      revisions: [
        {
          id: 'B',
          step: 1,
          dueOn: earlier,
          doneOn: earlier,
          dueOverride: null,
        },
      ],
    });
    const http = setup(
      () => (done ? [] : [{ ...mk(1, 'today', today), step: 2 }]),
      () =>
        done
          ? [
              {
                ...last,
                status: 'completed',
                nextDueOn: null,
                revisions: last.revisions.map(r => ({ ...r, doneOn: today })),
              },
              finished,
            ]
          : [last, finished],
    );
    http.post.mockImplementation(async () => {
      done = true;
      return {};
    });
    await renderWithProviders(<HomeScreen />, http);
    expect(await screen.findByText('Topic 1')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Done'));
    expect(
      await screen.findByText('Every topic fully revised'),
    ).toBeOnTheScreen();
    expect(screen.queryByText('No topics yet')).toBeNull();
    expect(screen.queryByText('+ Add topic')).toBeNull();
    await fireEvent.press(screen.getByText('Add a topic'));
    expect(mockNavigate).toHaveBeenCalledWith('TopicForm');
  });

  it('a new user sees one loading state, then one add action', async () => {
    const gate = deferred<TopicView[]>();
    const http = setup([], () => gate.promise);
    await renderWithProviders(<HomeScreen />, http);
    await waitFor(() =>
      expect(http.get).toHaveBeenCalledWith('/v1/topics', {}),
    );
    await act(async () => {});
    expect(screen.queryByText(/Nothing to revise today/)).toBeNull();
    expect(screen.queryByText('+ Add topic')).toBeNull();
    await act(async () => gate.resolve([]));
    expect(await screen.findByText('No topics yet')).toBeOnTheScreen();
    expect(screen.queryByText(/Nothing to revise today/)).toBeNull();
    expect(screen.queryByText('+ Add topic')).toBeNull();
    expect(screen.queryByText('Coming up')).toBeNull();
    expect(screen.getByText('Add your first topic')).toBeOnTheScreen();
  });

  it('a failed topic list on an empty day shows Retry', async () => {
    const http = setup([], () => Promise.reject(new ApiError('NETWORK', 0)));
    await renderWithProviders(<HomeScreen />, http);
    expect(await screen.findByText(offline)).toBeOnTheScreen();
    expect(screen.queryByText(/Nothing to revise today/)).toBeNull();
    expect(screen.getByText('Retry')).toBeOnTheScreen();
  });

  it('a failed agenda shows one error with one Retry', async () => {
    const http = setup(() => {
      throw new ApiError('NETWORK', 0);
    });
    await renderWithProviders(<HomeScreen />, http);
    expect(await screen.findByText(offline)).toBeOnTheScreen();
    expect(screen.getAllByText(offline)).toHaveLength(1);
    expect(screen.getAllByText('Retry')).toHaveLength(1);
    expect(screen.queryByText('Coming up')).toBeNull();
    // The focus timer still works.
    expect(screen.getByText('Start')).toBeOnTheScreen();
  });

  it('pull to refresh reloads the agenda', async () => {
    const http = setup([mk(1, 'today', today)]);
    await renderWithProviders(<HomeScreen />, http);
    expect(await screen.findByText('Topic 1')).toBeOnTheScreen();
    const agendaCalls = () =>
      http.get.mock.calls.filter(c => c[0] === '/v1/agenda').length;
    const before = agendaCalls();
    await refreshHome();
    expect(agendaCalls()).toBe(before + 1);
  });

  it('a failed pull to refresh keeps Overdue and says so', async () => {
    let fail = false;
    const http = setup(() => {
      if (fail) throw new ApiError('SERVICE_UNAVAILABLE', 503);
      return [mk(1, 'overdue', addDays(today, -2))];
    });
    await renderWithProviders(<HomeScreen />, http);
    expect(await screen.findByText('Topic 1')).toBeOnTheScreen();
    fail = true;
    await refreshHome();
    expect(await screen.findByText(/^Couldn't refresh/)).toBeOnTheScreen();
    expect(screen.getByText('Overdue')).toBeOnTheScreen();
    expect(screen.getByText('Topic 1')).toBeOnTheScreen();
  });

  it('praises the day when a revision was done today, even on a fresh Home', async () => {
    const studied = topic({
      nextDueOn: addDays(today, 3),
      revisions: [
        { id: 'R1', step: 1, dueOn: today, doneOn: today, dueOverride: null },
        {
          id: 'R2',
          step: 2,
          dueOn: addDays(today, 3),
          doneOn: null,
          dueOverride: null,
        },
      ],
    });
    await renderWithProviders(<HomeScreen />, setup([], [studied]));
    expect(
      await screen.findByText(/^All done for today. Well done!/),
    ).toBeOnTheScreen();
  });

  it('snoozing the only due revision is not praised', async () => {
    let snoozed = false;
    const row = mk(1, 'today', today);
    const http = setup(() =>
      snoozed
        ? [{ ...row, dueOn: addDays(today, 1), bucket: 'upcoming' }]
        : [row],
    );
    http.post.mockImplementation(async () => {
      snoozed = true;
      return {};
    });
    await renderWithProviders(<HomeScreen />, http);
    expect(await screen.findByText('Topic 1')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Snooze 1 day'));
    expect(
      await screen.findByText(/^Nothing to revise today\./),
    ).toBeOnTheScreen();
    expect(screen.queryByText(/All done for today/)).toBeNull();
  });
});
