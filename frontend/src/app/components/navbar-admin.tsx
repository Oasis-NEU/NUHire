'use client';
import React, { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from './AuthContext';
import { useLogout } from './useLogout';
import { PROFESSOR_MENU, PROFESSOR_TABS, isActiveTab } from './professorNav';

const NavbarAdmin = () => {
  const pathname = usePathname() ?? '';
  const { user } = useAuth();
  const logout = useLogout();
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutFailed, setLogoutFailed] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [menuOpen]);

  const name = [user?.f_name, user?.l_name].filter(Boolean).join(' ') || user?.email || '';
  const initial = (user?.f_name || user?.email || '?').charAt(0).toUpperCase();

  const handleLogout = async () => {
    setLoggingOut(true);
    setLogoutFailed(false);
    const ok = await logout();
    if (!ok) {
      setLoggingOut(false);
      setLogoutFailed(true);
    }
  };

  return (
    <header className="relative z-40 w-full h-[72px] bg-white border-b border-gray1 flex items-center justify-between px-8">
      <div className="flex items-center gap-8 h-full">
        <Link
          href="/advisor-dashboard"
          aria-label="NUHire home"
          className="flex items-center gap-1"
        >
          <Image src="/nuhire-husky.png" alt="" width={44} height={44} priority />
          <span className="text-[32px] leading-none font-semibold tracking-tight" aria-hidden>
            <span className="text-northeasternRed">NU</span>
            <span className="text-black">Hire</span>
          </span>
        </Link>
        <nav aria-label="Professor" className="flex items-center gap-8 h-full">
          {PROFESSOR_TABS.map((tab) => {
            const active = isActiveTab(tab, pathname);
            return (
              <Link
                key={tab.path}
                href={tab.path}
                aria-current={active ? 'page' : undefined}
                className={`relative h-full flex items-center text-base ${
                  active ? 'font-semibold text-black' : 'text-gray4 hover:text-black'
                }`}
              >
                {tab.label}
                {active && (
                  <span className="absolute -bottom-px left-0 right-0 h-0.5 bg-northeasternRed" />
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      <div ref={menuRef} className="relative">
        <button
          type="button"
          aria-label="Profile menu"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
          className={`size-9 rounded-full bg-red100 text-northeasternRed text-sm font-semibold flex items-center justify-center ${
            menuOpen ? 'ring-2 ring-northeasternRed' : ''
          }`}
        >
          {initial}
        </button>

        {menuOpen && (
          <div
            role="menu"
            className="absolute right-0 top-12 w-[300px] bg-white rounded-2xl shadow-raised border border-gray1 p-2"
          >
            <div className="flex items-start gap-3 p-3">
              <span className="size-10 shrink-0 rounded-full bg-northeasternRed text-white font-semibold flex items-center justify-center">
                {initial}
              </span>
              <div className="min-w-0">
                <p className="font-semibold text-black truncate">{name}</p>
                <p className="text-sm text-gray3 truncate">{user?.email}</p>
                <span className="inline-block mt-2 px-2.5 py-0.5 rounded-full bg-red100/60 text-red700 text-xs">
                  Instructor
                </span>
              </div>
            </div>
            <div className="border-t border-gray1 my-1" />
            {PROFESSOR_MENU.map((item) => (
              <Link
                key={item.path}
                href={item.path}
                role="menuitem"
                onClick={() => setMenuOpen(false)}
                className="block px-3 py-2.5 rounded-lg text-black hover:bg-gray0"
              >
                {item.label}
              </Link>
            ))}
            <div className="border-t border-gray1 my-1" />
            <button
              type="button"
              role="menuitem"
              onClick={handleLogout}
              disabled={loggingOut}
              className="w-full text-left px-3 py-2.5 rounded-lg text-black hover:bg-gray0 disabled:text-gray2"
            >
              {loggingOut ? 'Logging out…' : 'Log out'}
            </button>
            {logoutFailed && (
              <p role="alert" className="px-3 pb-2 text-sm text-northeasternRed">
                Could not log out. Try again.
              </p>
            )}
          </div>
        )}
      </div>
    </header>
  );
};

export default NavbarAdmin;
