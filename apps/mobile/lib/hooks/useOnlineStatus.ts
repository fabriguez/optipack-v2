import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const unsub = NetInfo.addEventListener((s) => {
      setOnline(!!s.isConnected && s.isInternetReachable !== false);
    });
    NetInfo.fetch().then((s) => setOnline(!!s.isConnected && s.isInternetReachable !== false));
    return () => unsub();
  }, []);
  return online;
}
