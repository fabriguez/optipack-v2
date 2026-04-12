'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { SocketProvider } from '@/lib/providers/SocketProvider';
import { DashboardSkeleton } from '@/components/ui/AppSkeleton';

export default function DashboardRootLayout({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login');
    }
  }, [status, router]);

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="w-full max-w-5xl p-8">
          <DashboardSkeleton />
        </div>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return null;
  }

  return (
    <SocketProvider>
      <DashboardLayout>{children}</DashboardLayout>
    </SocketProvider>
  );
}
