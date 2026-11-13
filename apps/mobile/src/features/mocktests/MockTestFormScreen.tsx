import React from 'react';
import { useNavigation } from '@react-navigation/native';
import { Screen } from '../../shared/ui/Screen';
import { useSnackbar } from '../../shared/ui/Snackbar';
import { MockTestForm } from '../progress/MockTestForm';

export function MockTestFormScreen() {
  const navigation = useNavigation();
  const snackbar = useSnackbar();
  return (
    <Screen scroll>
      <MockTestForm
        onSaved={() => {
          snackbar.show({ message: 'Mock test added' });
          navigation.goBack();
        }}
      />
    </Screen>
  );
}
