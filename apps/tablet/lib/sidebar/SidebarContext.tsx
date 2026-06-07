import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { storage } from '@/lib/storage/storage';

const KEY = 'sidebar.collapsed';

interface SidebarValue {
  collapsed: boolean;
  toggle: () => void;
}

const SidebarContext = createContext<SidebarValue>({ collapsed: false, toggle: () => {} });

/** Etat (persiste) de la sidebar repliable, comme le backoffice web. */
export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    storage.get<boolean>(KEY).then((v) => {
      if (typeof v === 'boolean') setCollapsed(v);
    });
  }, []);

  const toggle = () =>
    setCollapsed((c) => {
      const next = !c;
      storage.set(KEY, next);
      return next;
    });

  return <SidebarContext.Provider value={{ collapsed, toggle }}>{children}</SidebarContext.Provider>;
}

export const useSidebar = () => useContext(SidebarContext);
