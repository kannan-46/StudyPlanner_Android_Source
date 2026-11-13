import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

/** Calls cb when the app goes from background/inactive to active. */
export function useAppForeground(cb: () => void): void {
  const saved = useRef(cb);
  saved.current = cb;
  useEffect(() => {
    const initial: unknown = AppState.currentState;
    let prev: AppStateStatus =
      typeof initial === 'string' ? (initial as AppStateStatus) : 'active';
    const sub = AppState.addEventListener('change', next => {
      if ((prev === 'background' || prev === 'inactive') && next === 'active') {
        saved.current();
      }
      prev = next;
    });
    return () => sub.remove();
  }, []);
}
