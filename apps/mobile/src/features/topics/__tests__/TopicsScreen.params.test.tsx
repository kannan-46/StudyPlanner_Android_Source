import React, { useMemo, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { NavigationRouteContext } from '@react-navigation/native';
import type { TopicListQuery, TopicView } from '@planner/shared';
import { TopicsScreen } from '../TopicsScreen';
import {
  ID,
  cleanupClients,
  makeHttp,
  renderWithProviders,
  topic,
} from '../../../test/testUtils';

// The Topics route's params, as the tab navigator holds them; setParams
// changes them like the real navigator does.
const mockParams: {
  set: ((p: Record<string, unknown> | undefined) => void) | null;
} = { set: null };
const mockSetParams = jest.fn((p: Record<string, unknown>) => {
  mockParams.set?.(p);
});
const mockNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  setParams: mockSetParams,
};
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useFocusEffect: jest.fn(),
  useNavigation: () => mockNavigation,
}));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  (useWindowDimensions as jest.Mock).mockReturnValue({
    width: 360,
    height: 800,
    scale: 2,
    fontScale: 1,
  });
});
afterEach(cleanupClients);

function TopicsRoute({ initial }: { initial?: Record<string, unknown> }) {
  const [params, setParams] = useState(initial);
  mockParams.set = p => setParams(old => ({ ...old, ...p }));
  const route = useMemo(
    () => ({ key: 'Topics-1', name: 'Topics', params }),
    [params],
  );
  return (
    <NavigationRouteContext.Provider value={route}>
      <TopicsScreen />
    </NavigationRouteContext.Provider>
  );
}

const done = (over: Partial<TopicView> = {}) =>
  topic({
    id: ID(101),
    name: 'Krebs cycle',
    status: 'completed',
    nextDueOn: null,
    revisions: topic().revisions.map(r => ({ ...r, doneOn: r.dueOn })),
    ...over,
  });

/** Answers /v1/topics by status, like the server. */
function byStatus(active: TopicView[], completed: TopicView[]) {
  const http = makeHttp();
  const base = http.get.getMockImplementation()!;
  http.get.mockImplementation(async (path: string, q?: unknown) => {
    if (path !== '/v1/topics') return base(path, q);
    const query = (q ?? {}) as TopicListQuery;
    const all = [...active, ...completed];
    const list =
      query.status === 'active'
        ? active
        : query.status === 'completed'
        ? completed
        : all;
    return query.subjectId
      ? list.filter(t => t.subjectId === query.subjectId)
      : list;
  });
  return http;
}

const topicsCalls = (http: ReturnType<typeof makeHttp>) =>
  http.get.mock.calls.filter(c => c[0] === '/v1/topics').map(c => c[1]);

it('opened with a subject, shows all of its topics, completed ones too', async () => {
  const http = byStatus([topic()], [done()]);
  await renderWithProviders(
    <TopicsRoute initial={{ subjectId: ID(1) }} />,
    http,
  );
  expect(await screen.findByText('Krebs cycle')).toBeOnTheScreen();
  expect(screen.getByText('Hernia')).toBeOnTheScreen();
  expect(topicsCalls(http)).toContainEqual({ subjectId: ID(1) });
  expect(
    screen.getByRole('radio', { name: 'All topics' }).props.accessibilityState
      .checked,
  ).toBe(true);
  expect(
    screen.getByRole('radio', { name: 'Anatomy' }).props.accessibilityState
      .checked,
  ).toBe(true);
  // The params are used once, so a later change by hand is kept.
  expect(mockSetParams).toHaveBeenCalledWith({
    subjectId: undefined,
    examId: undefined,
  });
  await fireEvent.press(screen.getByText('Active'));
  await waitFor(() =>
    expect(
      screen.getByRole('radio', { name: 'Active' }).props.accessibilityState
        .checked,
    ).toBe(true),
  );
  expect(screen.queryByText('Krebs cycle')).toBeNull();
});

it('an empty Active list with finished topics says all are fully revised', async () => {
  const http = byStatus([], [done()]);
  await renderWithProviders(<TopicsRoute />, http);
  expect(await screen.findByText('No active topics')).toBeOnTheScreen();
  expect(screen.queryByText('No topics yet')).toBeNull();
  await fireEvent.press(screen.getByText('Show completed'));
  expect(await screen.findByText('Krebs cycle')).toBeOnTheScreen();
});

it('with no topics at all still offers to add the first one', async () => {
  await renderWithProviders(<TopicsRoute />, byStatus([], []));
  expect(await screen.findByText('No topics yet')).toBeOnTheScreen();
  expect(screen.queryByText('No active topics')).toBeNull();
});
