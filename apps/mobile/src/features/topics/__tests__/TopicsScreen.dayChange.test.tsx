import React from 'react';
import { useWindowDimensions } from 'react-native';
import { act, screen } from '@testing-library/react-native';
import { TopicsScreen } from '../TopicsScreen';
import {
  cleanupClients,
  makeHttp,
  renderWithProviders,
  topic,
} from '../../../test/testUtils';

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useFocusEffect: jest.fn(),
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
}));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(),
}));

// The phone's date, moved forward by the test (as useLocalToday does when
// the app comes back the next day or passes midnight).
const mockDay = {
  value: '2026-11-11',
  listeners: new Set<() => void>(),
  set(v: string) {
    this.value = v;
    this.listeners.forEach(l => l());
  },
};
jest.mock('../../../shared/lib/useLocalToday', () => {
  const { useSyncExternalStore } = jest.requireActual('react');
  return {
    useLocalToday: () =>
      useSyncExternalStore(
        (l: () => void) => {
          mockDay.listeners.add(l);
          return () => mockDay.listeners.delete(l);
        },
        () => mockDay.value,
      ),
  };
});

beforeEach(() => {
  (useWindowDimensions as jest.Mock).mockReturnValue({
    width: 360,
    height: 800,
    scale: 2,
    fontScale: 1,
  });
  mockDay.value = '2026-11-11';
});
afterEach(cleanupClients);

it('moves row labels to the new day without new data (F26)', async () => {
  await renderWithProviders(<TopicsScreen />, makeHttp([topic()]));
  expect(await screen.findByText('Due tomorrow')).toBeOnTheScreen();
  await act(async () => mockDay.set('2026-11-12'));
  expect(screen.getByText('Due today')).toBeOnTheScreen();
  await act(async () => mockDay.set('2026-11-13'));
  expect(screen.getByText('Overdue by 1 day')).toBeOnTheScreen();
});
