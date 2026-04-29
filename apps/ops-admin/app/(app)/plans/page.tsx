'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface Plan {
  id: string;
  name: string;
  cpuCores: number;
  memoryMb: number;
  diskGb: number;
  pricePerMonth: string;
  currency: string;
  isActive: boolean;
}

export default function PlansPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['plans'],
    queryFn: async (): Promise<Plan[]> => (await api.get('/plans')).data?.data ?? [],
  });
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Plans de ressources</h1>
      <div className="rounded-lg border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="px-4 py-2 text-left font-normal">Nom</th>
              <th className="px-4 py-2 text-left font-normal">CPU</th>
              <th className="px-4 py-2 text-left font-normal">RAM (MB)</th>
              <th className="px-4 py-2 text-left font-normal">Disk (GB)</th>
              <th className="px-4 py-2 text-left font-normal">Prix / mois</th>
              <th className="px-4 py-2 text-left font-normal">Actif</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} className="p-4 text-center text-gray-400">
                  Chargement...
                </td>
              </tr>
            )}
            {(data ?? []).map((p) => (
              <tr key={p.id} className="border-t">
                <td className="px-4 py-2">{p.name}</td>
                <td className="px-4 py-2">{p.cpuCores}</td>
                <td className="px-4 py-2">{p.memoryMb}</td>
                <td className="px-4 py-2">{p.diskGb}</td>
                <td className="px-4 py-2">
                  {p.pricePerMonth} {p.currency}
                </td>
                <td className="px-4 py-2">{p.isActive ? 'oui' : 'non'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
