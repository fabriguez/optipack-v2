'use client';

import { useEffect, useState } from 'react';
import { Building2, MapPin, Phone, ExternalLink } from 'lucide-react';
import { AppCard } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppSkeleton } from '@/components/ui/AppSkeleton';
import { PageTransition } from '@/components/shared/PageTransition';
import { clientPortalApi } from '@/lib/api/client-portal';

interface Agency {
  id: string;
  name: string;
  address: string;
  city: string;
  phone: string;
  latitude?: number;
  longitude?: number;
}

export default function PortalAgenciesPage() {
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    clientPortalApi
      .getAgencies()
      .then((res) => setAgencies(res.data || []))
      .catch(() => setAgencies([]))
      .finally(() => setLoading(false));
  }, []);

  function getMapsUrl(agency: Agency): string {
    if (agency.latitude && agency.longitude) {
      return `https://www.google.com/maps/search/?api=1&query=${agency.latitude},${agency.longitude}`;
    }
    const q = encodeURIComponent(`${agency.name} ${agency.address} ${agency.city}`);
    return `https://www.google.com/maps/search/?api=1&query=${q}`;
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <AppSkeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <AppSkeleton key={i} className="h-48 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Nos Agences</h1>
          <p className="mt-1 text-sm text-gray-500">
            Retrouvez toutes nos agences et leurs coordonnees.
          </p>
        </div>

        {agencies.length === 0 ? (
          <AppCard>
            <div className="flex flex-col items-center py-12">
              <Building2 className="h-10 w-10 text-gray-300" />
              <p className="mt-3 text-sm font-medium text-gray-400">
                Aucune agence disponible.
              </p>
            </div>
          </AppCard>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {agencies.map((agency) => (
              <AppCard
                key={agency.id}
                className="hover:shadow-elevated transition-shadow"
              >
                <div className="space-y-4">
                  {/* Header */}
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-50">
                      <Building2 className="h-5 w-5 text-primary-600" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-gray-900">
                        {agency.name}
                      </h3>
                      <p className="text-xs text-gray-500">{agency.city}</p>
                    </div>
                  </div>

                  {/* Details */}
                  <div className="space-y-2">
                    <div className="flex items-start gap-2">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                      <span className="text-sm text-gray-600">
                        {agency.address}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 shrink-0 text-gray-400" />
                      <a
                        href={`tel:${agency.phone}`}
                        className="text-sm text-gray-600 hover:text-primary-600 transition-colors"
                      >
                        {agency.phone}
                      </a>
                    </div>
                  </div>

                  {/* Maps link */}
                  <a
                    href={getMapsUrl(agency)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <AppButton
                      variant="outline"
                      size="sm"
                      className="w-full"
                    >
                      <MapPin className="h-4 w-4" />
                      Voir sur Google Maps
                      <ExternalLink className="h-3 w-3" />
                    </AppButton>
                  </a>
                </div>
              </AppCard>
            ))}
          </div>
        )}
      </div>
    </PageTransition>
  );
}
