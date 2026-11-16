import React, { useState } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { fireEvent, screen, waitFor, act } from '@testing-library/react-native';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { ExamView, TopicView } from '@planner/shared';
import { ApiError } from '../../../shared/api/errors';
import { TopicsScreen, progressLabel, topicRowLabel } from '../TopicsScreen';
import { TopicDetailContent, nameFitsHeader } from '../TopicDetailScreen';
import {
  ID,
  cleanupClients,
  exams,
  makeHttp,
  mockScreenReader,
  renderWithProviders,
  topic,
} from '../../../test/testUtils';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useFocusEffect: jest.fn(),
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
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

beforeEach(() => {
  mockNavigate.mockReset();
  mockDims(360);
});
afterEach(cleanupClients);

/** Hands the test the screen's QueryClient. */
let qc: QueryClient;
function GrabClient() {
  qc = useQueryClient();
  return null;
}

/** Puts data in the cache before its siblings render. */
function Seed({ entries }: { entries: [readonly unknown[], unknown][] }) {
  const client = useQueryClient();
  useState(() => {
    entries.forEach(([key, data]) => client.setQueryData(key, data));
    return true;
  });
  return null;
}

const completed = (over: Partial<TopicView> = {}) =>
  topic({
    id: ID(101),
    name: 'Krebs cycle',
    status: 'completed',
    nextDueOn: null,
    revisions: topic().revisions.map(r => ({ ...r, doneOn: r.dueOn })),
    ...over,
  });

const topicsCalls = (http: ReturnType<typeof makeHttp>) =>
  http.get.mock.calls.filter(c => c[0] === '/v1/topics').map(c => c[1]);

describe('TopicsScreen', () => {
  it('shows the empty state with an Add action', async () => {
    await renderWithProviders(<TopicsScreen />, makeHttp([]));
    expect(await screen.findByText('No topics yet')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Add topic'));
    expect(mockNavigate).toHaveBeenCalledWith('TopicForm');
  });

  it('starts with a "Topics" title', async () => {
    await renderWithProviders(<TopicsScreen />, makeHttp([]));
    expect(
      await screen.findByRole('header', { name: 'Topics' }),
    ).toBeOnTheScreen();
  });

  it('lists rows and navigates to detail on compact', async () => {
    await renderWithProviders(<TopicsScreen />, makeHttp([topic()]));
    expect(await screen.findByText('Hernia')).toBeOnTheScreen();
    expect(screen.getByText('1 of 2 done')).toBeOnTheScreen();
    expect(screen.queryByText(/^R\d/)).toBeNull();
    await fireEvent.press(screen.getByText('Hernia'));
    expect(mockNavigate).toHaveBeenCalledWith('TopicDetail', {
      topicId: ID(100),
    });
  });

  it('words progress plainly, and "All N done" when finished', () => {
    expect(progressLabel(topic())).toBe('1 of 2 done');
    expect(progressLabel(completed())).toBe('All 2 done');
    expect(
      progressLabel(
        topic({ revisions: topic().revisions.map(r => ({ ...r, doneOn: null })) }),
      ),
    ).toBe('0 of 2 done');
  });

  it('reads each row to TalkBack in words', async () => {
    expect(topicRowLabel(topic(), 'Anatomy', '2026-11-11')).toBe(
      'Hernia, Anatomy, Due tomorrow, 1 of 2 done',
    );
    expect(topicRowLabel(completed(), undefined, '2026-11-11')).toBe(
      'Krebs cycle, Completed, All 2 done',
    );
    await renderWithProviders(<TopicsScreen />, makeHttp([topic()]));
    expect(
      await screen.findByRole('button', { name: /^Hernia, Anatomy, .*1 of 2 done$/ }),
    ).toBeOnTheScreen();
  });

  it('colours an overdue topic with the shared due wording', async () => {
    await renderWithProviders(
      <TopicsScreen />,
      makeHttp([topic({ nextDueOn: '2020-01-01' })]),
    );
    const due = await screen.findByText(/^Overdue by \d+ days$/);
    expect(StyleSheet.flatten(due.props.style).fontWeight).toBe('700');
  });

  it('renders at 320 dp with fontScale 1.3', async () => {
    mockDims(320, 640, 1.3);
    await renderWithProviders(<TopicsScreen />, makeHttp([topic()]));
    expect(await screen.findByText('Hernia')).toBeOnTheScreen();
    expect(screen.getByText('+ Add topic')).toBeOnTheScreen();
  });

  it('puts the subject and exam filters on single sideways rows', async () => {
    await renderWithProviders(<TopicsScreen />, makeHttp([topic()]));
    expect(await screen.findByText('All subjects')).toBeOnTheScreen();
    expect(await screen.findByText('All exams')).toBeOnTheScreen();
    const subjectRow = screen.getByTestId('chip-scroll-subject');
    expect(subjectRow.props.horizontal).toBe(true);
    expect(screen.getByTestId('chip-scroll-exam').props.horizontal).toBe(true);
    // Every option is still there, and named for TalkBack.
    expect(
      screen.getByRole('radio', { name: 'Physiology' }).props.accessibilityHint,
    ).toBe('Subject');
    expect(
      screen.getByRole('radio', { name: 'Active' }).props.accessibilityHint,
    ).toBe('Status');
    expect(screen.queryByText('All')).toBeNull();
  });

  it('keeps the search box and filters undimmed while a new filter loads', async () => {
    const http = makeHttp([topic()]);
    const known = http.get.getMockImplementation() as (
      p: string,
      q?: unknown,
    ) => unknown;
    let release!: (v: unknown) => void;
    http.get.mockImplementation((path: string, q?: { subjectId?: string }) =>
      path === '/v1/topics' && q?.subjectId
        ? new Promise(resolve => (release = resolve))
        : known(path, q),
    );
    await renderWithProviders(<TopicsScreen />, http);
    await screen.findByText('Hernia');
    await fireEvent.press(await screen.findByText('Physiology'));
    await waitFor(() =>
      expect(screen.getByLabelText('Updating list')).toBeOnTheScreen(),
    );
    expect(screen.getByText('Hernia')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Loading')).toBeNull();
    const row = screen.getByRole('button', { name: /^Hernia/ });
    expect(StyleSheet.flatten(row.props.style).opacity).toBe(0.6);
    const list = screen.getByTestId('topics-list');
    expect(StyleSheet.flatten(list.props.style)?.opacity).toBeUndefined();
    await act(async () => release([]));
    expect(await screen.findByText('No matching topics')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Updating list')).toBeNull();
  });

  it('debounces search by 300 ms into q', async () => {
    const http = makeHttp([topic()]);
    const hasQ = () => http.get.mock.calls.some(c => c[1] && c[1].q === 'her');
    await renderWithProviders(<TopicsScreen />, http);
    await screen.findByText('Hernia');
    jest.useFakeTimers();
    try {
      await fireEvent.changeText(screen.getByLabelText('Search topics'), 'her');
      await act(async () => {
        jest.advanceTimersByTime(299);
      });
      expect(hasQ()).toBe(false);
      await act(async () => {
        jest.advanceTimersByTime(2);
      });
    } finally {
      jest.useRealTimers();
    }
    await waitFor(() => expect(hasQ()).toBe(true));
  });

  it('a search with no active match points to the completed one', async () => {
    const http = makeHttp([topic()]);
    const known = http.get.getMockImplementation() as (
      p: string,
      q?: unknown,
    ) => unknown;
    http.get.mockImplementation(
      async (path: string, q?: { q?: string; status?: string }) => {
        if (path === '/v1/topics' && q?.q) {
          return q.status === 'completed' ? [completed()] : [];
        }
        return known(path, q);
      },
    );
    await renderWithProviders(<TopicsScreen />, http);
    await screen.findByText('Hernia');
    await fireEvent.changeText(screen.getByLabelText('Search topics'), 'krebs');
    expect(
      await screen.findByText('No active topics match "krebs"'),
    ).toBeOnTheScreen();
    expect(screen.getByText('1 completed topic matches')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Show completed'));
    expect(await screen.findByText('Krebs cycle')).toBeOnTheScreen();
    expect(
      screen.getByRole('radio', { name: 'Completed' }).props.accessibilityState
        .checked,
    ).toBe(true);
  });

  it('offers to clear the search and filters when nothing matches', async () => {
    const http = makeHttp([topic()]);
    const known = http.get.getMockImplementation() as (
      p: string,
      q?: unknown,
    ) => unknown;
    http.get.mockImplementation(async (path: string, q?: { q?: string }) =>
      path === '/v1/topics' && q?.q ? [] : known(path, q),
    );
    await renderWithProviders(<TopicsScreen />, http);
    await screen.findByText('Hernia');
    await fireEvent.press(screen.getByText('Physiology'));
    await fireEvent.changeText(screen.getByLabelText('Search topics'), 'zzz');
    expect(await screen.findByText('No matching topics')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Clear search & filters'));
    expect(await screen.findByText('Hernia')).toBeOnTheScreen();
    expect(screen.getByLabelText('Search topics').props.value).toBe('');
    expect(
      screen.getByRole('radio', { name: 'All subjects' }).props
        .accessibilityState.checked,
    ).toBe(true);
  });

  it('clears the search with the × button', async () => {
    await renderWithProviders(<TopicsScreen />, makeHttp([topic()]));
    await screen.findByText('Hernia');
    expect(screen.queryByLabelText('Clear search')).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Search topics'), 'her');
    await fireEvent.press(screen.getByLabelText('Clear search'));
    expect(screen.getByLabelText('Search topics').props.value).toBe('');
  });

  it('Completed with nothing finished says so, without Add', async () => {
    await renderWithProviders(<TopicsScreen />, makeHttp([]));
    await screen.findByText('No topics yet');
    await fireEvent.press(screen.getByText('Completed'));
    expect(
      await screen.findByText('No completed topics yet'),
    ).toBeOnTheScreen();
    expect(screen.queryByText('No matching topics')).toBeNull();
    expect(screen.queryByText('Add topic')).toBeNull();
  });

  it('drops an exam filter once that exam is deleted', async () => {
    const http = makeHttp([topic()]);
    let examList: ExamView[] = [
      ...exams,
      { id: ID(12), name: 'NEET SS', examDate: null },
    ];
    const known = http.get.getMockImplementation() as (
      p: string,
      q?: unknown,
    ) => unknown;
    http.get.mockImplementation(async (path: string, q?: unknown) =>
      path === '/v1/exams' ? examList : known(path, q),
    );
    await renderWithProviders(
      <>
        <GrabClient />
        <TopicsScreen />
      </>,
      http,
    );
    await fireEvent.press(await screen.findByText('NEET SS'));
    await waitFor(() =>
      expect(topicsCalls(http).at(-1)).toMatchObject({ examId: ID(12) }),
    );
    examList = [...exams];
    await act(async () => {
      await qc.invalidateQueries({ queryKey: ['exams'] });
    });
    await waitFor(() =>
      expect(topicsCalls(http).at(-1)).not.toHaveProperty('examId'),
    );
    expect(
      screen.getByRole('radio', { name: 'All exams' }).props.accessibilityState
        .checked,
    ).toBe(true);
    expect(await screen.findByText('Hernia')).toBeOnTheScreen();
  });

  it('drops the filter when the last exam is deleted', async () => {
    const http = makeHttp([topic()]);
    let examList: ExamView[] = [...exams];
    const known = http.get.getMockImplementation() as (
      p: string,
      q?: unknown,
    ) => unknown;
    http.get.mockImplementation(async (path: string, q?: unknown) =>
      path === '/v1/exams' ? examList : known(path, q),
    );
    await renderWithProviders(
      <>
        <GrabClient />
        <TopicsScreen />
      </>,
      http,
    );
    await fireEvent.press(await screen.findByText('MS General Surgery'));
    await waitFor(() =>
      expect(topicsCalls(http).at(-1)).toMatchObject({ examId: ID(11) }),
    );
    examList = [];
    await act(async () => {
      await qc.invalidateQueries({ queryKey: ['exams'] });
    });
    await waitFor(() => expect(screen.queryByText('All exams')).toBeNull());
    await waitFor(() =>
      expect(topicsCalls(http).at(-1)).not.toHaveProperty('examId'),
    );
    expect(screen.getByText('Hernia')).toBeOnTheScreen();
  });

  it('adds a topic for the filtered exam', async () => {
    await renderWithProviders(<TopicsScreen />, makeHttp([topic()]));
    await fireEvent.press(await screen.findByText('MS General Surgery'));
    await fireEvent.press(screen.getByText('+ Add topic'));
    expect(mockNavigate).toHaveBeenCalledWith('TopicForm', { examId: ID(11) });
  });

  it('says so when pull-to-refresh fails, keeping the list', async () => {
    const http = makeHttp([topic()]);
    await renderWithProviders(<TopicsScreen />, http);
    await screen.findByText('Hernia');
    const known = http.get.getMockImplementation() as (
      p: string,
      q?: unknown,
    ) => unknown;
    http.get.mockImplementation(async (path: string, q?: unknown) => {
      if (path === '/v1/topics') throw new ApiError('SERVICE_UNAVAILABLE', 503);
      return known(path, q);
    });
    await act(async () => {
      await screen
        .getByTestId('topics-list')
        .props.refreshControl.props.onRefresh();
    });
    expect(await screen.findByText(/^Couldn't refresh/)).toBeOnTheScreen();
    expect(screen.getByTestId('snackbar-action')).toBeOnTheScreen();
    expect(screen.getByText('Hernia')).toBeOnTheScreen();
  });

  it('with TalkBack on, offers Add topic before the list', async () => {
    const sr = mockScreenReader(true);
    try {
      await renderWithProviders(<TopicsScreen />, makeHttp([topic()]));
      await screen.findByText('Hernia');
      const add = await screen.findByText('Add topic');
      await fireEvent.press(add);
      expect(mockNavigate).toHaveBeenCalledWith('TopicForm');
    } finally {
      sr.restore();
    }
  });

  it('without TalkBack, only the floating button adds', async () => {
    await renderWithProviders(<TopicsScreen />, makeHttp([topic()]));
    await screen.findByText('Hernia');
    await act(async () => {});
    expect(screen.queryByText('Add topic')).toBeNull();
    expect(screen.getByText('+ Add topic')).toBeOnTheScreen();
  });

  it('expanded: selecting a row shows detail and marks it selected', async () => {
    mockDims(1000, 700);
    await renderWithProviders(<TopicsScreen />, makeHttp([topic()]));
    expect(await screen.findByText('Select a topic')).toBeOnTheScreen();
    const row = await screen.findByRole('button', { name: /^Hernia,/ });
    expect(row.props.accessibilityState.selected).toBe(false);
    await fireEvent.press(screen.getByText('Hernia'));
    expect(await screen.findByText('Some notes')).toBeOnTheScreen();
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: /^Hernia,/ }).props.accessibilityState
        .selected,
    ).toBe(true);
  });

  it('compact rows carry no selected state', async () => {
    await renderWithProviders(<TopicsScreen />, makeHttp([topic()]));
    const row = await screen.findByRole('button', { name: /^Hernia,/ });
    expect(row.props.accessibilityState?.selected).toBeUndefined();
  });
});

describe('TopicDetailContent', () => {
  const renderDetail = async (
    http = makeHttp([topic()]),
    onDeleted = jest.fn(),
    extra: React.ReactNode = null,
  ) => {
    await renderWithProviders(
      <>
        {extra}
        <TopicDetailContent
          topicId={ID(100)}
          onEdit={jest.fn()}
          onDeleted={onDeleted}
        />
      </>,
      http,
    );
    return { http, onDeleted };
  };

  it('lists revisions, confirms delete in the app dialog, then deletes', async () => {
    const http = makeHttp([topic()]);
    http.del.mockResolvedValue(undefined);
    const { onDeleted } = await renderDetail(http);
    expect(await screen.findByText('Some notes')).toBeOnTheScreen();
    expect(screen.getByText(/^Revision 1 of 2 · Done/)).toBeOnTheScreen();
    expect(screen.getByText(/^Revision 2 of 2 · /)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Delete Hernia' }));
    expect(await screen.findByText('Delete topic?')).toBeOnTheScreen();
    expect(
      screen.getByText('This removes its revision history.'),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(http.del).toHaveBeenCalledWith(`/v1/topics/${ID(100)}`);
    expect(await screen.findByText('Hernia deleted')).toBeOnTheScreen();
  });

  it('inline Delete is red text, not a filled button', async () => {
    await renderDetail();
    const del = await screen.findByRole('button', { name: 'Delete Hernia' });
    expect(StyleSheet.flatten(del.props.style).backgroundColor).toBe(
      'transparent',
    );
  });

  it('Cancel closes the dialog without deleting', async () => {
    const { http } = await renderDetail();
    await fireEvent.press(
      await screen.findByRole('button', { name: 'Delete Hernia' }),
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByText('Delete topic?')).toBeNull());
    expect(http.del).not.toHaveBeenCalled();
  });

  it('a failed delete stays in the dialog with the reason', async () => {
    const http = makeHttp([topic()]);
    http.del.mockRejectedValue(new ApiError('NETWORK', 0));
    const { onDeleted } = await renderDetail(http);
    await fireEvent.press(
      await screen.findByRole('button', { name: 'Delete Hernia' }),
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Delete' }));
    expect(
      await screen.findByText("Can't reach the server — try again"),
    ).toBeOnTheScreen();
    expect(screen.getByText('Delete topic?')).toBeOnTheScreen();
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it('shows the topic from the list at once while it loads', async () => {
    const http = makeHttp([topic()]);
    const known = http.get.getMockImplementation() as (p: string) => unknown;
    http.get.mockImplementation((path: string) =>
      path.startsWith('/v1/topics/')
        ? new Promise(() => {})
        : known(path),
    );
    await renderDetail(
      http,
      jest.fn(),
      <Seed entries={[[['topics', { status: 'active' }], [topic()]]]} />,
    );
    expect(screen.getByText('Hernia')).toBeOnTheScreen();
    expect(screen.getByText('Some notes')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Loading')).toBeNull();
  });

  it('a deleted topic says so and offers Go back, not Retry', async () => {
    const http = makeHttp([]);
    const known = http.get.getMockImplementation() as (p: string) => unknown;
    http.get.mockImplementation(async (path: string) => {
      if (path.startsWith('/v1/topics/')) throw new ApiError('NOT_FOUND', 404);
      return known(path);
    });
    const { onDeleted } = await renderDetail(http);
    expect(
      await screen.findByText('This topic has been deleted'),
    ).toBeOnTheScreen();
    expect(screen.queryByText('Retry')).toBeNull();
    await fireEvent.press(screen.getByText('Go back'));
    expect(onDeleted).toHaveBeenCalled();
  });

  it('shows the full name as a heading when asked', async () => {
    const long = 'A'.repeat(200);
    await renderDetail(makeHttp([topic({ name: long })]));
    const heading = await screen.findByRole('header', { name: long });
    expect(heading.props.numberOfLines).toBeUndefined();
  });
});

describe('nameFitsHeader', () => {
  it('keeps short names in the header and long ones in the body', () => {
    expect(nameFitsHeader('Hernia', 1)).toBe(true);
    expect(nameFitsHeader('A'.repeat(40), 1)).toBe(true);
    expect(nameFitsHeader('A'.repeat(41), 1)).toBe(false);
    expect(nameFitsHeader('Hernia', 1.3)).toBe(false);
  });
});
