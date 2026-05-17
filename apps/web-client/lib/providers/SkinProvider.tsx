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
import { useTenantMeta } from '@/lib/providers/TenantMetaProvider';

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

// LocalStorage skin retire : le skin est centralement gere par le tenant
// (Studio admin). Aucun fallback visiteur -- coherence garantie.

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

  // Le skin actif est dicte par le tenant (Studio admin / ops). Le visiteur
  // ne peut PLUS le changer cote client web -- on retire le picker visiteur.
  // Source de verite : useTenantMeta().meta.skin et .skinCustomization,
  // poussés par /tenant-meta (avec refetch realtime).
  const { meta } = useTenantMeta();
  const [skinId, setSkinId] = useState<SkinId>(initialSkinId ?? DEFAULT_SKIN_ID);
  const [customization, setCustomization] = useState<SkinCustomization>(
    initialCustomization ?? {},
  );

  // Sync : quand /tenant-meta resout (ou apres un broadcast tenant:meta:updated),
  // on adopte le skin du tenant. Fallback localStorage retire pour eviter
  // que le visiteur garde un skin obsolete entre 2 sessions.
  useEffect(() => {
    if (!meta) return;
    if (meta.skin && meta.skin !== skinId) setSkinId(meta.skin);
    if (meta.skinCustomization) {
      setCustomization(meta.skinCustomization as SkinCustomization);
    }
    // skinId/customization volontairement absents : on suit toujours meta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta?.skin, JSON.stringify(meta?.skinCustomization ?? null)]);

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
    // No-op cote client : changement de skin = via dashboard admin uniquement.
  }, []);

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
