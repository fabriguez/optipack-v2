'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';

interface OpsAdmin {
  id: string;
  email: string;
  role: string;
  isActive: boolean;
  twoFactorEnabled: boolean;
  lastLoginAt: string | null;
}

export default function OpsAdminsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['ops-admins'],
    queryFn: async (): Promise<OpsAdmin[]> =>
      (await api.get('/ops-admins')).data?.data ?? [],
  });
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Ops Admins</h1>
      <div className="rounded-lg border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="px-4 py-2 text-left font-normal">Email</th>
              <th className="px-4 py-2 text-left font-normal">Role</th>
              <th className="px-4 py-2 text-left font-normal">2FA</th>
              <th className="px-4 py-2 text-left font-normal">Actif</th>
              <th className="px-4 py-2 text-left font-normal">Dernier login</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5} className="p-4 text-center text-gray-400">
                  Chargement...
                </td>
              </tr>
            )}
            {(data ?? []).map((a) => (
              <tr key={a.id} className="border-t">
                <td className="px-4 py-2">{a.email}</td>
                <td className="px-4 py-2">{a.role}</td>
                <td className="px-4 py-2">{a.twoFactorEnabled ? 'oui' : 'non'}</td>
                <td className="px-4 py-2">{a.isActive ? 'oui' : 'non'}</td>
                <td className="px-4 py-2 text-xs text-gray-500">
                  {formatDate(a.lastLoginAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
