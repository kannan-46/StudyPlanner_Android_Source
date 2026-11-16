import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/** Whether a screen reader (TalkBack) is running; follows changes. */
export function useScreenReaderEnabled(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let alive = true;
    Promise.resolve()
      .then(() => AccessibilityInfo.isScreenReaderEnabled())
      .then(v => {
        if (alive) setOn(!!v);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', v => {
      if (alive) setOn(!!v);
    });
    return () => {
      alive = false;
      sub?.remove();
    };
  }, []);
  return on;
}
