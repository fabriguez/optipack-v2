'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useSession } from 'next-auth/react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:4000';

interface SocketContextValue {
  socket: Socket | null;
  isConnected: boolean;
}

const SocketContext = createContext<SocketContextValue>({
  socket: null,
  isConnected: false,
});

export function SocketProvider({ children }: { children: ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const { data: session, status } = useSession();
  const qc = useQueryClient();
  const accessToken = (session as unknown as { accessToken?: string } | undefined)?.accessToken;

  useEffect(() => {
    // Le token vit dans la session NextAuth, pas dans localStorage. On attend
    // qu'il soit dispo avant de se connecter pour que l'API puisse joindre
    // automatiquement les rooms (user / client / agency / org).
    if (status !== 'authenticated' || !accessToken) return;

    const socketInstance = io(SOCKET_URL, {
      auth: { token: accessToken },
      transports: ['websocket', 'polling'],
      reconnection: true,
    });

    socketInstance.on('connect', () => setIsConnected(true));
    socketInstance.on('disconnect', () => setIsConnected(false));

    // Mise a jour temps reel des listes/details : l'API emet `resource:changed`
    // ({ entity, action, id }) vers la room org a chaque mutation. On invalide
    // la query [entity] pour que toutes les vues ouvertes se rafraichissent.
    socketInstance.on('resource:changed', (payload: { entity?: string }) => {
      if (payload?.entity) qc.invalidateQueries({ queryKey: [payload.entity] });
    });

    // Notification temps reel : un nouvel event arrive du serveur.
    // On rafraichit le compteur + on toast le titre (sauf pour les notifs
    // verbeuses ou silencieuses si besoin).
    socketInstance.on(
      'notification:new',
      (notif: { id: string; title: string; message: string; metadata?: unknown }) => {
        qc.invalidateQueries({ queryKey: ['notifications-unread-count'] });
        qc.invalidateQueries({ queryKey: ['notifications'] });
        toast.info(notif.title, {
          description: notif.message,
        });
      },
    );

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, [status, accessToken, qc]);

  return (
    <SocketContext.Provider value={{ socket, isConnected }}>{children}</SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
