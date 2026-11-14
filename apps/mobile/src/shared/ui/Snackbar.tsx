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
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from './ThemeProvider';

export type SnackbarOptions = {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number;
};

type Ctx = {
  /** Shows a snackbar (replacing any other) and returns its id. */
  show: (o: SnackbarOptions) => number;
  /**
   * Replaces snackbar `id` with `o` and restarts its timer, as long as no
   * other snackbar was shown since (it shows again if it already timed out).
   * Returns false, and does nothing, when another snackbar took its place.
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

export function SnackbarProvider({ children }: { children: ReactNode }) {
  const { colors, radius, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const [current, setCurrent] = useState<SnackbarOptions | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastId = useRef(0);
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
  // clear of the phone's gesture area.
  const bottom = lifted > 0 ? lifted + spacing.sm : insets.bottom + spacing.lg;

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const hide = useCallback(() => {
    clear();
    setCurrent(null);
  }, []);
  const display = useCallback((o: SnackbarOptions) => {
    clear();
    setCurrent(o);
    timer.current = setTimeout(() => {
      timer.current = null;
      setCurrent(null);
    }, o.durationMs ?? 5000);
  }, []);
  const show = useCallback(
    (o: SnackbarOptions) => {
      lastId.current += 1;
      display(o);
      return lastId.current;
    },
    [display],
  );
  const update = useCallback(
    (id: number, o: SnackbarOptions) => {
      if (id !== lastId.current) return false;
      display(o);
      return true;
    },
    [display],
  );
  useEffect(() => clear, []);

  const value = useMemo(() => ({ show, update }), [show, update]);
  return (
    <SnackbarContext.Provider value={value}>
      <SnackbarInsetContext.Provider value={setInset}>
        {children}
      </SnackbarInsetContext.Provider>
      {current ? (
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
              {current.message}
            </Text>
            {current.actionLabel ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  const cb = current.onAction;
                  hide();
                  cb?.();
                }}
                style={{
                  minHeight: 48,
                  minWidth: 48,
                  paddingHorizontal: spacing.lg,
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: colors.softAccent, fontWeight: '700' }}>
                  {current.actionLabel}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}
    </SnackbarContext.Provider>
  );
}
