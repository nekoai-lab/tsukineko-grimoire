'use client';

import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { getClientAuth } from '@/lib/firebase';
import { FileUploader } from '@/components/features/file-uploader';
import { useRouter } from 'next/navigation';

export default function UploadWithAuth() {
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
      <div className="flex items-center justify-center py-16">
        <div className="text-purple-300/40 text-sm">読み込み中...</div>
      </div>
    );
  }

  if (!userId) return null;

  return <FileUploader userId={userId} onSuccess={() => router.push('/archive')} />;
}
