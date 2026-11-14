import React, { useState } from 'react';
import { Screen } from '../../shared/ui/Screen';
import { useSnackbar } from '../../shared/ui/Snackbar';
import { useLeaveGuard } from '../../shared/ui/useLeaveGuard';
import { MockTestForm } from '../progress/MockTestForm';

export function MockTestFormScreen() {
  const snackbar = useSnackbar();
  const [dirty, setDirty] = useState(false);
  const guard = useLeaveGuard(dirty);
  return (
    <Screen scroll>
      <MockTestForm
        onDirtyChange={setDirty}
        onSaved={() => {
          snackbar.show({ message: 'Mock test added' });
          guard.leaveAfterSave();
        }}
      />
      {guard.dialog}
    </Screen>
  );
}
