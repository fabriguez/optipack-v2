'use client';

import { Bell } from 'lucide-react';
import { TenantNotificationConfig } from '@/components/settings/TenantNotificationConfig';

export default function NotificationSettingsPage() {
  return (
    <div className="space-y-5 p-4 sm:p-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
          <Bell className="h-6 w-6 text-primary-600" />
          Notifications
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Configurez les canaux de notification et les templates de messages envoyés à vos clients.
          Les modifications s&apos;appliquent à tous les clients du tenant.
        </p>
      </header>
      <TenantNotificationConfig />
    </div>
  );
}
