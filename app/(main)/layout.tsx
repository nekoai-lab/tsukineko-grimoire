import MainNav from '@/components/main-nav';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      <MainNav />
      <main className="flex-1 relative">
        {children}
      </main>
    </div>
  );
}
