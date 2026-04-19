'use client';

import type { ReactNode } from 'react';
import { PageTransition } from '@/components/shared/PageTransition';
import { AppCard, AppCardHeader } from '@/components/ui/AppCard';
import { AppBadge } from '@/components/ui/AppBadge';
import { DashboardSkeleton } from '@/components/ui/AppSkeleton';
import { useDashboardStats } from '@/lib/hooks/useDashboard';
import { formatAmount } from '@transitsoftservices/shared';
import {
  Package,
  CheckCircle,
  Truck,
  Clock,
  TrendingUp,
  ArrowUpRight,
  Building2,
  CreditCard,
  AlertTriangle,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

const CHART_COLORS = ['#1B5E20', '#388E3C', '#4CAF50', '#66BB6A', '#A5D6A7', '#C8E6C9'];

export default function DashboardPage() {
  const { data, isLoading } = useDashboardStats();
  const stats = data?.data;

  if (isLoading) return <DashboardSkeleton />;

  const kpis = [
    {
      label: 'Total Colis',
      value: stats?.totalParcels ?? 0,
      icon: Package,
      color: 'bg-primary-500',
      iconBg: 'bg-primary-50',
      iconColor: 'text-primary-600',
    },
    {
      label: 'Livres',
      value: stats?.parcelsByStatus?.DELIVERED ?? 0,
      icon: CheckCircle,
      color: 'bg-primary-700',
      iconBg: 'bg-green-50',
      iconColor: 'text-green-600',
    },
    {
      label: 'En Transit',
      value: stats?.parcelsByStatus?.IN_TRANSIT ?? 0,
      icon: Truck,
      color: 'bg-amber-500',
      iconBg: 'bg-amber-50',
      iconColor: 'text-amber-600',
    },
    {
      label: 'En Attente',
      value: (stats?.parcelsByStatus?.ARRIVED ?? 0) + (stats?.parcelsByStatus?.RECEIVED ?? 0),
      icon: Clock,
      color: 'bg-blue-500',
      iconBg: 'bg-blue-50',
      iconColor: 'text-blue-600',
    },
  ];

  const pieData = Object.entries(stats?.parcelsByStatus || {}).map(([name, value]) => ({
    name: name === 'IN_STOCK' ? 'En stock' : name === 'IN_TRANSIT' ? 'En transit' : name === 'DELIVERED' ? 'Livres' : name === 'ARRIVED' ? 'Arrives' : name,
    value,
  }));

  return (
    <PageTransition>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tableau de bord</h1>
          <p className="text-sm text-gray-500 mt-1">Vue d'ensemble de vos operations.</p>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {kpis.map((kpi) => (
            <AppCard key={kpi.label} className="relative overflow-hidden group hover:shadow-elevated transition-shadow">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-gray-400">{kpi.label}</p>
                  <p className="mt-2 text-3xl font-bold text-gray-900">{kpi.value}</p>
                </div>
                <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${kpi.iconBg}`}>
                  <kpi.icon className={`h-5 w-5 ${kpi.iconColor}`} />
                </div>
              </div>
              <div className={`absolute bottom-0 left-0 h-1 w-full ${kpi.color} opacity-80`} />
            </AppCard>
          ))}
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Bar Chart */}
          <AppCard className="lg:col-span-2">
            <AppCardHeader title="Volume de colis" description="Colis enregistres cette semaine" />
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats?.parcelsChart || []} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                  <XAxis dataKey="day" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: '12px', border: '1px solid #E5E7EB', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.07)' }}
                    cursor={{ fill: '#E8F5E9', radius: 8 }}
                  />
                  <Bar dataKey="colis" fill="#4CAF50" radius={[8, 8, 0, 0]} barSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </AppCard>

          {/* Pie Chart */}
          <AppCard>
            <AppCardHeader title="Repartition" description="Par statut" />
            <div className="h-72 flex flex-col items-center justify-center">
              {pieData.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={3} dataKey="value">
                        {pieData.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ borderRadius: '12px', fontSize: '12px' }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-wrap justify-center gap-3 mt-2">
                    {pieData.map((item, i) => (
                      <div key={item.name} className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                        <span className="text-xs text-gray-600">{item.name} ({item.value as ReactNode})</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-sm text-gray-400">Aucune donnee</p>
              )}
            </div>
          </AppCard>
        </div>

        {/* Bottom Row */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Cash in agencies */}
          <AppCard>
            <AppCardHeader title="Solde caisses" action={<AppBadge variant="success">Temps reel</AppBadge>} />
            <div className="space-y-3">
              {(stats?.cashInAgencies || []).length > 0 ? (
                (stats?.cashInAgencies || []).map((agency: any) => (
                  <div key={agency.agencyId} className="flex items-center justify-between rounded-xl bg-gray-50 p-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-50">
                        <Building2 className="h-4 w-4 text-primary-600" />
                      </div>
                      <span className="text-sm font-medium text-gray-900">{agency.agencyName}</span>
                    </div>
                    <span className="text-sm font-bold text-primary-700">{formatAmount(agency.balance)}</span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-400 py-4 text-center">Pas de caisses ouvertes</p>
              )}
            </div>
          </AppCard>

          {/* Revenue */}
          <AppCard>
            <AppCardHeader title="Chiffre d'affaires" description="Total transfere au siege" />
            <div className="flex flex-col items-center py-4">
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary-50 mb-3">
                <CreditCard className="h-8 w-8 text-primary-600" />
              </div>
              <p className="text-3xl font-bold text-gray-900">{formatAmount(stats?.totalRevenue ?? 0)}</p>
              <p className="text-xs text-gray-400 mt-1">Montant confirme</p>
            </div>
          </AppCard>

          {/* Debts */}
          <AppCard>
            <AppCardHeader title="Dettes clients" action={<AppBadge variant="warning">A recouvrer</AppBadge>} />
            <div className="flex flex-col items-center py-4">
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-red-50 mb-3">
                <AlertTriangle className="h-8 w-8 text-red-500" />
              </div>
              <p className="text-3xl font-bold text-red-600">{formatAmount(stats?.outstandingDebts ?? 0)}</p>
              <p className="text-xs text-gray-400 mt-1">Montant en souffrance</p>
            </div>
          </AppCard>
        </div>

        {/* Top Clients */}
        {(stats?.topClients || []).length > 0 && (
          <AppCard>
            <AppCardHeader title="Meilleurs clients" description="Par total depense" />
            <div className="space-y-2">
              {stats.topClients.map((client: any, i: number) => (
                <div key={client.clientId} className="flex items-center justify-between rounded-xl p-3 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-50 text-sm font-bold text-primary-700">
                      {i + 1}
                    </span>
                    <span className="text-sm font-medium text-gray-900">{client.clientName}</span>
                  </div>
                  <span className="text-sm font-bold text-gray-900">{formatAmount(client.totalSpent)}</span>
                </div>
              ))}
            </div>
          </AppCard>
        )}
      </div>
    </PageTransition>
  );
}
