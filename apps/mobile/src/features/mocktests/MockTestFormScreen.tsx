import React, { useState } from 'react';
import { Text } from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../../app/RootNavigator';
import { ErrorRetry } from '../../shared/ui/ErrorRetry';
import { Loading } from '../../shared/ui/Loading';
import { Screen } from '../../shared/ui/Screen';
import { useSnackbar } from '../../shared/ui/Snackbar';
import { useTheme } from '../../shared/ui/ThemeProvider';
import { useLeaveGuard } from '../../shared/ui/useLeaveGuard';
import { MockTestForm } from '../progress/MockTestForm';
import { useMockTests } from '../progress/hooks';

function EditLoader({
  id,
  onSaved,
  onDirtyChange,
}: {
  id: string;
  onSaved: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const { colors } = useTheme();
  const testsQ = useMockTests();
  const test = testsQ.data?.find(t => t.id === id);
  if (test) {
    return (
      <MockTestForm
        initial={test}
        onSaved={onSaved}
        onDirtyChange={onDirtyChange}
      />
    );
  }
  if (testsQ.isPending) return <Loading />;
  if (testsQ.data) {
    return (
      <Text style={{ color: colors.muted, textAlign: 'center' }}>
        This mock test was deleted.
      </Text>
    );
  }
  return <ErrorRetry error={testsQ.error} onRetry={() => testsQ.refetch()} />;
}

export function MockTestFormScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'MockTestForm'>>();
  const id = route.params?.id;
  const snackbar = useSnackbar();
  const [dirty, setDirty] = useState(false);
  const guard = useLeaveGuard(dirty);
  const onSaved = () => {
    snackbar.show({ message: id ? 'Mock test saved' : 'Mock test added' });
    guard.leaveAfterSave();
  };
  return (
    <Screen scroll>
      {id ? (
        <EditLoader id={id} onSaved={onSaved} onDirtyChange={setDirty} />
      ) : (
        <MockTestForm onDirtyChange={setDirty} onSaved={onSaved} />
      )}
      {guard.dialog}
    </Screen>
  );
}
