import React from 'react';
import { AccessibilityInfo, StyleSheet } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SnackbarProvider, useSnackbar } from '../Snackbar';
import { darkColors, lightColors } from '../theme';
import { ThemeProvider } from '../ThemeProvider';
import { mockKeyboard, mockScreenReader } from '../../../test/testUtils';

let api: ReturnType<typeof useSnackbar>;
function Grab() {
  api = useSnackbar();
  return null;
}
const setup = async (mode: 'light' | 'dark' = 'light', bottomInset = 0) =>
  render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 360, height: 640 },
        insets: { top: 0, left: 0, right: 0, bottom: bottomInset },
      }}
    >
      <ThemeProvider mode={mode}>
        <SnackbarProvider>
          <Grab />
        </SnackbarProvider>
      </ThemeProvider>
    </SafeAreaProvider>,
  );

const advance = (ms: number) =>
  act(async () => {
    jest.advanceTimersByTime(ms);
  });

const recommended = jest.mocked(AccessibilityInfo.getRecommendedTimeoutMillis);
let screenReader: { restore: () => void } | null = null;
const screenReaderOn = () => {
  screenReader = mockScreenReader(true);
};

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  jest.useRealTimers();
  screenReader?.restore();
  screenReader = null;
  // The preset default: no recommendation (false), so the plain duration.
  recommended.mockReset();
  recommended.mockImplementation(() => Promise.resolve(false as never));
  jest.restoreAllMocks();
});

describe('with TalkBack on', () => {
  it('an action snackbar stays until it is dismissed', async () => {
    screenReaderOn();
    await setup();
    await act(async () => {
      api.show({ message: 'Revision 1 done', actionLabel: 'Undo' });
    });
    await advance(20_000);
    expect(screen.getByText('Revision 1 done')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText('Revision 1 done')).toBeNull();
  });

  it('moves focus to the action when it appears', async () => {
    screenReaderOn();
    const focus = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent');
    await setup();
    await act(async () => {
      api.show({ message: 'Revision 1 done', actionLabel: 'Undo' });
    });
    await advance(400);
    expect(focus).toHaveBeenCalledWith(expect.anything(), 'focus');
  });

  it('still moves focus when the text updates right after it appears', async () => {
    screenReaderOn();
    const focus = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent');
    await setup();
    let id = 0;
    await act(async () => {
      id = api.show({ message: 'Revision 1 done', actionLabel: 'Undo' });
    });
    await advance(100);
    await act(async () => {
      api.update(id, {
        message: 'Revision 1 done · next on 5 Dec',
        actionLabel: 'Undo',
      });
    });
    await advance(300);
    expect(focus).toHaveBeenCalledWith(expect.anything(), 'focus');
  });

  it('a snackbar without an action still hides on its timer', async () => {
    screenReaderOn();
    await setup();
    await act(async () => {
      api.show({ message: 'Saved' });
    });
    expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull();
    await advance(5001);
    expect(screen.queryByText('Saved')).toBeNull();
  });
});

describe('with TalkBack off', () => {
  it('shows no Dismiss button and hides after the default 5 s', async () => {
    await setup();
    await act(async () => {
      api.show({ message: 'Revision 1 done', actionLabel: 'Undo' });
    });
    expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull();
    await advance(5001);
    expect(screen.queryByText('Revision 1 done')).toBeNull();
  });

  it("follows Android's longer 'Time to take action' setting", async () => {
    recommended.mockResolvedValue(30_000);
    await setup();
    await act(async () => {
      api.show({ message: 'Revision 1 done', actionLabel: 'Undo' });
    });
    await advance(29_000);
    expect(screen.getByText('Revision 1 done')).toBeOnTheScreen();
    await advance(1001);
    expect(screen.queryByText('Revision 1 done')).toBeNull();
  });

  it('a late recommended timeout never hides a newer snackbar', async () => {
    let resolveFirst: (ms: number) => void = () => {};
    recommended
      .mockImplementationOnce(
        () => new Promise<number>(r => (resolveFirst = r)),
      )
      .mockResolvedValue(5000);
    await setup();
    await act(async () => {
      api.show({ message: 'One', actionLabel: 'Undo' });
    });
    await act(async () => {
      api.show({ message: 'Two', durationMs: 20_000 });
    });
    await act(async () => resolveFirst(1000));
    await advance(5000);
    expect(screen.getByText('Two')).toBeOnTheScreen();
  });
});

describe('a passive message never drops a pending Undo', () => {
  it('waits until the Undo snackbar is gone, and update still works', async () => {
    await setup();
    let id = 0;
    await act(async () => {
      id = api.show({ message: 'Revision 2 done', actionLabel: 'Undo' });
    });
    await act(async () => {
      api.show({ message: 'Focus session done', passive: true });
    });
    expect(screen.getByText('Undo')).toBeOnTheScreen();
    expect(screen.queryByText('Focus session done')).toBeNull();
    let ok = false;
    await act(async () => {
      ok = api.update(id, {
        message: 'Revision 2 done · next on 23 Nov',
        actionLabel: 'Undo',
      });
    });
    expect(ok).toBe(true);
    expect(
      screen.getByText('Revision 2 done · next on 23 Nov'),
    ).toBeOnTheScreen();
    await advance(5001);
    expect(screen.getByText('Focus session done')).toBeOnTheScreen();
    await advance(5001);
    expect(screen.queryByTestId('snackbar')).toBeNull();
  });

  it('shows the waiting message right after the action is used', async () => {
    await setup();
    const onAction = jest.fn();
    await act(async () => {
      api.show({ message: 'Revision 2 done', actionLabel: 'Undo', onAction });
    });
    await act(async () => {
      api.show({ message: 'Focus session done', passive: true });
    });
    await fireEvent.press(screen.getByText('Undo'));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Focus session done')).toBeOnTheScreen();
  });

  it('keeps the waiting message when the action shows a new snackbar', async () => {
    await setup();
    await act(async () => {
      api.show({
        message: "Couldn't save. Check your connection.",
        actionLabel: 'Retry',
        onAction: () => {
          api.show({ message: 'Revision 2 done', actionLabel: 'Undo' });
        },
      });
    });
    await act(async () => {
      api.show({ message: 'Focus session done', passive: true });
    });
    await fireEvent.press(screen.getByText('Retry'));
    expect(screen.getByText('Revision 2 done')).toBeOnTheScreen();
    expect(screen.queryByText('Focus session done')).toBeNull();
    await advance(5001);
    expect(screen.getByText('Focus session done')).toBeOnTheScreen();
    await advance(5001);
    expect(screen.queryByTestId('snackbar')).toBeNull();
  });

  it('an action cannot bring its own used snackbar back with update', async () => {
    await setup();
    let id = 0;
    let ok = true;
    await act(async () => {
      id = api.show({
        message: 'Revision 2 done',
        actionLabel: 'Undo',
        onAction: () => {
          ok = api.update(id, { message: 'Undoing', actionLabel: 'Undo' });
        },
      });
    });
    await fireEvent.press(screen.getByText('Undo'));
    expect(ok).toBe(false);
    expect(screen.queryByTestId('snackbar')).toBeNull();
  });

  it('a passive message shows straight away when nothing has an action', async () => {
    await setup();
    await act(async () => {
      api.show({ message: 'Saved' });
    });
    await act(async () => {
      api.show({ message: 'Focus session done', passive: true });
    });
    expect(screen.getByText('Focus session done')).toBeOnTheScreen();
  });
});

it('update changes the text in place without hiding it first', async () => {
  await setup();
  let id = 0;
  await act(async () => {
    id = api.show({ message: 'Revision 1 done', actionLabel: 'Undo' });
  });
  const bar = screen.getByTestId('snackbar');
  await act(async () => {
    api.update(id, { message: 'Revision 1 done · next on 5 Dec' });
  });
  expect(screen.getByTestId('snackbar')).toBe(bar);
  expect(screen.getByText('Revision 1 done · next on 5 Dec')).toBeOnTheScreen();
});

describe('keyboard', () => {
  const bottom = () =>
    StyleSheet.flatten(screen.getByTestId('snackbar').props.style).bottom;

  it('sits just above the open keyboard, then drops back', async () => {
    const kb = mockKeyboard();
    await setup('light', 24);
    await act(async () => {
      api.show({ message: 'Saved' });
    });
    expect(bottom()).toBe(24 + 16);
    await act(async () => kb.show(300));
    expect(bottom()).toBe(300 + 24 + 8);
    await act(async () => kb.hide());
    expect(bottom()).toBe(24 + 16);
  });
});

it.each([
  ['light', lightColors],
  ['dark', darkColors],
] as const)(
  'the action uses the inverse accent, unlike the message, in %s mode',
  async (mode, colors) => {
    await setup(mode);
    await act(async () => {
      api.show({ message: 'Revision 1 done', actionLabel: 'Undo' });
    });
    const action = StyleSheet.flatten(
      screen.getByTestId('snackbar-action').props.style,
    );
    const message = StyleSheet.flatten(
      screen.getByText('Revision 1 done').props.style,
    );
    expect(action.color).toBe(colors.inverseAccent);
    expect(action.color).not.toBe(message.color);
  },
);
