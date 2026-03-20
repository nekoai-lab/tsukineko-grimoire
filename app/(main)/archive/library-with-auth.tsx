'use client';

import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { getClientAuth } from '@/lib/firebase';
import { ArchiveLibrary } from '@/components/features/archive-library';
import { useRouter } from 'next/navigation';

export default function LibraryWithAuth() {
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(getClientAuth(), user => {
      if (user) {
        setUserId(user.uid);
      } else {
        router.push('/login');
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100dvh-52px)]">
        <div className="text-purple-300/40 text-sm">魔導書を開いています...</div>
      </div>
    );
  }

  if (!userId) return null;

  return <ArchiveLibrary userId={userId} />;
}
