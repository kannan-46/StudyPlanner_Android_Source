import React from 'react';
import { useWindowDimensions } from 'react-native';
import { fireEvent, screen } from '@testing-library/react-native';
import { addDays, localToday, type AgendaItem } from '@planner/shared';
import { ScheduleScreen } from '../ScheduleScreen';
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

function httpWith(agenda: AgendaItem[]) {
  const http = makeHttp([topic()]);
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
    expect(screen.getByText('Upcoming')).toBeOnTheScreen();
    expect(screen.getByText('Old topic')).toBeOnTheScreen();
    expect(screen.getByText('Hernia')).toBeOnTheScreen();
    expect(screen.getByText('Later topic')).toBeOnTheScreen();
    expect(screen.getAllByText('Done')).toHaveLength(3);
  });

  it('shows the empty state', async () => {
    await renderWithProviders(<ScheduleScreen />, httpWith([]));
    expect(
      await screen.findByText('Nothing due — add topics or enjoy the break'),
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
});
