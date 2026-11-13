import { useEffect, useState } from 'react';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';

const isOnline = (s: NetInfoState): boolean =>
  s.isConnected !== false && s.isInternetReachable !== false;

/** Tracks connectivity and keeps React Query's onlineManager in sync. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(s => {
      const next = isOnline(s);
      onlineManager.setOnline(next);
      setOnline(next);
    });
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);
  return online;
}
