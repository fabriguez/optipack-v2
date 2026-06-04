import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatDate, formatDateTime } from '@transitsoftservices/shared';
import { colors } from '@/lib/theme/colors';

interface AgencyRef {
  id?: string;
  name?: string | null;
  city?: string | null;
}
interface ContainerRef {
  id?: string;
  designation?: string | null;
  estimatedArrivalDate?: string | null;
  departureAgency?: AgencyRef | null;
  arrivalAgency?: AgencyRef | null;
}
export interface ParcelStatusLike {
  status: string;
  warehouse?: { id?: string; name?: string | null; agency?: { name?: string | null } | null } | null;
  container?: ContainerRef | null;
  lastContainer?: ContainerRef | null;
  transitRoute?: { name?: string | null; departureCity?: string | null; arrivalCity?: string | null } | null;
  destination?: string | null;
  destinationAgency?: AgencyRef | null;
  origin?: string | null;
  recipient?: { fullName?: string | null; phone?: string | null } | null;
  arrivalDate?: string | null;
  pickupDate?: string | null;
  warehouseEnteredAt?: string | null;
}

/**
 * Texte contextuel sous le badge de statut, port mobile de
 * `apps/web/components/shared/ParcelStatusContext.tsx` :
 *   IN_STOCK   -> "En stock a <magasin> depuis le <date>"
 *   RECEIVED   -> "Arrive a <agence> · receptionne en <magasin> le <date>"
 *   LOADING    -> "En chargement dans le conteneur <X>"
 *   IN_TRANSIT -> "En transit de <X> vers <Y> · arrivee prevue <date>"
 *   ARRIVED    -> "Arrive a <agence> le <date>"
 *   DELIVERED  -> "Livre a <destinataire> le <date>"
 *
 * `compact` : une seule ligne tronquee, pour les cartes de liste.
 */
export function ParcelStatusContext({
  parcel,
  compact = false,
}: {
  parcel: ParcelStatusLike;
  compact?: boolean;
}) {
  const status = parcel.status;
  const wh = parcel.warehouse;
  const ct = parcel.container ?? parcel.lastContainer;
  const route = parcel.transitRoute;

  const size = compact ? 11 : 13;
  const muted = colors.gray[500];
  const strong = colors.gray[800];

  const agencyName = (a?: AgencyRef | null, fallback?: string | null) =>
    a?.name ? `${a.name}${a.city ? ` (${a.city})` : ''}` : fallback ?? null;

  // Construit une liste de segments {text, bold?} -> rendu inline.
  let icon: keyof typeof Ionicons.glyphMap = 'information-circle-outline';
  const parts: { t: string; b?: boolean }[] = [];

  switch (status) {
    case 'IN_STOCK':
      icon = 'cube-outline';
      parts.push({ t: 'En stock a ' });
      parts.push({ t: wh?.name ?? '—', b: true });
      if (wh?.agency?.name) parts.push({ t: ` (${wh.agency.name})` });
      if (parcel.warehouseEnteredAt) parts.push({ t: ` depuis le ${formatDate(parcel.warehouseEnteredAt)}` });
      break;

    case 'RECEIVED': {
      icon = 'checkmark-done-outline';
      const arr = agencyName(ct?.arrivalAgency, parcel.destinationAgency?.name ?? parcel.destination);
      parts.push({ t: 'Arrive a ' });
      parts.push({ t: arr ?? '—', b: true });
      if (wh?.name) {
        parts.push({ t: ' · receptionne en ' });
        parts.push({ t: wh.name, b: true });
      }
      if (parcel.warehouseEnteredAt) parts.push({ t: ` le ${formatDate(parcel.warehouseEnteredAt)}` });
      break;
    }

    case 'LOADING':
      icon = 'archive-outline';
      parts.push({ t: 'En chargement dans le conteneur ' });
      parts.push({ t: ct?.designation ?? '—', b: true });
      break;

    case 'IN_TRANSIT': {
      icon = 'boat-outline';
      const dep = agencyName(ct?.departureAgency, route?.departureCity ?? parcel.origin);
      const arr = agencyName(ct?.arrivalAgency, route?.arrivalCity ?? parcel.destinationAgency?.city ?? parcel.destination);
      parts.push({ t: 'En transit de ' });
      parts.push({ t: dep ?? '—', b: true });
      parts.push({ t: ' vers ' });
      parts.push({ t: arr ?? '—', b: true });
      if (ct?.estimatedArrivalDate) parts.push({ t: ` · arrivee prevue ${formatDate(ct.estimatedArrivalDate)}` });
      break;
    }

    case 'ARRIVED': {
      icon = 'flag-outline';
      const arr = agencyName(ct?.arrivalAgency, parcel.destinationAgency?.name ?? parcel.destination);
      parts.push({ t: 'Arrive a ' });
      parts.push({ t: arr ?? '—', b: true });
      if (parcel.arrivalDate) parts.push({ t: ` le ${formatDateTime(parcel.arrivalDate)}` });
      break;
    }

    case 'DELIVERED': {
      icon = 'happy-outline';
      parts.push({ t: 'Livre a ' });
      parts.push({ t: parcel.recipient?.fullName ?? '(destinataire)', b: true });
      if (parcel.recipient?.phone && !compact) parts.push({ t: ` (${parcel.recipient.phone})` });
      if (parcel.pickupDate) parts.push({ t: ` le ${formatDateTime(parcel.pickupDate)}` });
      break;
    }

    case 'LOST':
      return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name="alert-circle-outline" size={size + 2} color={colors.error} />
          <Text style={{ fontSize: size, color: colors.error }}>Colis perdu / non retrouve</Text>
        </View>
      );

    default:
      return (
        <Text style={{ fontSize: size, color: muted }} numberOfLines={compact ? 1 : undefined}>
          {status}
        </Text>
      );
  }

  return (
    <View style={{ flexDirection: 'row', alignItems: compact ? 'center' : 'flex-start', gap: 4 }}>
      <Ionicons name={icon} size={size + 2} color={colors.primary[600]} style={{ marginTop: compact ? 0 : 1 }} />
      <Text style={{ fontSize: size, color: muted, flex: 1 }} numberOfLines={compact ? 1 : undefined}>
        {parts.map((p, i) => (
          <Text key={i} style={p.b ? { color: strong, fontWeight: '600' } : undefined}>
            {p.t}
          </Text>
        ))}
      </Text>
    </View>
  );
}
