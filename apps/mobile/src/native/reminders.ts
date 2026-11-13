import { NativeModules } from 'react-native';

// Task 7 expands this file. Safe to call when the native module is absent.
export async function clearReminders(): Promise<void> {
  await NativeModules.Reminders?.clearAll?.();
}
