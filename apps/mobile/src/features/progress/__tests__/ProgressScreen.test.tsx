import React from 'react';
import { Alert, useWindowDimensions } from 'react-native';
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react-native';
import type { MockTestView } from '@planner/shared';
import { ApiError } from '../../../shared/api/errors';
import { ProgressScreen } from '../ProgressScreen';
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
const mockDims = (width: number, height = 800, fontScale = 1) =>
  (useWindowDimensions as jest.Mock).mockReturnValue({
    width,
    height,
    scale: 2,
    fontScale,
  });

afterEach(async () => {
  await cleanupClients();
  jest.restoreAllMocks();
  mockNavigate.mockClear();
});

const mockA: MockTestView = {
  id: ID(50),
  title: 'Mock A',
  takenOn: '2026-11-01',
  score: 80,
  maxScore: 100,
  percent: 80,
  examId: null,
  notes: '',
};

type SubjectRow = {
  subjectId: string;
  name: string;
  topicCount: number;
  revisionsDone?: number;
  revisionsPending?: number;
};

function setup({
  tests = [mockA],
  bySubject = [{ subjectId: ID(1), name: 'Anatomy', topicCount: 4 }],
}: { tests?: MockTestView[]; bySubject?: SubjectRow[] } = {}) {
  const http = makeHttp();
  const list = [...tests];
  const base = http.get.getMockImplementation() as (p: string) => unknown;
  http.get.mockImplementation(async (path: string) => {
    if (path === '/v1/stats') {
      return {
        topics: 7,
        activeTopics: 5,
        completedTopics: 2,
        revisionsDone: 11,
        revisionsPending: 9,
        overdue: 3,
        dueToday: 1,
        bySubject,
        byExam: [],
      };
    }
    if (path === '/v1/mock-tests') return [...list];
    return base(path);
  });
  // Like the server: a deleted test is gone from the next list.
  http.del.mockImplementation(async (path: string) => {
    const i = list.findIndex(t => path.endsWith(t.id));
    if (i >= 0) list.splice(i, 1);
  });
  return http;
}

const test = (n: number, over: Partial<MockTestView> = {}): MockTestView => ({
  ...mockA,
  id: ID(200 + n),
  title: `Mock ${n}`,
  ...over,
});

const tileWidth = () =>
  screen.getAllByTestId('stat-tile')[0].props.style.width as string;

const MOCK_A_LABEL = 'Mock A, 1 Nov, 80 out of 100, 80 percent';

describe('ProgressScreen', () => {
  it('shows stats, subjects and mock tests at 320 dp (2 per row)', async () => {
    mockDims(320, 640, 1.3);
    await renderWithProviders(<ProgressScreen />, setup());
    expect(await screen.findByText('Mock A')).toBeOnTheScreen();
    expect(screen.getByText('Revisions done')).toBeOnTheScreen();
    expect(screen.getByText('11')).toBeOnTheScreen();
    expect(screen.getByText('Anatomy')).toBeOnTheScreen();
    expect(screen.getByText(/80\/100/)).toBeOnTheScreen();
    expect(screen.getAllByTestId('stat-tile')).toHaveLength(6);
    expect(tileWidth()).toBe('50%');
  });

  it('titles the tab like the other tabs, with section headings', async () => {
    mockDims(360);
    await renderWithProviders(<ProgressScreen />, setup());
    await screen.findByText('Mock A');
    expect(screen.getByRole('header', { name: 'Progress' })).toBeOnTheScreen();
    expect(
      screen.getByRole('header', { name: 'Mock tests' }),
    ).toBeOnTheScreen();
  });

  it('keeps Add mock test on screen as a floating button', async () => {
    mockDims(360);
    await renderWithProviders(<ProgressScreen />, setup());
    await screen.findByText('Mock A');
    await fireEvent.press(
      screen.getByRole('button', { name: 'Add mock test' }),
    );
    expect(mockNavigate).toHaveBeenCalledWith('MockTestForm');
  });

  it('labels each tile with what it counts, using the same units as Home', async () => {
    mockDims(360);
    await renderWithProviders(<ProgressScreen />, setup());
    await screen.findByText('Mock A');
    const valueOf = (label: string) => {
      const tile = screen
        .getAllByTestId('stat-tile')
        .find(t => within(t).queryByText(label));
      return tile
        ? within(tile).getAllByText(/^[0-9]+$/)[0].props.children
        : null;
    };
    expect(valueOf('Topics due today')).toBe(1);
    expect(valueOf('Topics overdue')).toBe(3);
    expect(valueOf('Revisions done')).toBe(11);
    expect(valueOf('Revisions still to do')).toBe(9);
    expect(valueOf('Topics in total')).toBe(7);
    expect(valueOf('Topics completed')).toBe(2);
    expect(screen.queryByText('Pending')).toBeNull();
    expect(screen.queryByText('Overdue')).toBeNull();
  });

  it('due and overdue tiles open Home, the total opens Topics', async () => {
    mockDims(360);
    await renderWithProviders(<ProgressScreen />, setup());
    await screen.findByText('Mock A');
    await fireEvent.press(
      screen.getByRole('button', { name: 'Topics overdue: 3' }),
    );
    expect(mockNavigate).toHaveBeenLastCalledWith('MainTabs', {
      screen: 'Home',
    });
    await fireEvent.press(
      screen.getByRole('button', { name: 'Topics due today: 1' }),
    );
    expect(mockNavigate).toHaveBeenLastCalledWith('MainTabs', {
      screen: 'Home',
    });
    await fireEvent.press(
      screen.getByRole('button', { name: 'Topics in total: 7' }),
    );
    expect(mockNavigate).toHaveBeenLastCalledWith('MainTabs', {
      screen: 'Topics',
    });
    // Revision counts have nowhere to go.
    expect(
      screen.queryByRole('button', { name: /^Revisions done/ }),
    ).toBeNull();
  });

  describe('by subject', () => {
    it('shows topic counts as a labelled list, not as progress bars', async () => {
      mockDims(360);
      await renderWithProviders(
        <ProgressScreen />,
        setup({
          bySubject: [
            { subjectId: ID(1), name: 'Anatomy', topicCount: 40 },
            { subjectId: ID(2), name: 'Physiology', topicCount: 1 },
          ],
        }),
      );
      expect(
        await screen.findByRole('header', { name: 'Topics by subject' }),
      ).toBeOnTheScreen();
      expect(screen.getByText('40 topics')).toBeOnTheScreen();
      expect(screen.getByText('1 topic')).toBeOnTheScreen();
      expect(screen.queryByTestId('subject-bar')).toBeNull();
    });

    it('draws real revision progress when the server sends it', async () => {
      mockDims(360);
      await renderWithProviders(
        <ProgressScreen />,
        setup({
          bySubject: [
            {
              subjectId: ID(1),
              name: 'Anatomy',
              topicCount: 40,
              revisionsDone: 0,
              revisionsPending: 240,
            },
            {
              subjectId: ID(2),
              name: 'Physiology',
              topicCount: 10,
              revisionsDone: 60,
              revisionsPending: 0,
            },
          ],
        }),
      );
      expect(
        await screen.findByText('0 of 240 revisions done · 40 topics'),
      ).toBeOnTheScreen();
      expect(
        screen.getByText('60 of 60 revisions done · 10 topics'),
      ).toBeOnTheScreen();
      const bars = screen.getAllByTestId('subject-bar');
      expect(bars[0].props.style.width).toBe('0%');
      expect(bars[1].props.style.width).toBe('100%');
    });

    it('opens Topics filtered to a subject when its row is tapped', async () => {
      mockDims(360);
      await renderWithProviders(<ProgressScreen />, setup());
      await fireEvent.press(
        await screen.findByRole('button', { name: 'Anatomy, 4 topics' }),
      );
      expect(mockNavigate).toHaveBeenCalledWith('MainTabs', {
        screen: 'Topics',
        params: { subjectId: ID(1) },
      });
    });

    it('shows the first 8 subjects until Show all is pressed', async () => {
      mockDims(360);
      const bySubject = Array.from({ length: 10 }, (_, i) => ({
        subjectId: ID(300 + i),
        name: `Subject ${i}`,
        topicCount: 1,
      }));
      await renderWithProviders(<ProgressScreen />, setup({ bySubject }));
      await screen.findByText('Subject 0');
      expect(screen.getAllByTestId('subject-row')).toHaveLength(8);
      await fireEvent.press(
        screen.getByRole('button', { name: 'Show all 10 subjects' }),
      );
      expect(screen.getAllByTestId('subject-row')).toHaveLength(10);
    });
  });

  describe('mock test rows', () => {
    it('opens a mock test for editing when it is tapped', async () => {
      mockDims(360);
      await renderWithProviders(<ProgressScreen />, setup());
      await fireEvent.press(await screen.findByLabelText(MOCK_A_LABEL));
      expect(mockNavigate).toHaveBeenCalledWith('MockTestForm', {
        id: ID(50),
      });
    });

    it('reads the date and score to TalkBack', async () => {
      mockDims(360);
      await renderWithProviders(<ProgressScreen />, setup());
      const row = await screen.findByLabelText(MOCK_A_LABEL);
      expect(row.props.accessibilityLabel).toContain('1 Nov');
      expect(row.props.accessibilityLabel).toContain('80 out of 100');
      expect(row.props.accessibilityLabel).toContain('80 percent');
      expect(row.props.accessibilityHint).toBe(
        'Opens the mock test so you can correct it',
      );
    });

    it('shows which exam a test was for, and its notes', async () => {
      mockDims(360);
      await renderWithProviders(
        <ProgressScreen />,
        setup({
          tests: [
            { ...mockA, examId: ID(11), notes: 'Grand test 01 by Marrow' },
          ],
        }),
      );
      expect(
        await screen.findByText('MS General Surgery · 1 Nov · 80/100 · 80%'),
      ).toBeOnTheScreen();
      expect(screen.getByText('Grand test 01 by Marrow')).toBeOnTheScreen();
      expect(
        screen.getByLabelText(
          'Mock A, MS General Surgery, 1 Nov, 80 out of 100, 80 percent, Notes: Grand test 01 by Marrow',
        ),
      ).toBeOnTheScreen();
    });

    it('leaves out an exam that no longer exists', async () => {
      mockDims(360);
      await renderWithProviders(
        <ProgressScreen />,
        setup({ tests: [{ ...mockA, examId: ID(99) }] }),
      );
      expect(await screen.findByText('1 Nov · 80/100 · 80%')).toBeOnTheScreen();
    });

    it('opens with a summary: latest, change, best and average', async () => {
      mockDims(360);
      await renderWithProviders(
        <ProgressScreen />,
        setup({
          tests: [
            test(3, { percent: 75 }),
            test(2, { percent: 70 }),
            test(1, { percent: 80 }),
          ],
        }),
      );
      expect(
        await screen.findByText(
          'Latest 75% (up 5 points) · Best 80% · Average 75% over 3 tests',
        ),
      ).toBeOnTheScreen();
    });

    it('shows the latest 5 tests until Show all is pressed', async () => {
      mockDims(360);
      const tests = Array.from({ length: 12 }, (_, i) => test(i));
      await renderWithProviders(<ProgressScreen />, setup({ tests }));
      await screen.findByText('Mock 0');
      expect(screen.getAllByTestId('mock-test-row')).toHaveLength(5);
      await fireEvent.press(
        screen.getByRole('button', { name: 'Show all 12 mock tests' }),
      );
      expect(screen.getAllByTestId('mock-test-row')).toHaveLength(12);
      await fireEvent.press(
        screen.getByRole('button', { name: 'Show fewer mock tests' }),
      );
      expect(screen.getAllByTestId('mock-test-row')).toHaveLength(5);
    });
  });

  it('uses 4 tiles per row at 1000 dp', async () => {
    mockDims(1000, 700);
    await renderWithProviders(<ProgressScreen />, setup());
    await screen.findByText('Mock A');
    expect(tileWidth()).toBe('25%');
  });

  it('pull to refresh reloads stats and mock tests', async () => {
    mockDims(360);
    const http = setup();
    await renderWithProviders(<ProgressScreen />, http);
    await screen.findByText('Mock A');
    const count = (p: string) =>
      http.get.mock.calls.filter(c => c[0] === p).length;
    const stats0 = count('/v1/stats');
    const tests0 = count('/v1/mock-tests');
    const scroll = screen.getByTestId('progress-scroll');
    await act(async () => {
      await scroll.props.refreshControl.props.onRefresh();
    });
    expect(count('/v1/stats')).toBe(stats0 + 1);
    expect(count('/v1/mock-tests')).toBe(tests0 + 1);
  });

  describe('deleting', () => {
    const confirmDeleteOf = async (title: string) => {
      await fireEvent.press(await screen.findByLabelText(`Delete ${title}`));
      expect(await screen.findByText('Delete mock test?')).toBeOnTheScreen();
      await fireEvent.press(screen.getByRole('button', { name: 'Delete' }));
    };

    it('asks in the app dialog (not a system alert) and says when it is done', async () => {
      mockDims(360);
      const alert = jest.spyOn(Alert, 'alert');
      const http = setup();
      await renderWithProviders(<ProgressScreen />, http);
      await fireEvent.press(await screen.findByLabelText('Delete Mock A'));
      expect(
        await screen.findByText(
          "Mock A from 1 Nov will be deleted. This can't be undone.",
        ),
      ).toBeOnTheScreen();
      await fireEvent.press(screen.getByRole('button', { name: 'Delete' }));
      await waitFor(() =>
        expect(http.del).toHaveBeenCalledWith(`/v1/mock-tests/${ID(50)}`),
      );
      expect(await screen.findByText('Mock test deleted')).toBeOnTheScreen();
      expect(alert).not.toHaveBeenCalled();
      await waitFor(() => expect(screen.queryByText('Mock A')).toBeNull());
    });

    it('Cancel and Back close the dialog without deleting', async () => {
      mockDims(360);
      const http = setup();
      await renderWithProviders(<ProgressScreen />, http);
      await fireEvent.press(await screen.findByLabelText('Delete Mock A'));
      await fireEvent.press(
        await screen.findByRole('button', { name: 'Cancel' }),
      );
      await waitFor(() =>
        expect(screen.queryByText('Delete mock test?')).toBeNull(),
      );
      await fireEvent(screen.getByLabelText(MOCK_A_LABEL), 'longPress');
      expect(await screen.findByText('Delete mock test?')).toBeOnTheScreen();
      await fireEvent(screen.getByTestId('dialog-modal'), 'requestClose');
      await waitFor(() =>
        expect(screen.queryByText('Delete mock test?')).toBeNull(),
      );
      expect(http.del).not.toHaveBeenCalled();
    });

    it('disables Delete and shows a spinner while deleting', async () => {
      mockDims(360);
      const http = setup();
      let release!: () => void;
      http.del.mockImplementation(
        () => new Promise<void>(resolve => (release = resolve)),
      );
      await renderWithProviders(<ProgressScreen />, http);
      await confirmDeleteOf('Mock A');
      await waitFor(() =>
        expect(
          screen.getByLabelText('Delete Mock A').props.accessibilityState
            .disabled,
        ).toBe(true),
      );
      expect(screen.getByTestId('button-spinner')).toBeOnTheScreen();
      await act(async () => release());
    });

    it('keeps every test that is being deleted disabled', async () => {
      mockDims(360);
      const http = setup({ tests: [mockA, test(1, { title: 'Mock B' })] });
      const releases: (() => void)[] = [];
      http.del.mockImplementation(
        () => new Promise<void>(resolve => releases.push(resolve)),
      );
      await renderWithProviders(<ProgressScreen />, http);
      await confirmDeleteOf('Mock A');
      await confirmDeleteOf('Mock B');
      await waitFor(() => expect(http.del).toHaveBeenCalledTimes(2));
      for (const title of ['Mock A', 'Mock B']) {
        expect(
          screen.getByLabelText(`Delete ${title}`).props.accessibilityState
            .disabled,
        ).toBe(true);
      }
      expect(screen.getAllByTestId('button-spinner')).toHaveLength(2);
      await act(async () => releases.forEach(r => r()));
    });

    it('shows an error when deleting offline, but not for an already-deleted test', async () => {
      mockDims(360);
      const http = setup();
      http.del.mockRejectedValueOnce(new ApiError('NOT_FOUND', 404));
      await renderWithProviders(<ProgressScreen />, http);
      await confirmDeleteOf('Mock A');
      await waitFor(() => expect(http.del).toHaveBeenCalledTimes(1));
      await waitFor(() =>
        expect(screen.queryByTestId('button-spinner')).toBeNull(),
      );
      expect(
        screen.queryByText("Can't reach the server — try again"),
      ).toBeNull();

      http.del.mockRejectedValueOnce(new ApiError('NETWORK', 0));
      await confirmDeleteOf('Mock A');
      // The same plain message every other screen uses for a lost connection.
      expect(
        await screen.findByText("Can't reach the server — try again"),
      ).toBeOnTheScreen();
    });

    it('stays quiet when the session ended while deleting', async () => {
      mockDims(360);
      const http = setup();
      http.del.mockRejectedValueOnce(
        new ApiError('UNAUTHENTICATED', 401, undefined, {
          sessionEnded: true,
        }),
      );
      await renderWithProviders(<ProgressScreen />, http);
      await confirmDeleteOf('Mock A');
      await waitFor(() => expect(http.del).toHaveBeenCalledTimes(1));
      await waitFor(() =>
        expect(screen.queryByTestId('button-spinner')).toBeNull(),
      );
      expect(
        screen.queryByText('Your session ended — sign in again'),
      ).toBeNull();
    });
  });
});
