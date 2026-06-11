import { Link } from 'react-router-dom';
import { ArrowRight, Plane, Ship, Truck } from 'lucide-react';
import { AppCard, AppCardHeader } from '@/components/ui/AppCard';
import { AppBadge } from '@/components/ui/AppBadge';

type TransitType = 'AIR' | 'SEA' | 'LAND';

interface LinkNode {
  id: string;
  designation: string;
  type: TransitType;
  status?: string;
  isForwarding?: boolean;
}

interface ContainerLike {
  id: string;
  designation: string;
  type: TransitType;
  status: string;
  isForwarding: boolean;
  forwardingParents?: Array<{ id: string; parcelCount: number; parent: LinkNode }>;
  forwardingChildren?: Array<{ id: string; parcelCount: number; forwarding: LinkNode }>;
}

const TYPE_ICON = { AIR: Plane, SEA: Ship, LAND: Truck } as const;
const TYPE_LABEL = { AIR: 'Aerien', SEA: 'Maritime', LAND: 'Terrestre' } as const;
const TYPE_TONE = { AIR: 'info', SEA: 'success', LAND: 'warning' } as const;

function Node({ node, parcelCount, highlight }: { node: LinkNode; parcelCount?: number; highlight?: boolean }) {
  const Icon = TYPE_ICON[node.type];
  return (
    <Link
      to={`/containers/${node.id}`}
      className={`flex w-48 flex-col rounded-xl border p-3 transition ${
        highlight
          ? 'border-primary-400 bg-primary-50/60 ring-2 ring-primary-200'
          : 'border-gray-200 bg-white hover:border-primary-300 hover:bg-primary-50/40'
      }`}
    >
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary-600" />
        <span className="truncate font-mono text-xs font-semibold text-primary-700">{node.designation}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <AppBadge variant={TYPE_TONE[node.type]}>{TYPE_LABEL[node.type]}</AppBadge>
        {node.isForwarding && <AppBadge variant="info">Acheminement</AppBadge>}
        {node.status && <AppBadge variant="default">{node.status}</AppBadge>}
      </div>
      {parcelCount != null && (
        <p className="mt-1.5 text-[11px] text-gray-500">{parcelCount} colis communs</p>
      )}
    </Link>
  );
}

export function ContainerLinksGraph({ container }: { container: ContainerLike }) {
  const parents = container.forwardingParents ?? [];
  const children = container.forwardingChildren ?? [];

  if (parents.length === 0 && children.length === 0) return null;

  return (
    <AppCard>
      <AppCardHeader
        title="Liaisons conteneurs"
        description={
          container.isForwarding
            ? 'Conteneurs sources dont les colis sont regroupes ici'
            : "Conteneurs d'acheminement contenant des colis de ce conteneur"
        }
      />
      <div className="overflow-x-auto">
        <div className="flex min-w-fit items-stretch gap-2 py-2">
          {/* Parents (gauche) : seulement si forwarding */}
          {parents.length > 0 && (
            <>
              <div className="flex flex-col gap-2">
                {parents.map((p) => (
                  <Node key={p.id} node={p.parent} parcelCount={p.parcelCount} />
                ))}
              </div>
              <div className="flex items-center text-gray-400">
                <ArrowRight className="h-5 w-5" />
              </div>
            </>
          )}

          {/* Conteneur courant (centre, highlight) */}
          <div className="flex items-center">
            <Node node={container} highlight />
          </div>

          {/* Children (droite) : forwardings dont ce conteneur est parent */}
          {children.length > 0 && (
            <>
              <div className="flex items-center text-gray-400">
                <ArrowRight className="h-5 w-5" />
              </div>
              <div className="flex flex-col gap-2">
                {children.map((c) => (
                  <Node key={c.id} node={c.forwarding} parcelCount={c.parcelCount} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </AppCard>
  );
}
