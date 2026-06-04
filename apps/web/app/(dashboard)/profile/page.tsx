'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserCircle, KeyRound, Bell, Save } from 'lucide-react';
import { toast } from 'sonner';
import { profileApi, type MyProfile } from '@/lib/api/profile';
import { resolveImageUrl } from '@/lib/api/imageUrl';
import { AppCard } from '@/components/ui/AppCard';
import { AppButton } from '@/components/ui/AppButton';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppInput } from '@/components/ui/AppInput';
import { AppAvatar } from '@/components/ui/AppAvatar';
import { AppTabs } from '@/components/ui/AppTabs';
import { DashboardSkeleton } from '@/components/ui/AppSkeleton';
import { ImageUrlField } from '@/components/shared/ImageUrlField';
import { NotificationPrefsForm } from '@/components/profile/NotificationPrefsForm';

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: 'Super admin',
  ADMIN: 'Administrateur',
  MANAGER: 'Manager',
  ACCOUNTANT: 'Comptable',
  AGENT: 'Agent',
  CHEF_AGENCE: "Chef d'agence",
  PERSONNEL: 'Personnel',
};

export default function ProfilePage() {
  const { data: me, isLoading } = useQuery({
    queryKey: ['me', 'profile'],
    queryFn: () => profileApi.me(),
  });

  if (isLoading) return <DashboardSkeleton />;
  if (!me) {
    return (
      <div className="p-4 sm:p-6">
        <AppCard>
          <p className="py-8 text-center text-sm text-gray-500">
            Impossible de charger votre profil. Reessayez.
          </p>
        </AppCard>
      </div>
    );
  }

  const fullName = `${me.firstName} ${me.lastName}`.trim();

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <AppCard>
        <div className="flex flex-wrap items-center gap-4">
          <AppAvatar src={resolveImageUrl(me.avatarUrl)} fallback={fullName} size="xl" />
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold">{fullName || 'Mon profil'}</h1>
              <AppBadge variant="success">{ROLE_LABEL[me.role] ?? me.role}</AppBadge>
            </div>
            <p className="text-sm text-gray-600">{me.email}</p>
          </div>
        </div>
      </AppCard>

      <AppTabs
        tabs={[
          { value: 'infos', label: 'Mes informations', icon: <UserCircle className="h-4 w-4" />, content: <InfosTab me={me} /> },
          { value: 'security', label: 'Securite', icon: <KeyRound className="h-4 w-4" />, content: <SecurityTab /> },
          { value: 'notifications', label: 'Notifications', icon: <Bell className="h-4 w-4" />, content: <NotificationPrefsForm /> },
        ]}
      />
    </div>
  );
}

function InfosTab({ me }: { me: MyProfile }) {
  const qc = useQueryClient();
  const [firstName, setFirstName] = useState(me.firstName);
  const [lastName, setLastName] = useState(me.lastName);
  const [phone, setPhone] = useState(me.phone ?? '');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(me.avatarUrl);

  // Re-sync si le cache se rafraichit (ex: apres save).
  useEffect(() => {
    setFirstName(me.firstName);
    setLastName(me.lastName);
    setPhone(me.phone ?? '');
    setAvatarUrl(me.avatarUrl);
  }, [me.firstName, me.lastName, me.phone, me.avatarUrl]);

  const dirty =
    firstName.trim() !== me.firstName ||
    lastName.trim() !== me.lastName ||
    (phone.trim() || '') !== (me.phone ?? '') ||
    (avatarUrl ?? null) !== (me.avatarUrl ?? null);

  const save = useMutation({
    mutationFn: () =>
      profileApi.update({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim() || null,
        avatarUrl: avatarUrl || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['me'] });
      toast.success('Profil mis a jour');
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Echec de la mise a jour'),
  });

  return (
    <AppCard>
      <div className="grid gap-6 sm:grid-cols-[200px_1fr]">
        <ImageUrlField
          label="Photo de profil"
          hint="JPG, PNG ou WEBP. Max 5 Mo."
          value={resolveImageUrl(avatarUrl)}
          onChange={setAvatarUrl}
          cameraFacing="user"
          height={160}
        />

        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <AppInput label="Prenom" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            <AppInput label="Nom" value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
          <AppInput label="Telephone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+228 ..." />
          <AppInput
            label="Email"
            value={me.email}
            disabled
            readOnly
            title="L'email ne peut pas etre modifie ici"
          />
          <p className="-mt-2 text-xs text-gray-500">
            L&apos;email est votre identifiant de connexion et ne peut pas etre modifie. Contactez un
            administrateur si besoin.
          </p>
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <AppButton
          onClick={() => save.mutate()}
          loading={save.isPending}
          disabled={!dirty || !firstName.trim() || !lastName.trim()}
        >
          <Save className="h-4 w-4" />
          Enregistrer
        </AppButton>
      </div>
    </AppCard>
  );
}

function SecurityTab() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');

  const change = useMutation({
    mutationFn: () => profileApi.changePassword(current, next),
    onSuccess: () => {
      toast.success('Mot de passe change. Reconnectez-vous sur vos autres appareils.');
      setCurrent('');
      setNext('');
      setConfirmPwd('');
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Erreur'),
  });

  const submit = () => {
    if (next !== confirmPwd) {
      toast.error('Les mots de passe ne correspondent pas');
      return;
    }
    if (next.length < 6) {
      toast.error('Au moins 6 caracteres');
      return;
    }
    change.mutate();
  };

  return (
    <AppCard>
      <h3 className="mb-3 text-base font-semibold">Changer mon mot de passe</h3>
      <div className="grid max-w-md gap-3">
        <AppInput label="Mot de passe actuel" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        <AppInput label="Nouveau mot de passe" type="password" value={next} onChange={(e) => setNext(e.target.value)} minLength={6} />
        <AppInput label="Confirmer" type="password" value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)} />
        <div className="flex justify-end">
          <AppButton onClick={submit} loading={change.isPending} disabled={!current || !next || !confirmPwd}>
            <KeyRound className="h-4 w-4" />
            Mettre a jour
          </AppButton>
        </div>
      </div>
      <p className="mt-3 text-xs text-gray-500">
        Apres changement, vous serez deconnecte sur les autres appareils. Connectez-vous a nouveau avec le
        nouveau mot de passe.
      </p>
    </AppCard>
  );
}
