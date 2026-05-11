'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  applySkinById,
  DEFAULT_SKIN_ID,
  listSkins,
  registerSkins,
  resolveSkin,
  type ResolvedSkin,
  type SkinCustomization,
  type SkinId,
  type SkinTokens,
} from '@transitsoftservices/skins';

interface SkinContextValue {
  skinId: SkinId;
  customization: SkinCustomization;
  resolved: ResolvedSkin;
  /** All skins available (built-in + tenant-registered). */
  available: SkinTokens[];
  setSkin: (id: SkinId) => void;
  patchCustomization: (patch: SkinCustomization) => void;
  resetCustomization: () => void;
  publish: () => Promise<void>;
}

const SkinContext = createContext<SkinContextValue | undefined>(undefined);

const STORAGE_KEY = 'optipack_skin';

interface StoredSkin {
  id: SkinId;
  customization: SkinCustomization;
}

function readStored(): StoredSkin | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredSkin;
  } catch {
    return null;
  }
}

function writeStored(s: StoredSkin) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

export interface SkinProviderProps {
  children: ReactNode;
  initialSkinId?: SkinId;
  initialCustomization?: SkinCustomization;
  /** Extra runtime-registered skins (server-driven catalogue). */
  extraSkins?: SkinTokens[];
}

export function SkinProvider({
  children,
  initialSkinId,
  initialCustomization,
  extraSkins,
}: SkinProviderProps) {
  // Register extra skins ASAP so listSkins() returns them.
  if (extraSkins && extraSkins.length) {
    registerSkins(extraSkins);
  }

  const [skinId, setSkinId] = useState<SkinId>(initialSkinId ?? DEFAULT_SKIN_ID);
  const [customization, setCustomization] = useState<SkinCustomization>(
    initialCustomization ?? {},
  );

  useEffect(() => {
    if (initialSkinId) return;
    const stored = readStored();
    if (stored) {
      setSkinId(stored.id);
      setCustomization(stored.customization);
    }
  }, [initialSkinId]);

  useEffect(() => {
    applySkinById(skinId, customization);
  }, [skinId, customization]);

  const setSkin = useCallback((id: SkinId) => setSkinId(id), []);
  const patchCustomization = useCallback(
    (patch: SkinCustomization) =>
      setCustomization((prev) => ({ ...prev, ...patch })),
    [],
  );
  const resetCustomization = useCallback(() => setCustomization({}), []);

  const publish = useCallback(async () => {
    writeStored({ id: skinId, customization });
    // TODO: POST to /api/v1/tenant-meta/skin once backend exposes it.
  }, [skinId, customization]);

  const resolved = useMemo(
    () => resolveSkin(skinId, customization),
    [skinId, customization],
  );
  const available = useMemo(() => listSkins(), [extraSkins]);

  const value = useMemo<SkinContextValue>(
    () => ({
      skinId,
      customization,
      resolved,
      available,
      setSkin,
      patchCustomization,
      resetCustomization,
      publish,
    }),
    [skinId, customization, resolved, available, setSkin, patchCustomization, resetCustomization, publish],
  );

  return <SkinContext.Provider value={value}>{children}</SkinContext.Provider>;
}

export function useSkin(): SkinContextValue {
  const ctx = useContext(SkinContext);
  if (!ctx) throw new Error('useSkin must be used inside <SkinProvider>');
  return ctx;
}
