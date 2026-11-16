import React, { type ReactNode } from 'react';
import { View, useWindowDimensions } from 'react-native';

export type SizeClass = 'compact' | 'medium' | 'expanded';

export type Responsive = {
  width: number;
  height: number;
  size: SizeClass;
  isLandscape: boolean;
  fontScale: number;
};

export function sizeFor(width: number): SizeClass {
  if (width >= 900) return 'expanded';
  if (width >= 600) return 'medium';
  return 'compact';
}

export function useResponsive(): Responsive {
  const { width, height, fontScale } = useWindowDimensions();
  return {
    width,
    height,
    size: sizeFor(width),
    isLandscape: width > height,
    fontScale,
  };
}

export function columnsFor(
  size: SizeClass,
  map: Record<SizeClass, number> = { compact: 1, medium: 2, expanded: 2 },
): number {
  return map[size];
}

/** Width cap for a centred dialog card (its width is otherwise 100%). */
export function dialogMaxWidthFor(size: SizeClass): number {
  return size === 'expanded' ? 560 : 480;
}

/** Centres content with a max width once the window is 700 dp or wider. */
export function ResponsiveContainer({
  children,
  maxWidth = 720,
}: {
  children: ReactNode;
  maxWidth?: number;
}) {
  const { width } = useResponsive();
  return (
    <View
      testID="responsive-container"
      style={
        width >= 700
          ? { flex: 1, width: '100%', maxWidth, alignSelf: 'center' }
          : { flex: 1, width: '100%' }
      }
    >
      {children}
    </View>
  );
}
