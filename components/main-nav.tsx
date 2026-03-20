'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function MainNav() {
  const pathname = usePathname();

  return (
    <nav className="glass-panel border-x-0 border-t-0 rounded-none px-4 py-3 flex items-center justify-between sticky top-0 z-50">
      <Link href="/grimoire" className="flex items-center gap-2 flex-shrink-0">
        <span className="text-xl">🌙</span>
        <span className="magic-title text-lg font-bold hidden sm:block">Tsukineko Grimoire</span>
        <span className="magic-title text-base font-bold sm:hidden">Grimoire</span>
      </Link>

      <div className="flex items-center gap-0.5 sm:gap-1">
        <NavLink pathname={pathname} href="/grimoire"        emoji="🔮" label="Consult" />
        <NavLink pathname={pathname} href="/archive"         emoji="📚" label="Archive" />
        <NavLink pathname={pathname} href="/archive/upload"  emoji="⬆️" label="Upload" />
        <NavLink pathname={pathname} href="/settings"        emoji="⚙️"  label="Settings" />
      </div>
    </nav>
  );
}

function NavLink({
  pathname,
  href,
  emoji,
  label,
}: {
  pathname: string;
  href: string;
  emoji: string;
  label: string;
}) {
  const isActive =
    href === '/archive/upload'
      ? pathname === href
      : href === '/archive'
      ? pathname === '/archive'
      : pathname === href || pathname.startsWith(href + '/');

  return (
    <Link
      href={href}
      className={`
        flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm transition-all duration-200
        ${isActive
          ? 'bg-purple-700/30 text-purple-200 border border-purple-500/30'
          : 'text-purple-200/60 hover:text-purple-200 hover:bg-purple-700/20'}
      `}
    >
      <span>{emoji}</span>
      <span className="hidden md:inline">{label}</span>
    </Link>
  );
}
