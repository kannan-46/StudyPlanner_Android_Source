import React from 'react';
import { NativeModules, useWindowDimensions } from 'react-native';
import { fireEvent, screen } from '@testing-library/react-native';
import { addDays, localToday, type AgendaItem } from '@planner/shared';
import { HomeScreen } from '../HomeScreen';
import {
  ID,
  cleanupClients,
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

function setup(agenda: AgendaItem[]) {
  const http = makeHttp();
  http.get.mockImplementation(async (path: string) => {
    if (path === '/v1/agenda') return { items: agenda };
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
});
