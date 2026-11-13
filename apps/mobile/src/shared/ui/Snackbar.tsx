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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from './ThemeProvider';

export type SnackbarOptions = {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number;
};

type Ctx = { show: (o: SnackbarOptions) => void };
const SnackbarContext = createContext<Ctx>({ show: () => {} });

export function useSnackbar(): Ctx {
  return useContext(SnackbarContext);
}

export function SnackbarProvider({ children }: { children: ReactNode }) {
  const { colors, radius, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const [current, setCurrent] = useState<SnackbarOptions | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const hide = useCallback(() => {
    clear();
    setCurrent(null);
  }, []);
  const show = useCallback((o: SnackbarOptions) => {
    clear();
    setCurrent(o);
    timer.current = setTimeout(() => {
      timer.current = null;
      setCurrent(null);
    }, o.durationMs ?? 5000);
  }, []);
  useEffect(() => clear, []);

  const value = useMemo(() => ({ show }), [show]);
  return (
    <SnackbarContext.Provider value={value}>
      {children}
      {current ? (
        <View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            left: spacing.lg,
            right: spacing.lg,
            bottom: insets.bottom + spacing.lg,
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
