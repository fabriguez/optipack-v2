import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth/AuthContext';

const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
const API_URL = env?.EXPO_PUBLIC_API_URL ?? 'https://api.transitsoftservices.com/api/v1';
// Strip /api/v1 pour avoir origine socket.io.
const SOCKET_URL = API_URL.replace(/\/api\/v\d+$/, '');

interface RealtimeContextValue {
  connected: boolean;
}

const Ctx = createContext<RealtimeContextValue>({ connected: false });

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!accessToken) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      return;
    }

    const socket = io(SOCKET_URL, {
      transports: ['websocket'],
      auth: { token: accessToken },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
    });
    socketRef.current = socket;

    // Parcel events : invalide listings + detail concerne
    socket.on('parcel:created', () => {
      qc.invalidateQueries({ queryKey: ['portal', 'parcels'] });
      qc.invalidateQueries({ queryKey: ['portal', 'dashboard'] });
    });
    socket.on('parcel:updated', (data: { trackingNumber?: string }) => {
      qc.invalidateQueries({ queryKey: ['portal', 'parcels'] });
      qc.invalidateQueries({ queryKey: ['portal', 'dashboard'] });
      if (data?.trackingNumber) {
        qc.invalidateQueries({ queryKey: ['portal', 'parcels', data.trackingNumber] });
      }
    });

    // Invoice + payment events
    socket.on('invoice:updated', (data: { invoiceId?: string }) => {
      qc.invalidateQueries({ queryKey: ['portal', 'invoices'] });
      qc.invalidateQueries({ queryKey: ['portal', 'dashboard'] });
      if (data?.invoiceId) {
        qc.invalidateQueries({ queryKey: ['portal', 'invoices', data.invoiceId] });
      }
    });
    socket.on('payment:created', (data: { invoiceId?: string }) => {
      qc.invalidateQueries({ queryKey: ['portal', 'payments'] });
      qc.invalidateQueries({ queryKey: ['portal', 'invoices'] });
      if (data?.invoiceId) {
        qc.invalidateQueries({ queryKey: ['portal', 'invoices', data.invoiceId] });
      }
    });

    // Notifications push-style
    socket.on('notification:new', () => {
      qc.invalidateQueries({ queryKey: ['portal', 'notifications'] });
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [accessToken, qc]);

  const value = useMemo<RealtimeContextValue>(() => ({ connected: !!socketRef.current }), []);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRealtime(): RealtimeContextValue {
  return useContext(Ctx);
}
