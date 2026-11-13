import React, {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';
import { useColorScheme } from 'react-native';
import { darkColors, lightColors, radius, spacing, type Colors } from './theme';

export type ThemeMode = 'system' | 'light' | 'dark';

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
