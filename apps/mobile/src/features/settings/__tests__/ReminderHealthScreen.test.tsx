import React from 'react';
import { useWindowDimensions } from 'react-native';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { ReminderHealthScreen } from '../ReminderHealthScreen';
import {
  getReminderStatus,
  openReminderSettings,
  sendTestNotification,
} from '../../../native/reminders';
import {
  cleanupClients,
  makeHttp,
  renderWithProviders,
} from '../../../test/testUtils';

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useFocusEffect: jest.fn(),
}));
jest.mock('../../../native/reminders', () => ({
  getReminderStatus: jest.fn(),
  openReminderSettings: jest.fn().mockResolvedValue(undefined),
  sendTestNotification: jest.fn(),
}));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(),
}));
const mockDims = (width: number, fontScale = 1) =>
  (useWindowDimensions as jest.Mock).mockReturnValue({
    width,
    height: 800,
    scale: 2,
    fontScale,
  });
const status = (over = {}) => ({
  notificationsEnabled: true,
  exactAlarmsAllowed: true,
  ignoringBatteryOptimizations: true,
  nextFireAtMillis: null,
  ...over,
});

afterEach(cleanupClients);
beforeEach(() => {
  jest.clearAllMocks();
  mockDims(360);
  (getReminderStatus as jest.Mock).mockResolvedValue(status());
});

it('notifications off shows "Off — Fix" which opens notification settings', async () => {
  (getReminderStatus as jest.Mock).mockResolvedValue(
    status({ notificationsEnabled: false }),
  );
  await renderWithProviders(<ReminderHealthScreen />, makeHttp());
  await fireEvent.press(await screen.findByText('Off — Fix'));
  expect(openReminderSettings).toHaveBeenCalledWith('notifications');
});

it('shows ticks when everything is on and the next reminder', async () => {
  const at = new Date(2026, 10, 14, 8, 0).getTime(); // Saturday
  (getReminderStatus as jest.Mock).mockResolvedValue(
    status({ nextFireAtMillis: at }),
  );
  await renderWithProviders(<ReminderHealthScreen />, makeHttp());
  expect(await screen.findByText('Next reminder: Sat, 08:00')).toBeTruthy();
  expect(screen.queryByText('Off — Fix')).toBeNull();
});

it('shows Nothing due when there is no fire time', async () => {
  await renderWithProviders(<ReminderHealthScreen />, makeHttp());
  expect(await screen.findByText('Next reminder: Nothing due')).toBeTruthy();
});

it('test notification: success and notifications-off error', async () => {
  (sendTestNotification as jest.Mock).mockResolvedValueOnce(undefined);
  await renderWithProviders(<ReminderHealthScreen />, makeHttp());
  await fireEvent.press(await screen.findByText('Send test notification'));
  expect(await screen.findByText('Test notification sent')).toBeTruthy();
  (sendTestNotification as jest.Mock).mockRejectedValueOnce({
    code: 'E_NOTIFICATIONS_OFF',
  });
  await fireEvent.press(screen.getByText('Send test notification'));
  expect(
    await screen.findByText('Notifications are off — turn them on first'),
  ).toBeTruthy();
});

it('renders at 320 dp with font scale 1.3 and at 1000 dp', async () => {
  mockDims(320, 1.3);
  const { unmount } = await renderWithProviders(
    <ReminderHealthScreen />,
    makeHttp(),
  );
  expect(await screen.findByText('Send test notification')).toBeTruthy();
  unmount();
  mockDims(1000);
  await renderWithProviders(<ReminderHealthScreen />, makeHttp());
  await waitFor(() =>
    expect(screen.getByText('Send test notification')).toBeTruthy(),
  );
});
