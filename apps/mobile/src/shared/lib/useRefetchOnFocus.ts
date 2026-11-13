import { useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';

/**
 * Calls the given refetch functions every time the screen regains focus,
 * skipping the first focus (the initial fetch is already in flight).
 */
export function useRefetchOnFocus(...refetches: (() => unknown)[]): void {
  const first = useRef(true);
  const latest = useRef(refetches);
  latest.current = refetches;
  useFocusEffect(
    useCallback(() => {
      if (first.current) {
        first.current = false;
        return;
      }
      latest.current.forEach(fn => fn());
    }, []),
  );
}
