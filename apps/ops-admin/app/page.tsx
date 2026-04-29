'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthenticated } from '@/lib/api';

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    void (async () => {
      const ok = await isAuthenticated();
      router.replace(ok ? '/dashboard' : '/login');
    })();
  }, [router]);
  return null;
}
