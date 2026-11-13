import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type PressableProps,
  type TextInputProps,
} from 'react-native';
import type {Theme} from './theme';

export function Page({
  theme,
  children,
  contentContainerStyle,
}: React.PropsWithChildren<{theme: Theme; contentContainerStyle?: object}>) {
  return (
    <ScrollView
      style={{backgroundColor: theme.background}}
      contentContainerStyle={[styles.page, contentContainerStyle]}
      keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

export function Card({theme, children, style}: React.PropsWithChildren<{theme: Theme; style?: object}>) {
  return (
    <View style={[styles.card, {backgroundColor: theme.surface, borderColor: theme.line}, style]}>
      {children}
    </View>
  );
}

export function Heading({theme, children}: React.PropsWithChildren<{theme: Theme}>) {
  return <Text style={[styles.heading, {color: theme.text}]}>{children}</Text>;
}

export function BodyText({
  theme,
  children,
  style,
}: React.PropsWithChildren<{theme: Theme; style?: object}>) {
  return <Text style={[styles.bodyText, {color: theme.text}, style]}>{children}</Text>;
}

export function MutedText({
  theme,
  children,
  style,
}: React.PropsWithChildren<{theme: Theme; style?: object}>) {
  return <Text style={[styles.mutedText, {color: theme.muted}, style]}>{children}</Text>;
}

type ButtonProps = Omit<PressableProps, 'style'> & {
  theme: Theme;
  label: string;
  kind?: 'primary' | 'secondary' | 'danger' | 'text';
  compact?: boolean;
  busy?: boolean;
};

export function Button({
  theme,
  label,
  kind = 'primary',
  compact,
  busy,
  disabled,
  ...props
}: ButtonProps) {
  const backgroundColor =
    kind === 'primary' ? theme.accent :
    kind === 'danger' ? theme.danger :
    kind === 'secondary' ? theme.softAccent : 'transparent';
  const color = kind === 'primary' ? theme.accentText :
    kind === 'danger' ? '#FFFFFF' :
    kind === 'secondary' ? theme.accent : theme.accent;
  return (
    <Pressable
      accessibilityRole="button"
      {...props}
      disabled={disabled || busy}
      style={({pressed}) => [
        styles.button,
        compact && styles.buttonCompact,
        {backgroundColor, opacity: disabled || busy ? 0.55 : pressed ? 0.82 : 1},
        kind === 'text' && styles.buttonTextOnly,
      ]}>
      {busy ? <ActivityIndicator color={color} /> : <Text style={[styles.buttonLabel, {color}]}>{label}</Text>}
    </Pressable>
  );
}

type FieldProps = Omit<TextInputProps, 'style'> & {
  theme: Theme;
  label: string;
  keyboardType?: KeyboardTypeOptions;
};

export function Field({theme, label, keyboardType, ...props}: FieldProps) {
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, {color: theme.text}]}>{label}</Text>
      <TextInput
        {...props}
        keyboardType={keyboardType}
        placeholderTextColor={theme.muted}
        style={[
          styles.input,
          {backgroundColor: theme.input, borderColor: theme.line, color: theme.text},
          props.multiline && styles.multiline,
        ]}
      />
    </View>
  );
}

export function Chip({
  theme,
  label,
  selected,
  onPress,
}: {
  theme: Theme;
  label: string;
  selected?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        {borderColor: selected ? theme.accent : theme.line, backgroundColor: selected ? theme.softAccent : theme.surface},
      ]}>
      <Text style={{color: selected ? theme.accent : theme.muted, fontWeight: selected ? '700' : '500'}}>{label}</Text>
    </Pressable>
  );
}

export function Notice({theme, children, danger}: React.PropsWithChildren<{theme: Theme; danger?: boolean}>) {
  return (
    <View style={[styles.notice, {backgroundColor: danger ? `${theme.danger}18` : theme.softAccent}]}>
      <Text style={{color: danger ? theme.danger : theme.text, lineHeight: 20}}>{children}</Text>
    </View>
  );
}

export function ProgressBar({theme, percent}: {theme: Theme; percent: number}) {
  const width = `${Math.max(0, Math.min(percent, 100))}%` as `${number}%`;
  return (
    <View style={[styles.progressTrack, {backgroundColor: theme.line}]}>
      <View style={[styles.progressFill, {backgroundColor: theme.accent, width}]} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: {padding: 18, paddingBottom: 36, gap: 14},
  card: {borderWidth: 1, borderRadius: 16, padding: 16, gap: 10},
  heading: {fontSize: 18, fontWeight: '800', marginTop: 3},
  bodyText: {fontSize: 15, lineHeight: 21},
  mutedText: {fontSize: 13, lineHeight: 19},
  button: {minHeight: 46, borderRadius: 12, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center'},
  buttonCompact: {minHeight: 36, borderRadius: 10, paddingHorizontal: 12},
  buttonTextOnly: {paddingHorizontal: 5},
  buttonLabel: {fontSize: 14, fontWeight: '700'},
  field: {gap: 7, marginBottom: 2},
  fieldLabel: {fontSize: 13, fontWeight: '700'},
  input: {minHeight: 46, borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, fontSize: 15},
  multiline: {minHeight: 90, paddingTop: 12, textAlignVertical: 'top'},
  chip: {borderWidth: 1, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 999},
  notice: {borderRadius: 12, padding: 12},
  progressTrack: {height: 8, borderRadius: 99, overflow: 'hidden'},
  progressFill: {height: 8, borderRadius: 99},
});
