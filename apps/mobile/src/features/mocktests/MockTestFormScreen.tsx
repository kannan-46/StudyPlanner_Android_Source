import React, { useState } from 'react';
import { Text, View } from 'react-native';
import {
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import type { RootStackParamList } from '../../app/RootNavigator';
import { Button } from '../../shared/ui/Button';
import { ErrorRetry } from '../../shared/ui/ErrorRetry';
import { Loading } from '../../shared/ui/Loading';
import { Screen } from '../../shared/ui/Screen';
import { useSnackbar } from '../../shared/ui/Snackbar';
import { useTheme } from '../../shared/ui/ThemeProvider';
import { useLeaveGuard } from '../../shared/ui/useLeaveGuard';
import { MockTestForm } from '../progress/MockTestForm';
import { useMockTests } from '../progress/hooks';

// Kept word for word: app/__tests__/stackHeaders.test.tsx looks for it.
export const MOCK_TEST_GONE_TEXT = 'This mock test was deleted.';

type FormCallbacks = {
  onSaved: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onSavingChange: (saving: boolean) => void;
};

function EditLoader({ id, ...callbacks }: FormCallbacks & { id: string }) {
  const { colors, spacing } = useTheme();
  const navigation = useNavigation();
  const testsQ = useMockTests();
  const test = testsQ.data?.find(t => t.id === id);
  if (test) return <MockTestForm initial={test} {...callbacks} />;
  if (testsQ.isPending) return <Loading />;
  if (testsQ.data) {
    return (
      <View style={{ alignItems: 'center', gap: spacing.md }}>
        <Text style={{ color: colors.muted, textAlign: 'center' }}>
          {MOCK_TEST_GONE_TEXT}
        </Text>
        <Button
          title="Go back"
          variant="secondary"
          onPress={() => navigation.goBack()}
        />
      </View>
    );
  }
  return (
    <ErrorRetry
      error={testsQ.error}
      context="mockTest"
      onRetry={() => testsQ.refetch()}
    />
  );
}

export function MockTestFormScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'MockTestForm'>>();
  const id = route.params?.id;
  const snackbar = useSnackbar();
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const guard = useLeaveGuard(dirty, saving);
  const onSaved = () => {
    const message = id ? 'Mock test saved' : 'Mock test added';
    // Shown once the screen has closed, in its final place above the tabs.
    guard.leaveAfterSave(() => snackbar.show({ message }));
  };
  const callbacks: FormCallbacks = {
    onSaved,
    onDirtyChange: setDirty,
    onSavingChange: setSaving,
  };
  return (
    <Screen scroll>
      {id ? (
        <EditLoader id={id} {...callbacks} />
      ) : (
        <MockTestForm {...callbacks} />
      )}
      {guard.dialog}
    </Screen>
  );
}
