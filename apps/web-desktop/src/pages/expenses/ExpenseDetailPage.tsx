import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft, Receipt, Building2, UserCircle, Tag, FileText, Calendar } from 'lucide-react';
import { PageTransition } from '@/components/shared/PageTransition';
import { AppCard } from '@/components/ui/AppCard';
import { AppBadge } from '@/components/ui/AppBadge';
import { DashboardSkeleton } from '@/components/ui/AppSkeleton';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { formatAmount, formatDate } from '@transitsoftservices/shared';
import { AttachmentsCard } from '@/components/shared/AttachmentsCard';

export default function ExpenseDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['expenses', id],
    queryFn: () => apiClient.get(`/expenses/${id}`).then((r) => r.data),
    enabled: !!id,
  });

  const expense = data?.data;
  if (isLoading) return <DashboardSkeleton />;
  if (!expense) return <p className="p-6 text-gray-500">Depense introuvable</p>;

  return (
    <PageTransition>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="rounded-xl p-2 hover:bg-gray-100 transition-colors">
            <ArrowLeft className="h-5 w-5 text-gray-500" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">{expense.title}</h1>
              {expense.category && <AppBadge variant="info">{expense.category}</AppBadge>}
            </div>
            <p className="text-sm text-gray-500 mt-0.5">Enregistree le {formatDate(expense.createdAt)}</p>
          </div>
        </div>

        {/* Amount card */}
        <AppCard>
          <div className="text-center py-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Montant de la depense</p>
            <p className="text-3xl font-bold text-gray-900">{formatAmount(Number(expense.amount))}</p>
          </div>
        </AppCard>

        {/* Info cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <AppCard>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50">
                <Building2 className="h-5 w-5 text-primary-600" />
              </div>
              <div>
                <p className="text-xs text-gray-400">Agence</p>
                {expense.agency ? (
                  <Link to={`/agencies/${expense.agency.id}`} className="text-sm font-medium text-primary-700 hover:underline">
                    {expense.agency.name}
                  </Link>
                ) : (
                  <p className="text-sm font-medium text-gray-900">{expense.agencyId}</p>
                )}
              </div>
            </div>
          </AppCard>

          <AppCard>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50">
                <UserCircle className="h-5 w-5 text-primary-600" />
              </div>
              <div>
                <p className="text-xs text-gray-400">Approuve par</p>
                <p className="text-sm font-medium text-gray-900">
                  {expense.approvedBy?.firstName
                    ? `${expense.approvedBy.firstName} ${expense.approvedBy.lastName}`
                    : expense.approvedByUserId || 'Non approuve'}
                </p>
              </div>
            </div>
          </AppCard>

          <AppCard>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50">
                <Calendar className="h-5 w-5 text-primary-600" />
              </div>
              <div>
                <p className="text-xs text-gray-400">Date</p>
                <p className="text-sm font-medium text-gray-900">{formatDate(expense.createdAt)}</p>
              </div>
            </div>
          </AppCard>
        </div>

        {/* Details */}
        <AppCard>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Details</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <InfoRow icon={FileText} label="Titre" value={expense.title} />
            <InfoRow icon={Tag} label="Motif" value={expense.reason} />
            {expense.description && <InfoRow icon={FileText} label="Description" value={expense.description} />}
            {expense.category && <InfoRow icon={Tag} label="Categorie" value={expense.category} />}
            <InfoRow icon={Receipt} label="Montant" value={formatAmount(Number(expense.amount))} />
          </div>
        </AppCard>

        <AttachmentsCard parentType="expense" parentId={id} readonly={!!expense.isPaid} />
      </div>
    </PageTransition>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-gray-50 p-3">
      <Icon className="h-4 w-4 text-gray-400 shrink-0" />
      <div>
        <p className="text-[10px] uppercase tracking-wider text-gray-400">{label}</p>
        <p className="text-sm font-medium text-gray-900">{value}</p>
      </div>
    </div>
  );
}
