'use client';

import { PageTransition } from '@/components/shared/PageTransition';
import { SupportChat } from '@/components/support/SupportChat';

export default function PortalSupportPage() {
  return (
    <PageTransition>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Support client</h1>
          <p className="mt-1 text-sm text-gray-500">
            Echangez en direct avec votre agence pour toutes questions.
          </p>
        </div>
        <div className="h-[600px] overflow-hidden rounded-2xl border border-gray-100">
          <SupportChat />
        </div>
      </div>
    </PageTransition>
  );
}
