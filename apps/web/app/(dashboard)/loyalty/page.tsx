'use client';

import { PageTransition } from '@/components/shared/PageTransition';
import { AppCard, AppCardHeader } from '@/components/ui/AppCard';
import { AppBadge } from '@/components/ui/AppBadge';
import { useClients } from '@/lib/hooks/useClients';
import { Star } from 'lucide-react';
import { formatAmount } from '@transitsoftservices/shared';

const TIER_CONFIG: Record<string, { variant: 'default' | 'info' | 'warning' | 'success'; min: number }> = {
  STANDARD: { variant: 'default', min: 0 },
  SILVER: { variant: 'info', min: 500 },
  GOLD: { variant: 'warning', min: 2000 },
  VIP: { variant: 'success', min: 5000 },
};

export default function LoyaltyPage() {
  const { data, isLoading } = useClients({ limit: 50, sortBy: 'loyaltyPoints', sortOrder: 'desc' });

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Programme de fidelite</h1>
          <p className="text-sm text-gray-500 mt-1">Classement des clients par points de fidelite.</p>
        </div>

        {/* Tiers overview */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          {Object.entries(TIER_CONFIG).map(([tier, config]) => (
            <AppCard key={tier}>
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-500">{tier}</p>
                <AppBadge variant={config.variant}>{config.min}+ pts</AppBadge>
              </div>
              <p className="mt-2 text-2xl font-bold text-gray-900">
                {(data?.data || []).filter((c: any) => c.loyaltyTier === tier).length}
              </p>
              <p className="text-xs text-gray-500">clients</p>
            </AppCard>
          ))}
        </div>

        {/* Client ranking */}
        <AppCard>
          <AppCardHeader title="Classement clients" description="Top clients par points de fidelite" />
          <div className="space-y-2">
            {isLoading ? (
              <p className="text-sm text-gray-400 py-8 text-center">Chargement...</p>
            ) : (
              (data?.data || []).slice(0, 20).map((client: any, i: number) => (
                <div key={client.id} className="flex items-center justify-between rounded-xl p-3 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-4">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-50 text-sm font-bold text-primary-700">
                      {i + 1}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{client.fullName}</p>
                      <p className="text-xs text-gray-500">{client.phone}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-sm font-semibold text-gray-900">{client.loyaltyPoints} pts</p>
                      <p className="text-xs text-gray-500">{formatAmount(Number(client.totalSpent))} depense</p>
                    </div>
                    <AppBadge variant={TIER_CONFIG[client.loyaltyTier]?.variant || 'default'}>
                      {client.loyaltyTier}
                    </AppBadge>
                  </div>
                </div>
              ))
            )}
          </div>
        </AppCard>
      </div>
    </PageTransition>
  );
}
