import React from 'react';
import { Alert, useWindowDimensions } from 'react-native';
import { fireEvent, screen, waitFor, act } from '@testing-library/react-native';
import { TopicsScreen } from '../TopicsScreen';
import { TopicDetailContent } from '../TopicDetailScreen';
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

describe('TopicsScreen', () => {
  it('shows the empty state with an Add action', async () => {
    await renderWithProviders(<TopicsScreen />, makeHttp([]));
    expect(await screen.findByText('No topics yet')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Add topic'));
    expect(mockNavigate).toHaveBeenCalledWith('TopicForm');
  });

  it('lists rows and navigates to detail on compact', async () => {
    await renderWithProviders(<TopicsScreen />, makeHttp([topic()]));
    expect(await screen.findByText('Hernia')).toBeOnTheScreen();
    expect(screen.getByText('R2/2')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Hernia'));
    expect(mockNavigate).toHaveBeenCalledWith('TopicDetail', {
      topicId: ID(100),
    });
  });

  it('renders at 320 dp with fontScale 1.3', async () => {
    mockDims(320, 640, 1.3);
    await renderWithProviders(<TopicsScreen />, makeHttp([topic()]));
    expect(await screen.findByText('Hernia')).toBeOnTheScreen();
    expect(screen.getByText('+ Add topic')).toBeOnTheScreen();
  });

  it('labels the subject and exam filter rows', async () => {
    await renderWithProviders(<TopicsScreen />, makeHttp([topic()]));
    expect(await screen.findByText('All subjects')).toBeOnTheScreen();
    expect(await screen.findByText('All exams')).toBeOnTheScreen();
    expect(screen.getByText('Subject')).toBeOnTheScreen();
    expect(screen.getByText('Exam')).toBeOnTheScreen();
    expect(screen.queryByText('All')).toBeNull();
  });

  it('keeps the current list on screen while a new filter loads', async () => {
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

  it('expanded: selecting a row shows detail in the right pane', async () => {
    mockDims(1000, 700);
    await renderWithProviders(<TopicsScreen />, makeHttp([topic()]));
    expect(await screen.findByText('Select a topic')).toBeOnTheScreen();
    await fireEvent.press(await screen.findByText('Hernia'));
    expect(await screen.findByText('Some notes')).toBeOnTheScreen();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

describe('TopicDetailContent', () => {
  it('lists revisions with done and due dates and confirms delete', async () => {
    const http = makeHttp([topic()]);
    http.del.mockResolvedValue(undefined);
    const onDeleted = jest.fn();
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await renderWithProviders(
      <TopicDetailContent
        topicId={ID(100)}
        onEdit={jest.fn()}
        onDeleted={onDeleted}
      />,
      http,
    );
    expect(await screen.findByText('Some notes')).toBeOnTheScreen();
    expect(screen.getByText(/^Revision 1 of 2 · Done 5 Nov/)).toBeOnTheScreen();
    expect(screen.getByText(/^Revision 2 of 2 · /)).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Delete'));
    expect(alert.mock.calls[0][0]).toBe('Delete topic?');
    expect(alert.mock.calls[0][1]).toBe('This removes its revision history.');
    const buttons = alert.mock.calls[0][2] as {
      text: string;
      onPress?: () => void;
    }[];
    await act(async () => {
      buttons.find(b => b.text === 'Delete')?.onPress?.();
    });
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(http.del).toHaveBeenCalledWith(`/v1/topics/${ID(100)}`);
    alert.mockRestore();
  });
});
