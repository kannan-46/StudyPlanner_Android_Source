import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  AccessibilityInfo,
  Keyboard,
  Pressable,
  Text,
  View,
  type HostInstance,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from './ThemeProvider';

export type SnackbarOptions = {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  /**
   * How long it stays (default 5 s). Android's "Time to take action"
   * accessibility setting can make it longer. With TalkBack on, a snackbar
   * with an action stays until it is used, dismissed or replaced.
   * Never pass Infinity (setTimeout treats it as 0).
   */
  durationMs?: number;
  /**
   * Information only (e.g. "Focus session done"): when a snackbar with an
   * action (Undo, Retry) is showing, this one waits until that one is gone
   * instead of replacing it. Its id still works with update().
   */
  passive?: boolean;
};

type Ctx = {
  /**
   * Shows a snackbar and returns its id. It replaces the one on screen,
   * except that a `passive` one waits behind a snackbar that has an action.
   */
  show: (o: SnackbarOptions) => number;
  /**
   * Changes snackbar `id` in place to `o` and restarts its timer, as long as
   * it is still on screen (or still waiting, for a passive one). Returns
   * false, and does nothing, once it timed out, was dismissed or another
   * snackbar took its place.
   */
  update: (id: number, o: SnackbarOptions) => boolean;
};
const SnackbarContext = createContext<Ctx>({
  show: () => 0,
  update: () => false,
});

export function useSnackbar(): Ctx {
  return useContext(SnackbarContext);
}

type InsetCtx = (key: string, px: number | null) => void;
const SnackbarInsetContext = createContext<InsetCtx>(() => {});

/**
 * While the calling screen is focused, lifts the snackbar by `px` so it sits
 * above the tab bar or a floating button instead of covering them. Lifts from
 * different keys add up (tab bar + button); leaving the screen drops its lift.
 */
export function useSnackbarInsetWhileFocused(key: string, px: number) {
  const setInset = useContext(SnackbarInsetContext);
  useFocusEffect(
    useCallback(() => {
      setInset(key, px > 0 ? px : null);
      return () => setInset(key, null);
    }, [setInset, key, px]),
  );
}

type Entry = { id: number; o: SnackbarOptions };

const DEFAULT_MS = 5000;
/** Lets the action mount and the live region speak before moving focus. */
const FOCUS_DELAY_MS = 300;

export function SnackbarProvider({ children }: { children: ReactNode }) {
  const { colors, radius, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const [current, setCurrent] = useState<Entry | null>(null);
  const currentRef = useRef<Entry | null>(null);
  const queue = useRef<Entry[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextId = useRef(0);
  // Bumped on every display, so a late async timeout can't touch a newer one.
  const seq = useRef(0);
  const actionRef = useRef<HostInstance | null>(null);

  // Screen reader state: a ref for the timers, state for the Dismiss button.
  const srRef = useRef(false);
  const [screenReader, setScreenReader] = useState(false);
  useEffect(() => {
    let alive = true;
    const set = (on: boolean) => {
      srRef.current = on;
      if (alive) setScreenReader(on);
    };
    Promise.resolve()
      .then(() => AccessibilityInfo.isScreenReaderEnabled())
      .then(on => set(!!on))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', on =>
      set(!!on),
    );
    return () => {
      alive = false;
      sub?.remove();
    };
  }, []);

  // The window is edge-to-edge, so the keyboard covers the bottom of the
  // screen without resizing it; sit above the keyboard while it is open.
  const [keyboard, setKeyboard] = useState(0);
  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', e =>
      setKeyboard(e?.endCoordinates?.height ?? 0),
    );
    const hidden = Keyboard.addListener('keyboardDidHide', () =>
      setKeyboard(0),
    );
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);

  const [lifts, setLifts] = useState<Record<string, number>>({});
  const setInset = useCallback<InsetCtx>((key, px) => {
    setLifts(prev => {
      if (px === null) {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return prev[key] === px ? prev : { ...prev, [key]: px };
    });
  }, []);
  const lifted = Object.values(lifts).reduce((a, b) => a + b, 0);
  // Above the tab bar / floating button when a screen reports them, else just
  // clear of the phone's gesture area. The keyboard height Android reports
  // leaves out the navigation bar, so add the bottom inset back.
  const base = lifted > 0 ? lifted + spacing.sm : insets.bottom + spacing.lg;
  const bottom =
    keyboard > 0 ? Math.max(base, keyboard + insets.bottom + spacing.sm) : base;

  const clearTimers = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (focusTimer.current) clearTimeout(focusTimer.current);
    focusTimer.current = null;
  };

  const setShown = (e: Entry | null) => {
    currentRef.current = e;
    setCurrent(e);
  };

  // Shows the next waiting snackbar, or nothing.
  const advanceRef = useRef<() => void>(() => {});

  const display = useCallback((e: Entry, fresh: boolean) => {
    if (fresh) {
      clearTimers();
    } else {
      // An update keeps a pending focus move for the same snackbar.
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    }
    const token = ++seq.current;
    setShown(e);
    const hasAction = !!e.o.actionLabel;
    if (srRef.current && hasAction) {
      // TalkBack users need time to swipe to the action: no auto-hide. Move
      // focus to it when it first appears (the row they acted on may be gone).
      if (fresh) {
        focusTimer.current = setTimeout(() => {
          focusTimer.current = null;
          if (currentRef.current?.id !== e.id || !actionRef.current) return;
          try {
            AccessibilityInfo.sendAccessibilityEvent(
              actionRef.current,
              'focus',
            );
          } catch {
            // Focus is a nicety; never break the snackbar over it.
          }
        }, FOCUS_DELAY_MS);
      }
      return;
    }
    const ms = e.o.durationMs ?? DEFAULT_MS;
    const start = Date.now();
    const expire = () => {
      timer.current = null;
      if (seq.current === token) advanceRef.current();
    };
    timer.current = setTimeout(expire, ms);
    // Respect Android's "Time to take action" setting when it is longer.
    const rec = AccessibilityInfo.getRecommendedTimeoutMillis;
    if (typeof rec !== 'function') return;
    Promise.resolve()
      .then(() => rec(ms))
      .then(longer => {
        if (seq.current !== token || !timer.current) return;
        if (typeof longer !== 'number' || !(longer > ms)) return;
        clearTimeout(timer.current);
        timer.current = setTimeout(
          expire,
          Math.max(0, longer - (Date.now() - start)),
        );
      })
      .catch(() => {});
  }, []);

  const advance = useCallback(() => {
    const next = queue.current.shift();
    if (next) {
      display(next, true);
    } else {
      clearTimers();
      seq.current += 1;
      setShown(null);
    }
  }, [display]);
  advanceRef.current = advance;

  const hide = advance;

  // Runs a snackbar's action. The used snackbar goes first (so update() on it
  // returns false), then the action runs; only if the action showed nothing
  // does the next waiting snackbar appear. Otherwise a waiting passive one
  // would be replaced straight away by what the action shows (e.g. Retry
  // showing "Revision 2 done" again) and be lost; it now waits behind it.
  const runAction = (cb?: () => void) => {
    clearTimers();
    seq.current += 1;
    setShown(null);
    try {
      cb?.();
    } finally {
      if (currentRef.current === null) advance();
    }
  };

  const show = useCallback(
    (o: SnackbarOptions) => {
      nextId.current += 1;
      const e = { id: nextId.current, o };
      if (o.passive && currentRef.current?.o.actionLabel) {
        queue.current.push(e);
      } else {
        display(e, true);
      }
      return e.id;
    },
    [display],
  );

  const update = useCallback(
    (id: number, o: SnackbarOptions) => {
      if (currentRef.current?.id === id) {
        display({ id, o }, false);
        return true;
      }
      const waiting = queue.current.find(q => q.id === id);
      if (waiting) {
        waiting.o = o;
        return true;
      }
      return false;
    },
    [display],
  );
  useEffect(() => clearTimers, []);

  const value = useMemo(() => ({ show, update }), [show, update]);
  const o = current?.o;
  return (
    <SnackbarContext.Provider value={value}>
      <SnackbarInsetContext.Provider value={setInset}>
        {children}
      </SnackbarInsetContext.Provider>
      {o ? (
        <View
          pointerEvents="box-none"
          testID="snackbar"
          style={{
            position: 'absolute',
            left: spacing.lg,
            right: spacing.lg,
            bottom,
            alignItems: 'center',
          }}
        >
          <View
            accessibilityLiveRegion="polite"
            style={{
              width: '100%',
              maxWidth: 720,
              minHeight: 48,
              flexDirection: 'row',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: colors.text,
              borderRadius: radius.md,
              paddingLeft: spacing.lg,
              paddingVertical: spacing.xs,
            }}
          >
            <Text
              style={{
                color: colors.background,
                flexShrink: 1,
                paddingVertical: spacing.sm,
              }}
            >
              {o.message}
            </Text>
            {o.actionLabel ? (
              <View style={{ flexDirection: 'row' }}>
                <Pressable
                  ref={actionRef}
                  accessibilityRole="button"
                  onPress={() => runAction(o.onAction)}
                  style={{
                    minHeight: 48,
                    minWidth: 48,
                    paddingHorizontal: spacing.lg,
                    justifyContent: 'center',
                  }}
                >
                  <Text
                    testID="snackbar-action"
                    style={{ color: colors.inverseAccent, fontWeight: '700' }}
                  >
                    {o.actionLabel}
                  </Text>
                </Pressable>
                {screenReader ? (
                  // It no longer hides by itself, so offer a way to close it.
                  <Pressable
                    accessibilityRole="button"
                    onPress={hide}
                    style={{
                      minHeight: 48,
                      minWidth: 48,
                      paddingHorizontal: spacing.md,
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ color: colors.background }}>Dismiss</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>
      ) : null}
    </SnackbarContext.Provider>
  );
}
