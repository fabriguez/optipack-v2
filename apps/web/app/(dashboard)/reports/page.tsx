'use client';

import { BarChart3, Download, FileSpreadsheet, FileText } from 'lucide-react';
import { PageTransition } from '@/components/shared/PageTransition';
import { AppCard, AppCardHeader } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';

const REPORTS = [
  { id: 'parcels', title: 'Rapport des colis', description: 'Liste de tous les colis avec statuts et montants', icon: FileText },
  { id: 'payments', title: 'Rapport des paiements', description: 'Historique complet des paiements par agence', icon: FileSpreadsheet },
  { id: 'revenue', title: 'Chiffre d\'affaires', description: 'CA par agence, par periode, par mode de transit', icon: BarChart3 },
  { id: 'debts', title: 'Rapport des dettes', description: 'Clients debiteurs avec echeanciers', icon: FileText },
  { id: 'cash-flow', title: 'Flux de tresorerie', description: 'Entrees, sorties et soldes par agence', icon: FileSpreadsheet },
  { id: 'penalties', title: 'Rapport des penalites', description: 'Penalites appliquees et montants', icon: FileText },
];

export default function ReportsPage() {
  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Rapports</h1>
          <p className="text-sm text-gray-500 mt-1">Generation et export de rapports.</p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {REPORTS.map((report) => (
            <AppCard key={report.id}>
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50">
                  <report.icon className="h-5 w-5 text-primary-600" />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-gray-900">{report.title}</h3>
                  <p className="text-xs text-gray-500 mt-1">{report.description}</p>
                  <div className="flex gap-2 mt-3">
                    <AppButton size="sm" variant="outline">
                      <Download className="h-3 w-3" />
                      Excel
                    </AppButton>
                    <AppButton size="sm" variant="outline">
                      <Download className="h-3 w-3" />
                      PDF
                    </AppButton>
                  </div>
                </div>
              </div>
            </AppCard>
          ))}
        </div>
      </div>
    </PageTransition>
  );
}
