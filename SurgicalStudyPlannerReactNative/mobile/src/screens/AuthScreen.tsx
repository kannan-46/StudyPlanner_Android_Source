import React, {useState} from 'react';
import {KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View} from 'react-native';
import {Button, Card, Field, MutedText, Notice} from '../ui/components';
import type {Theme} from '../ui/theme';

export function AuthScreen({
  theme,
  registrationEnabled,
  configError,
  onLogin,
  onRegister,
  onRetry,
}: {
  theme: Theme;
  registrationEnabled: boolean;
  configError: string | null;
  onLogin: (email: string, password: string) => Promise<void>;
  onRegister: (email: string, password: string) => Promise<void>;
  onRetry: () => Promise<void>;
}) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    if (!email.trim() || !email.includes('@')) {
      setError('Enter a valid email address.');
      return;
    }
    if (mode === 'register' && password.length < 12) {
      setError('Use a password with at least 12 characters.');
      return;
    }
    if (mode === 'register' && password !== confirmPassword) {
      setError('The passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'register') await onRegister(email, password);
      else await onLogin(email, password);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not sign in.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.root, {backgroundColor: theme.background}]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.brand}>
          <Text style={styles.medicalMark}>🩺</Text>
          <Text style={[styles.title, {color: theme.text}]}>Surgical Study Planner</Text>
          <MutedText theme={theme}>Study smarter. Revise on time. Stay consistent.</MutedText>
        </View>
        <Card theme={theme}>
          <Text style={[styles.formTitle, {color: theme.text}]}>
            {mode === 'login' ? 'Sign in to your planner' : 'Create your account'}
          </Text>
          <MutedText theme={theme}>Planner data is stored online. An internet connection is required.</MutedText>
          {configError ? (
            <Notice theme={theme} danger>
              {configError}
            </Notice>
          ) : null}
          {error ? <Notice theme={theme} danger>{error}</Notice> : null}
          <Field
            theme={theme}
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            returnKeyType="next"
          />
          <Field
            theme={theme}
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            textContentType={mode === 'login' ? 'password' : 'newPassword'}
            onSubmitEditing={() => void submit()}
          />
          {mode === 'register' ? (
            <Field
              theme={theme}
              label="Confirm password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              autoCapitalize="none"
              textContentType="newPassword"
              onSubmitEditing={() => void submit()}
            />
          ) : null}
          <Button
            theme={theme}
            label={mode === 'login' ? 'Sign in' : 'Create account'}
            busy={busy}
            onPress={() => void submit()}
          />
          {registrationEnabled ? (
            <Button
              theme={theme}
              kind="text"
              label={mode === 'login' ? 'Create an account' : 'Back to sign in'}
              onPress={() => {
                setMode(mode === 'login' ? 'register' : 'login');
                setError(null);
              }}
            />
          ) : null}
          {configError ? (
            <Button theme={theme} kind="secondary" label="Retry connection" onPress={() => void onRetry()} />
          ) : null}
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, justifyContent: 'center'},
  content: {padding: 20, gap: 24},
  brand: {alignItems: 'center', gap: 8},
  medicalMark: {fontSize: 42},
  title: {fontSize: 25, fontWeight: '900', textAlign: 'center'},
  formTitle: {fontSize: 20, fontWeight: '800'},
});
