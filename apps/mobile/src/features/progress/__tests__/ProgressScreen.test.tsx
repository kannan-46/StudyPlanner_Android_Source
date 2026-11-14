import React from 'react';
import { Alert, useWindowDimensions } from 'react-native';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
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

function setup() {
  const http = makeHttp();
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
        bySubject: [{ subjectId: ID(1), name: 'Anatomy', topicCount: 4 }],
        byExam: [],
      };
    }
    if (path === '/v1/mock-tests') {
      return [
        {
          id: ID(50),
          title: 'Mock A',
          takenOn: '2026-11-01',
          score: 80,
          maxScore: 100,
          percent: 80,
          examId: null,
          notes: '',
        },
      ];
    }
    return [];
  });
  http.del.mockResolvedValue(undefined);
  return http;
}

const tileWidth = () =>
  screen.getAllByTestId('stat-tile')[0].props.style.width as string;

describe('ProgressScreen', () => {
  it('shows stats, subject bars and mock tests at 320 dp (2 per row)', async () => {
    mockDims(320, 640, 1.3);
    await renderWithProviders(<ProgressScreen />, setup());
    expect(await screen.findByText('Mock A')).toBeOnTheScreen();
    expect(screen.getByText('Revisions done')).toBeOnTheScreen();
    expect(screen.getByText('11')).toBeOnTheScreen();
    expect(screen.getByText('Anatomy')).toBeOnTheScreen();
    expect(screen.getByText(/80\/100/)).toBeOnTheScreen();
    expect(screen.getAllByTestId('stat-tile')).toHaveLength(5);
    expect(tileWidth()).toBe('50%');
    await fireEvent.press(screen.getByText('Add mock test'));
    expect(mockNavigate).toHaveBeenCalledWith('MockTestForm');
  });

  it('uses 4 tiles per row at 1000 dp', async () => {
    mockDims(1000, 700);
    await renderWithProviders(<ProgressScreen />, setup());
    await screen.findByText('Mock A');
    expect(tileWidth()).toBe('25%');
  });

  it('deletes through the visible action after confirmation', async () => {
    mockDims(360);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const http = setup();
    await renderWithProviders(<ProgressScreen />, http);
    await fireEvent.press(await screen.findByLabelText('Delete Mock A'));
    expect(alert).toHaveBeenCalled();
    const buttons = alert.mock.calls[0][2] as {
      text: string;
      onPress?: () => void;
    }[];
    buttons.find(b => b.text === 'Delete')?.onPress?.();
    await waitFor(() =>
      expect(http.del).toHaveBeenCalledWith(`/v1/mock-tests/${ID(50)}`),
    );
  });

  const confirmDeleteOf = async (alert: jest.SpyInstance) => {
    await fireEvent.press(await screen.findByLabelText('Delete Mock A'));
    const buttons = alert.mock.calls.at(-1)[2] as {
      text: string;
      onPress?: () => void;
    }[];
    await act(async () => {
      buttons.find(b => b.text === 'Delete')?.onPress?.();
    });
  };

  it('disables Delete and shows a spinner while deleting', async () => {
    mockDims(360);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const http = setup();
    let release!: () => void;
    http.del.mockImplementation(
      () => new Promise<void>(resolve => (release = resolve)),
    );
    await renderWithProviders(<ProgressScreen />, http);
    await confirmDeleteOf(alert);
    await waitFor(() =>
      expect(
        screen.getByLabelText('Delete Mock A').props.accessibilityState
          .disabled,
      ).toBe(true),
    );
    expect(screen.getByLabelText('Deleting')).toBeOnTheScreen();
    await act(async () => release());
  });

  it('shows an error at once when deleting offline, but not for an already-deleted test', async () => {
    mockDims(360);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const http = setup();
    http.del.mockRejectedValueOnce(new ApiError('NOT_FOUND', 404));
    await renderWithProviders(<ProgressScreen />, http);
    await confirmDeleteOf(alert);
    await waitFor(() => expect(http.del).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByLabelText('Deleting')).toBeNull());
    expect(screen.queryByText("Couldn't delete — try again")).toBeNull();

    http.del.mockRejectedValueOnce(new ApiError('NETWORK', 0));
    await confirmDeleteOf(alert);
    expect(
      await screen.findByText("Couldn't delete — try again"),
    ).toBeOnTheScreen();
  });
});
