import { useState } from 'react';
import { ResourceListScreen } from '@/components/data/ResourceListScreen';
import { ListRow } from '@/components/data/ListRow';
import { apiClient } from '@/lib/api/client';
import { formatAmount } from '@transitsoftservices/shared';
import { ExpenseFormDialog } from './ExpenseFormDialog';

interface Expense {
  id: string;
  label?: string | null;
  amount: number | string;
  category?: string | { name?: string } | null;
  agency?: { name?: string } | null;
  createdAt?: string;
}

function categoryName(c: Expense['category']): string {
  if (!c) return '';
  if (typeof c === 'string') return c;
  return c.name ?? '';
}

export default function ExpensesScreen() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <ResourceListScreen<Expense>
        title="Depenses"
        subtitle="Frais et achats"
        queryKey={['expenses']}
        fetcher={(params) => apiClient.get('/expenses', { params }).then((r) => r.data)}
        keyExtractor={(e) => e.id}
        createPermission="expense.create"
        onCreate={() => setOpen(true)}
        renderRow={(e) => (
          <ListRow
            title={e.label ?? e.id.slice(0, 8)}
            subtitle={categoryName(e.category)}
            metadata={[e.agency?.name ?? '', e.createdAt?.slice(0, 10) ?? '']}
            rightLabel={formatAmount(Number(e.amount))}
          />
        )}
      />
      <ExpenseFormDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
