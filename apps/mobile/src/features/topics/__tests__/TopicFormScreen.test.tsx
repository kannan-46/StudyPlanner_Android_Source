import React from 'react';
import { Text } from 'react-native';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import {
  NavigationContainer,
  createNavigationContainerRef,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { ExamView, TopicView } from '@planner/shared';
import { ApiError } from '../../../shared/api/errors';
import { STILL_SAVING_MESSAGE } from '../../../shared/ui/useLeaveGuard';
import { TopicFormScreen, addedMessage } from '../TopicFormScreen';
import {
  ID,
  cleanupClients,
  exams,
  makeHttp,
  renderWithProviders,
  topic,
  type Mocks,
} from '../../../test/testUtils';

type Params = {
  Start: undefined;
  TopicForm: { topicId?: string; examId?: string } | undefined;
};
const Stack = createNativeStackNavigator<Params>();
const nav = createNavigationContainerRef<Params>();

afterEach(cleanupClients);

function Start() {
  return <Text>Start screen</Text>;
}

async function setup(http: Mocks, params?: Params['TopicForm']) {
  await renderWithProviders(
    <NavigationContainer ref={nav}>
      <Stack.Navigator>
        <Stack.Screen name="Start" component={Start} />
        <Stack.Screen name="TopicForm" component={TopicFormScreen} />
      </Stack.Navigator>
    </NavigationContainer>,
    http,
  );
  await waitFor(() => expect(nav.isReady()).toBe(true));
  await act(async () => {
    nav.navigate('TopicForm', params);
  });
}

const route = () => nav.getCurrentRoute()?.name;

async function fill(name: string) {
  await fireEvent.changeText(await screen.findByLabelText(/^Topic name/), name);
  await fireEvent.press(await screen.findByText('Anatomy'));
}

describe('TopicFormScreen', () => {
  it('words the added message with today/tomorrow', () => {
    expect(addedMessage(topic({ nextDueOn: '2026-11-12' }), '2026-11-11')).toBe(
      'Hernia added — first revision tomorrow',
    );
    expect(addedMessage(topic({ nextDueOn: '2026-11-20' }), '2026-11-11')).toBe(
      'Hernia added — first revision on 20 Nov',
    );
  });

  it('never shows a past date as the first revision', () => {
    expect(addedMessage(topic({ nextDueOn: '2026-10-20' }), '2026-11-11')).toBe(
      'Hernia added — first revision is due now',
    );
    expect(addedMessage(topic({ nextDueOn: '2026-11-11' }), '2026-11-11')).toBe(
      'Hernia added — first revision is due today',
    );
  });

  it('Back while saving waits instead of offering to discard (F116)', async () => {
    const http = makeHttp();
    let resolve!: (t: TopicView) => void;
    http.post.mockReturnValue(new Promise(r => (resolve = r)));
    await setup(http);
    await fill('Appendix');
    // Not awaited: the press waits for the held save.
    fireEvent.press(screen.getByText('Add topic'));
    await waitFor(() => expect(http.post).toHaveBeenCalled());
    await act(async () => {
      nav.goBack();
    });
    expect(await screen.findByText(STILL_SAVING_MESSAGE)).toBeOnTheScreen();
    expect(screen.queryByText('Discard changes?')).toBeNull();
    expect(route()).toBe('TopicForm');
    await act(async () => resolve(topic({ name: 'Appendix' })));
    await waitFor(() => expect(route()).toBe('Start'));
  });

  it('shows the added snackbar after leaving the form (F121)', async () => {
    const http = makeHttp();
    http.post.mockResolvedValue(topic({ name: 'Appendix' }));
    await setup(http);
    await fill('Appendix');
    await fireEvent.press(screen.getByText('Add topic'));
    await waitFor(() => expect(route()).toBe('Start'));
    expect(
      await screen.findByText(/^Appendix added — first revision/),
    ).toBeOnTheScreen();
    expect(screen.queryByText('Discard changes?')).toBeNull();
  });

  it('a failed save keeps the form and the discard prompt works again', async () => {
    const http = makeHttp();
    http.post.mockRejectedValue(new ApiError('NETWORK', 0));
    await setup(http);
    await fill('Appendix');
    await fireEvent.press(screen.getByText('Add topic'));
    expect(
      await screen.findByText("Can't reach the server — try again"),
    ).toBeOnTheScreen();
    await act(async () => {
      nav.goBack();
    });
    expect(await screen.findByText('Discard changes?')).toBeOnTheScreen();
  });

  it('ticks the exam passed from the Topics filter (F23)', async () => {
    const both: ExamView[] = [
      ...exams,
      { id: ID(12), name: 'NEET SS', examDate: null },
    ];
    const http = makeHttp();
    const known = http.get.getMockImplementation() as (
      p: string,
      q?: unknown,
    ) => unknown;
    http.get.mockImplementation(async (path: string, q?: unknown) =>
      path === '/v1/exams' ? both : known(path, q),
    );
    await setup(http, { examId: ID(12) });
    await waitFor(() =>
      expect(
        screen.getByRole('checkbox', { name: 'NEET SS' }).props
          .accessibilityState.checked,
      ).toBe(true),
    );
    expect(
      screen.getByRole('checkbox', { name: 'MS General Surgery' }).props
        .accessibilityState.checked,
    ).toBe(false);
    // Opening with a default exam is not a change.
    await act(async () => {
      nav.goBack();
    });
    await waitFor(() => expect(route()).toBe('Start'));
  });

  it('an edit of a deleted topic says so and offers Go back', async () => {
    const http = makeHttp();
    const known = http.get.getMockImplementation() as (p: string) => unknown;
    http.get.mockImplementation(async (path: string) => {
      if (path.startsWith('/v1/topics/')) throw new ApiError('NOT_FOUND', 404);
      return known(path);
    });
    await setup(http, { topicId: ID(100) });
    expect(
      await screen.findByText('This topic has been deleted'),
    ).toBeOnTheScreen();
    expect(screen.queryByText('Retry')).toBeNull();
    await fireEvent.press(screen.getByText('Go back'));
    await waitFor(() => expect(route()).toBe('Start'));
  });
});
