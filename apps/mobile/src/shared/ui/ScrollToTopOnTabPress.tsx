import React, { useContext, type RefObject } from 'react';
import {
  NavigationContext,
  NavigationRouteContext,
  useScrollToTop,
} from '@react-navigation/native';

type Scrollable = Parameters<typeof useScrollToTop>[0];

function Listener({ scrollRef }: { scrollRef: Scrollable }) {
  useScrollToTop(scrollRef);
  return null;
}

/**
 * Scrolls `scrollRef` (a ScrollView, FlatList or SectionList ref) back to the
 * top when the user taps the tab they are already on. Render it anywhere in a
 * tab screen. Outside a navigator (e.g. in a test without a
 * NavigationContainer) it does nothing instead of throwing.
 */
export function ScrollToTopOnTabPress({
  scrollRef,
}: {
  // Any ref whose current value is a scrollable; typed loosely so FlatList
  // and SectionList refs of any item type fit.
  scrollRef: RefObject<unknown>;
}) {
  const navigation = useContext(NavigationContext);
  const route = useContext(NavigationRouteContext);
  if (!navigation || !route) return null;
  return <Listener scrollRef={scrollRef as Scrollable} />;
}
