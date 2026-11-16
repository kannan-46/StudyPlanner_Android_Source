import React from 'react';
import { useWindowDimensions } from 'react-native';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { addDays, localToday, type AgendaItem } from '@planner/shared';
import { ScheduleScreen } from '../ScheduleScreen';
import { ApiError } from '../../../shared/api/errors';
import { formatDate } from '../../../shared/lib/format';
import {
  ID,
  cleanupClients,
  makeHttp,
  renderWithProviders,
  topic,
} from '../../../test/testUtils';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useFocusEffect: jest.fn(),
  useNavigation: () => ({ navigate: mockNavigate }),
}));
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
const mockDims = (width: number, height = 800, fontScale = 1) =>
  (useWindowDimensions as jest.Mock).mockReturnValue({
    width,
    height,
    scale: 2,
    fontScale,
  });

const today = localToday();
const item = (
  name: string,
  bucket: AgendaItem['bucket'],
  dueOn: string,
  topicId = ID(100),
): AgendaItem => ({
  topicId,
  topicName: name,
  subjectId: ID(1),
  subjectName: 'Anatomy',
  revisionId: `R-${name}`,
  step: 2,
  totalSteps: 2,
  dueOn,
  bucket,
});
const items = [
  item('Old topic', 'overdue', addDays(today, -3), ID(101)),
  item('Hernia', 'today', today),
  item('Later topic', 'upcoming', addDays(today, 5), ID(102)),
];

function httpWith(agenda: AgendaItem[], topics = [topic()]) {
  const http = makeHttp(topics);
  const base = http.get.getMockImplementation() as (
    p: string,
    q?: unknown,
  ) => Promise<unknown>;
  http.get.mockImplementation(async (path: string, q?: unknown) =>
    path === '/v1/agenda' ? { items: agenda } : base(path, q),
  );
  return http;
}

beforeEach(() => {
  mockNavigate.mockReset();
  mockDims(360);
});
afterEach(cleanupClients);

describe('ScheduleScreen', () => {
  it('groups items under Overdue, Today and Upcoming', async () => {
    await renderWithProviders(<ScheduleScreen />, httpWith(items));
    expect(await screen.findByText('Overdue')).toBeOnTheScreen();
    expect(screen.getByText('Today')).toBeOnTheScreen();
    expect(screen.getByText('Upcoming (next 30 days)')).toBeOnTheScreen();
    expect(screen.getByText('Old topic')).toBeOnTheScreen();
    expect(screen.getByText('Hernia')).toBeOnTheScreen();
    expect(screen.getByText('Later topic')).toBeOnTheScreen();
    // Upcoming rows only show when they are due.
    expect(screen.getAllByText('Done')).toHaveLength(2);
    expect(screen.getAllByText('Snooze 1 day')).toHaveLength(2);
    expect(
      screen.getByText(/^Revision 2 of 2 · In 5 days, /),
    ).toBeOnTheScreen();
  });

  it('shows the empty state', async () => {
    const soon = topic({ nextDueOn: today });
    await renderWithProviders(<ScheduleScreen />, httpWith([], [soon]));
    expect(
      await screen.findByText('Nothing due in the next 30 days'),
    ).toBeOnTheScreen();
  });

  it('opens topic detail on compact', async () => {
    await renderWithProviders(<ScheduleScreen />, httpWith(items));
    await fireEvent.press(await screen.findByText('Hernia'));
    expect(mockNavigate).toHaveBeenCalledWith('TopicDetail', {
      topicId: ID(100),
    });
  });

  it('renders at 320 dp with fontScale 1.3', async () => {
    mockDims(320, 640, 1.3);
    await renderWithProviders(<ScheduleScreen />, httpWith(items));
    expect(await screen.findByText('Hernia')).toBeOnTheScreen();
  });

  it('expanded: master-detail shows the topic on the right', async () => {
    mockDims(1000, 700);
    await renderWithProviders(<ScheduleScreen />, httpWith(items));
    expect(await screen.findByText('Select a topic')).toBeOnTheScreen();
    await fireEvent.press(await screen.findByText('Hernia'));
    expect(await screen.findByText('Some notes')).toBeOnTheScreen();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('exam chip filters by topic exams and keeps unknown topics', async () => {
    const other = topic({ id: ID(103), name: 'Other', examIds: [] });
    const agenda = [
      item('Hernia', 'today', today),
      item('Other', 'today', today, ID(103)),
      item('Ghost', 'today', today, ID(999)),
    ];
    await renderWithProviders(
      <ScheduleScreen />,
      httpWith(agenda, [topic(), other]),
    );
    await screen.findByText('Hernia');
    await fireEvent.press(await screen.findByText('MS General Surgery'));
    expect(screen.getByText('Hernia')).toBeOnTheScreen();
    expect(screen.getByText('Ghost')).toBeOnTheScreen();
    expect(screen.queryByText('Other')).toBeNull();
  });

  it('exam chip keeps all items while topics are not loaded', async () => {
    const http = httpWith([item('Hernia', 'today', today)]);
    const base = http.get.getMockImplementation() as (
      p: string,
      q?: unknown,
    ) => Promise<unknown>;
    http.get.mockImplementation(async (path: string, q?: unknown) => {
      if (path === '/v1/topics') throw new ApiError('NETWORK', 0);
      return base(path, q);
    });
    await renderWithProviders(<ScheduleScreen />, http);
    await fireEvent.press(await screen.findByText('MS General Surgery'));
    expect(screen.getByText('Hernia')).toBeOnTheScreen();
  });

  it('rolls the cached agenda back when Done is rejected', async () => {
    const http = httpWith([item('Hernia', 'today', today)]);
    http.post.mockRejectedValue(new ApiError('NETWORK', 0));
    await renderWithProviders(<ScheduleScreen />, http);
    await fireEvent.press(await screen.findByText('Done'));
    expect(
      await screen.findByText("Can't reach the server — try again"),
    ).toBeOnTheScreen();
    expect(await screen.findByText('Hernia')).toBeOnTheScreen();
    expect(screen.getByText('Done')).toBeOnTheScreen();
  });

  it('VERSION_CONFLICT shows the message and refetches the agenda', async () => {
    const http = httpWith([item('Hernia', 'today', today)]);
    http.post.mockRejectedValue(new ApiError('VERSION_CONFLICT', 409));
    await renderWithProviders(<ScheduleScreen />, http);
    const agendaCalls = () =>
      http.get.mock.calls.filter(c => c[0] === '/v1/agenda').length;
    await fireEvent.press(await screen.findByText('Done'));
    expect(
      await screen.findByText('This changed on another device — refreshed'),
    ).toBeOnTheScreen();
    await waitFor(() => expect(agendaCalls()).toBeGreaterThan(1));
  });

  it('an exam with nothing due says so and offers Show all', async () => {
    const other = topic({ id: ID(103), name: 'Other', examIds: [] });
    await renderWithProviders(
      <ScheduleScreen />,
      httpWith([item('Other', 'today', today, ID(103))], [topic(), other]),
    );
    await screen.findByText('Other');
    await fireEvent.press(await screen.findByText('MS General Surgery'));
    expect(
      await screen.findByText('Nothing due for MS General Surgery'),
    ).toBeOnTheScreen();
    expect(screen.queryByText('Nothing due in the next 30 days')).toBeNull();
    await fireEvent.press(screen.getByText('Show all exams'));
    expect(await screen.findByText('Other')).toBeOnTheScreen();
  });

  it('expanded: the open topic is marked as selected in the list', async () => {
    mockDims(1000, 700);
    await renderWithProviders(<ScheduleScreen />, httpWith(items));
    await fireEvent.press(await screen.findByText('Hernia'));
    expect(screen.getByTestId(`schedule-row-${ID(100)}`)).toBeSelected();
    expect(screen.getByTestId(`schedule-row-${ID(101)}`)).not.toBeSelected();
    await fireEvent.press(screen.getByText('Old topic'));
    expect(screen.getByTestId(`schedule-row-${ID(101)}`)).toBeSelected();
    expect(screen.getByTestId(`schedule-row-${ID(100)}`)).not.toBeSelected();
  });

  it('words row status plainly', async () => {
    await renderWithProviders(<ScheduleScreen />, httpWith(items));
    expect(
      await screen.findByText('Revision 2 of 2 · Overdue by 3 days'),
    ).toBeOnTheScreen();
    expect(screen.getByText('Revision 2 of 2 · Due today')).toBeOnTheScreen();
  });
});

describe('ScheduleScreen (UX round 2)', () => {
  const refreshList = async () => {
    const list = screen.getByTestId('schedule-list');
    await act(async () => {
      await list.props.refreshControl.props.onRefresh();
    });
  };

  it('always has the Schedule title, with section headings', async () => {
    await renderWithProviders(<ScheduleScreen />, httpWith(items));
    expect(
      await screen.findByRole('header', { name: 'Schedule' }),
    ).toBeOnTheScreen();
    // The title shows while loading; the sections wait for the agenda.
    expect(
      await screen.findByRole('header', { name: 'Overdue' }),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole('header', { name: 'Upcoming (next 30 days)' }),
    ).toBeOnTheScreen();
  });

  it('keeps the title when there are no exams', async () => {
    const http = httpWith(items);
    const base = http.get.getMockImplementation() as (
      p: string,
      q?: unknown,
    ) => Promise<unknown>;
    http.get.mockImplementation(async (path: string, q?: unknown) =>
      path === '/v1/exams' ? [] : base(path, q),
    );
    await renderWithProviders(<ScheduleScreen />, http);
    expect(await screen.findByText('Hernia')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Schedule' })).toBeOnTheScreen();
    expect(screen.queryByText('All exams')).toBeNull();
  });

  it('the exam filter scrolls sideways and starts with All exams', async () => {
    await renderWithProviders(<ScheduleScreen />, httpWith(items));
    expect(await screen.findByText('All exams')).toBeOnTheScreen();
    expect(screen.getByTestId('chip-scroll-exam-filter')).toBeOnTheScreen();
  });

  it('names the next revision beyond the 30 days', async () => {
    const later = addDays(today, 45);
    const far = topic({ nextDueOn: later });
    await renderWithProviders(<ScheduleScreen />, httpWith([], [far]));
    expect(
      await screen.findByText('Nothing due in the next 30 days'),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(`Next: Hernia on ${formatDate(later)}.`),
    ).toBeOnTheScreen();
  });

  it('a user with no topics is offered Add your first topic', async () => {
    await renderWithProviders(<ScheduleScreen />, httpWith([], []));
    expect(await screen.findByText('No topics yet')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Add your first topic'));
    expect(mockNavigate).toHaveBeenCalledWith('TopicForm');
  });

  it('a user whose topics are all revised is told so', async () => {
    const done = topic({ status: 'completed', nextDueOn: null });
    await renderWithProviders(<ScheduleScreen />, httpWith([], [done]));
    expect(
      await screen.findByText('Every topic fully revised'),
    ).toBeOnTheScreen();
    expect(screen.queryByText('No topics yet')).toBeNull();
  });

  it('a failed pull to refresh says so and keeps the list', async () => {
    let fail = false;
    const http = httpWith(items);
    const base = http.get.getMockImplementation() as (
      p: string,
      q?: unknown,
    ) => Promise<unknown>;
    http.get.mockImplementation(async (path: string, q?: unknown) => {
      if (fail && path === '/v1/agenda') {
        throw new ApiError('SERVICE_UNAVAILABLE', 503);
      }
      return base(path, q);
    });
    await renderWithProviders(<ScheduleScreen />, http);
    expect(await screen.findByText('Hernia')).toBeOnTheScreen();
    fail = true;
    await refreshList();
    expect(await screen.findByText(/^Couldn't refresh/)).toBeOnTheScreen();
    expect(screen.getByText('Retry')).toBeOnTheScreen();
    expect(screen.getByText('Hernia')).toBeOnTheScreen();
  });

  it('an empty agenda waits for the topics before choosing a message', async () => {
    const http = httpWith([], []);
    const base = http.get.getMockImplementation() as (
      p: string,
      q?: unknown,
    ) => Promise<unknown>;
    let release: () => void = () => {};
    const gate = new Promise<void>(r => {
      release = r;
    });
    http.get.mockImplementation(async (path: string, q?: unknown) => {
      if (path === '/v1/topics') await gate;
      return base(path, q);
    });
    await renderWithProviders(<ScheduleScreen />, http);
    await waitFor(() =>
      expect(http.get.mock.calls.some(c => c[0] === '/v1/agenda')).toBeTruthy(),
    );
    expect(await screen.findByTestId('loading')).toBeOnTheScreen();
    expect(screen.queryByText('Nothing due in the next 30 days')).toBeNull();
    expect(screen.queryByText('No topics yet')).toBeNull();
    await act(async () => {
      release();
    });
    expect(await screen.findByText('No topics yet')).toBeOnTheScreen();
    expect(screen.queryByText('Nothing due in the next 30 days')).toBeNull();
  });

  it('an empty agenda with topics that failed to load offers Retry', async () => {
    const http = httpWith([], []);
    const base = http.get.getMockImplementation() as (
      p: string,
      q?: unknown,
    ) => Promise<unknown>;
    let fail = true;
    http.get.mockImplementation(async (path: string, q?: unknown) => {
      if (fail && path === '/v1/topics') {
        throw new ApiError('NETWORK', 0);
      }
      return base(path, q);
    });
    await renderWithProviders(<ScheduleScreen />, http);
    expect(
      await screen.findByText("Can't reach the server — try again"),
    ).toBeOnTheScreen();
    expect(screen.queryByText('Nothing due in the next 30 days')).toBeNull();
    fail = false;
    await fireEvent.press(screen.getByText('Retry'));
    expect(await screen.findByText('No topics yet')).toBeOnTheScreen();
  });

  it('a tab re-press scrolls the list back to the top', async () => {
    mockScrollRefs.length = 0;
    await renderWithProviders(<ScheduleScreen />, httpWith(items));
    await screen.findByText('Hernia');
    const ref = mockScrollRefs.at(-1) as {
      current: { scrollToLocation?: unknown };
    };
    expect(ref.current).toBeTruthy();
    expect(typeof ref.current.scrollToLocation).toBe('function');
  });
});
