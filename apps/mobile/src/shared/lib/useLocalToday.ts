import { useCallback, useEffect, useState } from 'react';
import { localToday, type LocalDate } from '@planner/shared';
import { useAppForeground } from './useAppForeground';

/** Longest single wait, so a sleeping phone re-checks soon after it wakes. */
const MAX_WAIT_MS = 60 * 60 * 1000;

function msUntilNextMidnight(now: Date): number {
  const next = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
    0,
    0,
    1,
  );
  return Math.max(1000, next.getTime() - now.getTime());
}

/**
 * The phone's local date, kept current: it re-checks when the app returns to
 * the foreground and just after local midnight, so screens and date-keyed
 * queries move to the new day without a restart.
 */
export function useLocalToday(): LocalDate {
  const [today, setToday] = useState<LocalDate>(() => localToday());

  const refresh = useCallback(() => {
    const now = localToday();
    setToday(prev => (prev === now ? prev : now));
  }, []);

  useAppForeground(refresh);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const arm = () => {
      const wait = Math.min(msUntilNextMidnight(new Date()), MAX_WAIT_MS);
      timer = setTimeout(() => {
        refresh();
        arm();
      }, wait);
    };
    // Catch a day change that happened between the first render and now.
    refresh();
    arm();
    return () => clearTimeout(timer);
  }, [refresh]);

  return today;
}
