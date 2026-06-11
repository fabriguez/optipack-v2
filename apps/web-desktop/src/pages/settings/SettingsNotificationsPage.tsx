import { Bell } from 'lucide-react';
import { NotificationPrefsForm } from '@/components/profile/NotificationPrefsForm';

export default function SettingsNotificationsPage() {
  return (
    <div className="space-y-5 p-4 sm:p-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
          <Bell className="h-6 w-6 text-primary-600" />
          Preferences de notification
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Choisissez par evenement quels canaux vous souhaitez recevoir. Sans modification, vous recevez
          sur tous les canaux disponibles.
        </p>
      </header>

      <NotificationPrefsForm />
    </div>
  );
}
