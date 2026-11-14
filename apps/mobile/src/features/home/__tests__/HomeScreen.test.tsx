import React from 'react';
import { NativeModules, useWindowDimensions } from 'react-native';
import {
  act,
  fireEvent,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { addDays, localToday, type AgendaItem } from '@planner/shared';
import { HomeScreen } from '../HomeScreen';
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
  topics = [topic()],
) {
  const http = makeHttp();
  http.get.mockImplementation(async (path: string, q?: { today: string }) => {
    if (path === '/v1/agenda') {
      return { items: typeof agenda === 'function' ? agenda(q!) : agenda };
    }
    if (path === '/v1/topics') return topics;
    if (path === '/v1/me') return { name: 'Asha Rao', settings: {} };
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
    expect(screen.getAllByText('Done')).toHaveLength(13);
    expect(screen.getByText('Topic 14')).toBeOnTheScreen();
    expect(screen.queryByText('Topic 15')).toBeNull();
  });

  it('shows the reminder banner when notifications are off', async () => {
    NativeModules.Reminders = {
      getStatus: jest.fn().mockResolvedValue({ notificationsEnabled: false }),
    };
    await renderWithProviders(<HomeScreen />, setup([]));
    expect(await screen.findByText('Reminders are off')).toBeOnTheScreen();
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
    expect(screen.queryByText('Reminders are off')).toBeNull();
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
    const http = setup(() => (done ? [] : [mk(1, 'today', today)]));
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
    expect(screen.getByText('Revision 1 done')).toBeOnTheScreen();
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
