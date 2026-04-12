'use client';

import { Settings, Globe, DollarSign, Bell, Shield } from 'lucide-react';
import { PageTransition } from '@/components/shared/PageTransition';
import { AppCard, AppCardHeader } from '@/components/ui/AppCard';
import { AppInput } from '@/components/ui/AppInput';
import { AppButton } from '@/components/ui/AppButton';
import { AppSelect } from '@/components/ui/AppSelect';

export default function SettingsPage() {
  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Parametres</h1>
          <p className="text-sm text-gray-500 mt-1">Configuration du systeme.</p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* General */}
          <AppCard>
            <AppCardHeader title="General" />
            <div className="space-y-4">
              <AppInput label="Nom de l'entreprise" defaultValue="OptiPack" />
              <AppInput label="Email de contact" defaultValue="contact@optipack.com" />
              <AppInput label="Telephone" defaultValue="+237600000000" />
              <AppButton>Enregistrer</AppButton>
            </div>
          </AppCard>

          {/* Devises */}
          <AppCard>
            <AppCardHeader title="Devises" />
            <div className="space-y-4">
              <AppSelect
                label="Devise par defaut"
                options={[
                  { value: 'XAF', label: 'Franc CFA (XAF)' },
                  { value: 'EUR', label: 'Euro (EUR)' },
                  { value: 'USD', label: 'Dollar US (USD)' },
                ]}
                defaultValue="XAF"
              />
              <AppInput label="Taux EUR -> XAF" type="number" defaultValue="655.957" />
              <AppButton>Enregistrer</AppButton>
            </div>
          </AppCard>

          {/* Penalites */}
          <AppCard>
            <AppCardHeader title="Penalites" />
            <div className="space-y-4">
              <AppInput label="Jours de grace" type="number" defaultValue="10" />
              <AppInput label="Taux journalier (XAF)" type="number" defaultValue="500" />
              <AppButton>Enregistrer</AppButton>
            </div>
          </AppCard>

          {/* Notifications */}
          <AppCard>
            <AppCardHeader title="Notifications" />
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-xl border border-gray-200 p-3">
                <span className="text-sm text-gray-700">Email a chaque mise a jour colis</span>
                <input type="checkbox" defaultChecked className="h-4 w-4 rounded text-primary-500" />
              </div>
              <div className="flex items-center justify-between rounded-xl border border-gray-200 p-3">
                <span className="text-sm text-gray-700">SMS a l'arrivee du colis</span>
                <input type="checkbox" defaultChecked className="h-4 w-4 rounded text-primary-500" />
              </div>
              <div className="flex items-center justify-between rounded-xl border border-gray-200 p-3">
                <span className="text-sm text-gray-700">WhatsApp pour les penalites</span>
                <input type="checkbox" className="h-4 w-4 rounded text-primary-500" />
              </div>
              <AppButton>Enregistrer</AppButton>
            </div>
          </AppCard>
        </div>
      </div>
    </PageTransition>
  );
}
