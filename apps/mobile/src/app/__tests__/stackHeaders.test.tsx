import React from 'react';
import { StyleSheet } from 'react-native';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import {
  NavigationContainer,
  createNavigationContainerRef,
} from '@react-navigation/native';
import type { UserView } from '@planner/shared';
import { useAuth } from '../../features/auth/AuthProvider';
import {
  cleanupClients,
  makeHttp,
  mockHardwareBack,
  renderWithProviders,
  topic,
  type Mocks,
} from '../../test/testUtils';
import { RootNavigator, type RootStackParamList } from '../RootNavigator';

jest.mock('../../features/auth/AuthProvider', () => ({
  useAuth: jest.fn(),
  notifySessionEnded: jest.fn(),
}));

const user = {
  id: 'u1',
  email: 'a@b.c',
  onboardingCompletedAt: '2026-01-01T00:00:00Z',
  settings: { theme: 'light', intervals: [4, 7, 15] },
} as unknown as UserView;

let back: ReturnType<typeof mockHardwareBack>;
beforeEach(() => {
  jest.clearAllMocks();
  (useAuth as jest.Mock).mockReturnValue({
    state: { status: 'signedIn', user },
    signOut: jest.fn(),
    refreshUser: jest.fn(),
  });
  back = mockHardwareBack();
});
afterEach(async () => {
  back.restore();
  await cleanupClients();
});

const nav = createNavigationContainerRef<RootStackParamList>();

/** makeHttp; screens it doesn't know about (Home etc.) just fail to load. */
function http0(): Mocks {
  const http = makeHttp([topic()]);
  const known = http.get.getMockImplementation() as (p: string) => unknown;
  http.get.mockImplementation((path: string) =>
    /^\/v1\/(subjects|exams|me|topics)/.test(path)
      ? known(path)
      : Promise.reject(new Error('not needed here')),
  );
  return http;
}

async function setup(http: Mocks = http0()) {
  await renderWithProviders(
    <NavigationContainer ref={nav}>
      <RootNavigator />
    </NavigationContainer>,
    http,
  );
  await waitFor(() => expect(nav.isReady()).toBe(true));
  return http;
}

async function go<K extends keyof RootStackParamList>(
  ...args: undefined extends RootStackParamList[K]
    ? [K] | [K, RootStackParamList[K]]
    : [K, RootStackParamList[K]]
) {
  await act(async () => {
    (nav.navigate as (...a: unknown[]) => void)(...args);
  });
}

const currentRoute = () => nav.getCurrentRoute()?.name;

describe('pushed screens have a titled header with a back button', () => {
  it.each([
    ['ReminderHealth', 'Reminder health'],
    ['ManageExamsSubjects', 'Exams & subjects'],
    ['MockTestForm', 'Add mock test'],
    ['TopicForm', 'Add topic'],
  ] as const)('%s shows "%s"', async (route, title) => {
    await setup();
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    await go(route);
    expect(await screen.findByRole('header', { name: title })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(currentRoute()).not.toBe(route));
    expect(nav.getRootState()?.routes).toHaveLength(1);
  });

  it('titles the edit form "Edit topic"', async () => {
    await setup();
    await go('TopicForm', { topicId: topic().id });
    expect(
      await screen.findByRole('header', { name: 'Edit topic' }),
    ).toBeTruthy();
    expect(screen.queryByRole('header', { name: 'Add topic' })).toBeNull();
    await waitFor(() =>
      expect(screen.getByLabelText('Topic name').props.value).toBe('Hernia'),
    );
  });

  it('titles topic detail with the topic name, shown once', async () => {
    await setup();
    await go('TopicDetail', { topicId: topic().id });
    expect(await screen.findByRole('header', { name: 'Hernia' })).toBeTruthy();
    expect(screen.getAllByText('Hernia')).toHaveLength(1);
  });

  it('back button is a 48 dp target', async () => {
    await setup();
    await go('ReminderHealth');
    const button = await screen.findByRole('button', { name: 'Back' });
    const style = StyleSheet.flatten(button.props.style);
    expect(style.width).toBeGreaterThanOrEqual(48);
    expect(style.height).toBeGreaterThanOrEqual(48);
  });

  it('Android back returns to the previous screen', async () => {
    await setup();
    await go('ManageExamsSubjects');
    await screen.findByRole('header', { name: 'Exams & subjects' });
    await act(async () => {
      expect(back.press()).toBe(true);
    });
    await waitFor(() => expect(currentRoute()).not.toBe('ManageExamsSubjects'));
  });
});

describe('unsaved changes', () => {
  it('leaves an untouched topic form without asking', async () => {
    await setup();
    await go('TopicForm');
    await screen.findByLabelText('Topic name');
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(currentRoute()).not.toBe('TopicForm'));
    expect(screen.queryByText('Discard changes?')).toBeNull();
  });

  it('asks before throwing away a typed topic; Keep editing stays', async () => {
    await setup();
    await go('TopicForm');
    await fireEvent.changeText(
      await screen.findByLabelText('Topic name'),
      'Hernia',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByText('Discard changes?')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Keep editing' }));
    await waitFor(() =>
      expect(screen.queryByText('Discard changes?')).toBeNull(),
    );
    expect(currentRoute()).toBe('TopicForm');
    expect(screen.getByLabelText('Topic name').props.value).toBe('Hernia');

    // The Android back button asks too; Discard leaves.
    await act(async () => {
      back.press();
    });
    expect(await screen.findByText('Discard changes?')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(currentRoute()).not.toBe('TopicForm'));
  });

  it('asks on the edit form only after a change', async () => {
    await setup();
    await go('TopicForm', { topicId: topic().id });
    const name = await screen.findByLabelText('Topic name');
    await waitFor(() => expect(name.props.value).toBe('Hernia'));
    await fireEvent.changeText(name, 'Hernia repair');
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByText('Discard changes?')).toBeTruthy();
  });

  it('closes after saving a topic without asking', async () => {
    const http = http0();
    http.post.mockResolvedValue(topic({ id: 'new', name: 'Appendix' }));
    await setup(http);
    await go('TopicForm');
    await fireEvent.changeText(
      await screen.findByLabelText('Topic name'),
      'Appendix',
    );
    await fireEvent.press(await screen.findByText('Anatomy'));
    await fireEvent.press(screen.getByRole('button', { name: 'Add topic' }));
    await waitFor(() => expect(currentRoute()).not.toBe('TopicForm'));
    expect(screen.queryByText('Discard changes?')).toBeNull();
  });

  it('asks before throwing away a typed mock test', async () => {
    await setup();
    await go('MockTestForm');
    await fireEvent.changeText(await screen.findByLabelText('Title'), 'Mock 1');
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByText('Discard changes?')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(currentRoute()).not.toBe('MockTestForm'));
  });

  it('closes after saving a mock test without asking', async () => {
    const http = http0();
    http.post.mockResolvedValue({ id: 'm1' });
    await setup(http);
    await go('MockTestForm');
    await fireEvent.changeText(await screen.findByLabelText('Title'), 'Mock 1');
    await fireEvent.changeText(screen.getByLabelText('Score'), '50');
    await fireEvent.changeText(screen.getByLabelText('Max score'), '100');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(currentRoute()).not.toBe('MockTestForm'));
    expect(screen.queryByText('Discard changes?')).toBeNull();
  });
});
