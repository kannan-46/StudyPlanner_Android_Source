import React, {
  createContext,
  useContext,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
  type HostInstance,
  type ScrollViewInstance,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { HeaderHeightContext } from '@react-navigation/elements';
import { ResponsiveContainer } from './responsive';
import { ScrollToTopOnTabPress } from './ScrollToTopOnTabPress';
import { UnderHeaderContext } from './StackHeader';
import { useTheme } from './ThemeProvider';

export type ScreenScroll = {
  /** Scrolls the screen so `view` sits near the top (e.g. a field with an error). */
  scrollToView: (view: HostInstance | null) => void;
};
/** Set by a scrolling Screen; null elsewhere. */
export const ScreenScrollContext = createContext<ScreenScroll | null>(null);

export function Screen({
  children,
  scroll,
  fullWidth,
  scrollToTopOnTabPress,
}: {
  children: ReactNode;
  scroll?: boolean;
  /** Skip the centred max-width column (lists and master-detail). */
  fullWidth?: boolean;
  /**
   * With `scroll`, on a tab screen: tapping the tab you are already on
   * scrolls back to the top.
   */
  scrollToTopOnTabPress?: boolean;
}) {
  const { colors, spacing } = useTheme();
  // Under a stack header the header already clears the status bar.
  const underHeader = useContext(UnderHeaderContext);
  // The keyboard avoider measures itself from its parent, so under a header it
  // would think it starts at the top of the display and leave the last field
  // and the Save button behind the keyboard. Tell it how far down it sits.
  const headerHeight = useContext(HeaderHeightContext) ?? 0;
  const scrollRef = useRef<ScrollViewInstance>(null);
  const scrollApi = useMemo<ScreenScroll>(
    () => ({
      scrollToView: view => {
        const sv = scrollRef.current;
        const inner = sv?.getInnerViewRef();
        if (!view || !sv || !inner) return;
        view.measureLayout(
          inner,
          (_x, y) => sv.scrollTo({ y: Math.max(0, y - spacing.lg) }),
          () => {},
        );
      },
    }),
    [spacing.lg],
  );
  const body = scroll ? (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={underHeader ? headerHeight : 0}
    >
      {scrollToTopOnTabPress ? (
        <ScrollToTopOnTabPress scrollRef={scrollRef} />
      ) : null}
      <ScrollView
        ref={scrollRef}
        testID="screen-scroll"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ flexGrow: 1, padding: spacing.lg }}
      >
        <ScreenScrollContext.Provider value={scrollApi}>
          <ResponsiveContainer>{children}</ResponsiveContainer>
        </ScreenScrollContext.Provider>
      </ScrollView>
    </KeyboardAvoidingView>
  ) : (
    <ResponsiveContainer>{children}</ResponsiveContainer>
  );
  const content =
    fullWidth && !scroll ? <View style={{ flex: 1 }}>{children}</View> : body;
  return (
    <SafeAreaView
      testID="screen"
      edges={underHeader ? ['left', 'right', 'bottom'] : undefined}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      {content}
    </SafeAreaView>
  );
}
