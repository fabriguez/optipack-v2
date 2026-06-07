import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth/AuthContext';
import { toast } from '@/lib/toast';

const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
const API_URL = env?.EXPO_PUBLIC_API_URL ?? 'https://api.transitsoftservices.com/api/v1';
const SOCKET_URL = env?.EXPO_PUBLIC_SOCKET_URL ?? API_URL.replace(/\/api\/v\d+\/?$/, '');

interface SocketContextValue {
  socket: Socket | null;
  isConnected: boolean;
}

const SocketContext = createContext<SocketContextValue>({ socket: null, isConnected: false });

/**
 * Connexion socket.io temps reel. A chaque event `resource:changed` emis par
 * l'API (cf. RealtimeService.emitResourceChange), on invalide la query [entity]
 * pour que les listes/details se mettent a jour en direct (web + tablette).
 */
export function SocketProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { accessToken } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!accessToken) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setIsConnected(false);
      return;
    }

    const socket = io(SOCKET_URL, {
      auth: { token: accessToken },
      transports: ['websocket'],
      reconnection: true,
    });
    socketRef.current = socket;

    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));

    // Mise a jour temps reel des listes/details.
    socket.on('resource:changed', (payload: { entity?: string }) => {
      if (payload?.entity) qc.invalidateQueries({ queryKey: [payload.entity] });
    });

    // Notifications temps reel.
    socket.on('notification:new', (notif: { title?: string; message?: string }) => {
      qc.invalidateQueries({ queryKey: ['notifications-unread-count'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
      if (notif?.title) toast.info(notif.title);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [accessToken, qc]);

  return (
    <SocketContext.Provider value={{ socket: socketRef.current, isConnected }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
