import { Package, MapPin, Truck, CheckCircle2, AlertCircle } from 'lucide-react';

interface TrackingPageProps {
  params: Promise<{ trackingNumber: string }>;
}

interface PublicParcel {
  trackingNumber: string;
  designation: string;
  status: string;
  isPresent: boolean;
  destination: string;
  destinationAddress: string | null;
  createdAt: string;
  arrivalDate: string | null;
  pickupDate: string | null;
  warehouseEnteredAt: string | null;
  category: string;
  warehouse: { name: string; agency?: { name: string; city: string } | null } | null;
  destinationAgency: { name: string; city: string } | null;
  transitRoute: { name: string; type: string } | null;
}

const STATUS_LABELS: Record<string, string> = {
  IN_STOCK: 'En stock',
  IN_TRANSIT: 'En transit',
  ARRIVED: 'Arrive',
  RECEIVED: 'Receptionne',
  DELIVERED: 'Livre',
  LOST: 'Perdu',
  RETURNED: 'Retourne',
};

const TRANSIT_TYPE_LABELS: Record<string, string> = {
  AIR: 'Aerien',
  SEA: 'Maritime',
  LAND: 'Terrestre',
};

async function fetchParcel(trackingNumber: string): Promise<PublicParcel | null> {
  // Cote serveur Next.js : on appelle directement l'API publique sans auth.
  // Utilise NEXT_PUBLIC_API_URL si defini (config front), sinon fallback localhost.
  const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';
  try {
    const res = await fetch(`${base}/public/tracking/${encodeURIComponent(trackingNumber)}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.data ?? null;
  } catch {
    return null;
  }
}

function formatDate(d: string | null | undefined) {
  if (!d) return '-';
  try {
    return new Date(d).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return d;
  }
}

export default async function TrackingPage({ params }: TrackingPageProps) {
  const { trackingNumber } = await params;
  const parcel = await fetchParcel(trackingNumber);

  if (!parcel) {
    return (
      <main className="min-h-screen bg-gray-50 px-4 py-12">
        <div className="mx-auto max-w-md rounded-2xl border border-gray-100 bg-white p-6 text-center shadow-sm">
          <AlertCircle className="mx-auto h-10 w-10 text-red-400" />
          <h1 className="mt-4 text-xl font-semibold text-gray-900">Colis introuvable</h1>
          <p className="mt-2 text-sm text-gray-500">
            Aucun colis ne correspond au code <span className="font-mono font-bold">{trackingNumber}</span>.
          </p>
        </div>
      </main>
    );
  }

  const statusLabel = STATUS_LABELS[parcel.status] ?? parcel.status;
  const stages = [
    { key: 'IN_STOCK', label: 'En stock' },
    { key: 'IN_TRANSIT', label: 'En transit' },
    { key: 'ARRIVED', label: 'Arrive' },
    { key: 'DELIVERED', label: 'Livre' },
  ];
  const currentIndex = stages.findIndex((s) => s.key === parcel.status);

  return (
    <main className="min-h-screen bg-gradient-to-b from-primary-50/50 to-white px-4 py-10">
      <div className="mx-auto max-w-lg space-y-4">
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-primary-100 p-2 text-primary-700">
              <Package className="h-6 w-6" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs uppercase tracking-wide text-gray-400">Suivi colis</p>
              <p className="font-mono text-sm font-bold text-primary-700 truncate">{parcel.trackingNumber}</p>
            </div>
          </div>
          <h1 className="mt-4 text-lg font-semibold text-gray-900">{parcel.designation}</h1>
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-3 py-1 text-xs font-medium text-primary-800">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {statusLabel}
          </div>
        </div>

        {/* Progression */}
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700">Progression</h2>
          <ol className="mt-4 space-y-3">
            {stages.map((stage, i) => {
              const reached = currentIndex >= 0 && i <= currentIndex;
              const active = i === currentIndex;
              return (
                <li key={stage.key} className="flex items-center gap-3">
                  <div
                    className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                      reached ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-400'
                    } ${active ? 'ring-4 ring-primary-100' : ''}`}
                  >
                    {i + 1}
                  </div>
                  <span className={`text-sm ${reached ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>
                    {stage.label}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>

        {/* Detail */}
        <div className="rounded-2xl bg-white p-6 shadow-sm space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">Itineraire</h2>
          <div className="grid grid-cols-1 gap-3 text-sm">
            {parcel.warehouse && (
              <div>
                <p className="text-xs text-gray-400">Magasin actuel</p>
                <p className="text-gray-900 inline-flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-gray-400" />
                  {parcel.warehouse.name}
                  {parcel.warehouse.agency && (
                    <span className="text-gray-500">— {parcel.warehouse.agency.name} ({parcel.warehouse.agency.city})</span>
                  )}
                </p>
              </div>
            )}
            <div>
              <p className="text-xs text-gray-400">Destination</p>
              <p className="text-gray-900 inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-gray-400" />
                {parcel.destinationAgency
                  ? `${parcel.destinationAgency.name} (${parcel.destinationAgency.city})`
                  : parcel.destination}
              </p>
              {parcel.destinationAddress && (
                <p className="ml-5 text-xs text-gray-500">{parcel.destinationAddress}</p>
              )}
            </div>
            {parcel.transitRoute && (
              <div>
                <p className="text-xs text-gray-400">Mode de transit</p>
                <p className="text-gray-900 inline-flex items-center gap-1.5">
                  <Truck className="h-3.5 w-3.5 text-gray-400" />
                  {parcel.transitRoute.name}
                  <span className="text-gray-500">({TRANSIT_TYPE_LABELS[parcel.transitRoute.type] || parcel.transitRoute.type})</span>
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">Dates</h2>
          <dl className="grid grid-cols-1 gap-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-gray-500">Cree le</dt>
              <dd className="text-gray-900">{formatDate(parcel.createdAt)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-gray-500">Entree en magasin</dt>
              <dd className="text-gray-900">{formatDate(parcel.warehouseEnteredAt)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-gray-500">Arrive a destination</dt>
              <dd className="text-gray-900">{formatDate(parcel.arrivalDate)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-gray-500">Remis au client</dt>
              <dd className="text-gray-900">{formatDate(parcel.pickupDate)}</dd>
            </div>
          </dl>
        </div>

        <p className="text-center text-xs text-gray-400">
          Information limitee : les details complets sont accessibles via votre espace client.
        </p>
      </div>
    </main>
  );
}
