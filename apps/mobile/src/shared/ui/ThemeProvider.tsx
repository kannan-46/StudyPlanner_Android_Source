import React, {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';
import { useColorScheme } from 'react-native';
import type { ThemeMode } from '../lib/localPrefs';
import { darkColors, lightColors, radius, spacing, type Colors } from './theme';

export type { ThemeMode };

export type ThemeValue = {
  colors: Colors;
  spacing: typeof spacing;
  radius: typeof radius;
  isDark: boolean;
};

const build = (isDark: boolean): ThemeValue => ({
  colors: isDark ? darkColors : lightColors,
  spacing,
  radius,
  isDark,
});

const ThemeContext = createContext<ThemeValue>(build(false));

export function ThemeProvider({
  mode = 'system',
  children,
}: {
  mode?: ThemeMode;
  children: ReactNode;
}) {
  const scheme = useColorScheme();
  const isDark = mode === 'system' ? scheme === 'dark' : mode === 'dark';
  const value = useMemo(() => build(isDark), [isDark]);
  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeValue {
  return useContext(ThemeContext);
}

export type ThemeModeValue = {
  mode: ThemeMode;
  /** Applies the theme straight away; saving happens in the background. */
  setMode(mode: ThemeMode): void;
};

export const ThemeModeContext = createContext<ThemeModeValue | null>(null);

export function useThemeMode(): ThemeModeValue {
  const ctx = useContext(ThemeModeContext);
  if (!ctx)
    throw new Error('useThemeMode must be used inside AppThemeProvider');
  return ctx;
}
