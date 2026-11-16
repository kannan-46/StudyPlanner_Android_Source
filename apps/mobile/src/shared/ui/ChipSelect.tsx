import React, { useEffect, useRef } from 'react';
import {
  Pressable,
  ScrollView,
  Text,
  View,
  type ScrollViewInstance,
} from 'react-native';
import { useTheme } from './ThemeProvider';

/** Default testID of a scroll row, from its name. */
const scrollTestId = (name?: string) => {
  const slug = (name ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug ? `chip-scroll-${slug}` : 'chip-scroll';
};

/**
 * A group of choice chips: radio buttons by default, checkboxes with
 * `multiple`.
 *
 * - `label` shows a small caption for the group and also names it for
 *   TalkBack ("Light, radio button, checked, Theme").
 * - `groupLabel` names the group for TalkBack only (when the caption is drawn
 *   elsewhere or not at all).
 * - `scroll` lays the chips out on one line that scrolls sideways instead of
 *   wrapping onto many rows; use it for filter rows above a list. Without a
 *   `testID`, the row's id comes from its name (`groupLabel ?? label`):
 *   "chip-scroll-subject" for "Subject", or plain "chip-scroll" if it has no
 *   name. Two unnamed scroll rows on one screen need their own `testID`.
 */
export function ChipSelect<T extends string | number>({
  options,
  value,
  onChange,
  multiple,
  label,
  groupLabel,
  scroll,
  testID,
}: {
  options: { value: T; label: string }[];
  value: T[] | T;
  onChange: (v: T[] | T) => void;
  multiple?: boolean;
  /** Visible caption above the chips (inline at the start when `scroll`). */
  label?: string;
  /** Group name for TalkBack; defaults to `label`. */
  groupLabel?: string;
  /** One sideways-scrolling line instead of wrapping rows. */
  scroll?: boolean;
  testID?: string;
}) {
  const { colors, radius, spacing } = useTheme();
  const selected = Array.isArray(value) ? value : [value];
  const name = groupLabel ?? label;
  const scrollRef = useRef<ScrollViewInstance>(null);
  const chipX = useRef(new Map<string, number>());
  const scrolledFor = useRef<string | null>(null);
  const tapped = useRef(false);
  const firstSelected = selected.length ? String(selected[0]) : null;

  const toggle = (v: T) => {
    tapped.current = true;
    if (multiple) {
      onChange(
        selected.includes(v) ? selected.filter(s => s !== v) : [...selected, v],
      );
    } else {
      onChange(Array.isArray(value) ? [v] : v);
    }
  };

  // In a scrolling row, bring a chosen chip that the user did not just tap
  // (e.g. a filter restored when the screen opens) into view, so it is never
  // hidden off the right edge. A tapped chip is already on screen.
  const revealSelected = () => {
    if (!scroll || firstSelected === null) return;
    if (scrolledFor.current === firstSelected) return;
    if (tapped.current) {
      tapped.current = false;
      scrolledFor.current = firstSelected;
      return;
    }
    const x = chipX.current.get(firstSelected);
    if (x === undefined) return;
    scrolledFor.current = firstSelected;
    scrollRef.current?.scrollTo({
      x: Math.max(0, x - spacing.lg),
      animated: false,
    });
  };
  useEffect(() => {
    revealSelected();
    tapped.current = false;
  });

  const caption = label ? (
    <Text
      // The chips already carry the group name; don't read it twice.
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={
        scroll
          ? { color: colors.muted, alignSelf: 'center' }
          : { color: colors.muted, marginBottom: spacing.xs }
      }
    >
      {label}
    </Text>
  ) : null;

  const chips = options.map(o => {
    const on = selected.includes(o.value);
    const key = String(o.value);
    return (
      <Pressable
        key={key}
        accessibilityRole={multiple ? 'checkbox' : 'radio'}
        // Only "checked": setting "selected" too makes TalkBack say both.
        accessibilityState={{ checked: on }}
        accessibilityHint={name}
        onPress={() => toggle(o.value)}
        onLayout={
          scroll
            ? e => {
                chipX.current.set(key, e.nativeEvent.layout.x);
                if (key === firstSelected) revealSelected();
              }
            : undefined
        }
        style={{
          minHeight: 48,
          minWidth: 48,
          paddingHorizontal: spacing.lg,
          justifyContent: 'center',
          alignItems: 'center',
          borderRadius: radius.pill,
          borderWidth: 1,
          borderColor: on ? colors.accent : colors.border,
          backgroundColor: on ? colors.softAccent : colors.surface,
        }}
      >
        <Text style={{ color: on ? colors.accent : colors.text }}>
          {o.label}
        </Text>
      </Pressable>
    );
  });

  const role = multiple ? undefined : 'radiogroup';

  if (scroll) {
    return (
      <ScrollView
        ref={scrollRef}
        testID={testID ?? scrollTestId(name)}
        horizontal
        showsHorizontalScrollIndicator={false}
        // Without this, the first tap on a chip while the search keyboard is
        // open only closes the keyboard.
        keyboardShouldPersistTaps="handled"
        accessibilityRole={role}
        contentContainerStyle={{ gap: spacing.sm, alignItems: 'center' }}
      >
        {caption}
        {chips}
      </ScrollView>
    );
  }

  return (
    <View testID={testID}>
      {caption}
      <View
        testID={testID ? `${testID}-group` : undefined}
        accessibilityRole={role}
        style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}
      >
        {chips}
      </View>
    </View>
  );
}
