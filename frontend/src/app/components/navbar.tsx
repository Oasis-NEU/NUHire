'use client';
import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import NotesPage from '../components/note';
import { useRouter, usePathname } from 'next/navigation';

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const pathname = usePathname();
  const router = useRouter();

  const progressStepPages = [
    '/jobdes',
    '/res-review',
    '/res-review-group',
    '/interview-stage',
    '/makeOffer',
  ];

  const showHelpButton = progressStepPages.includes(pathname);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleShowInstructions = () => {
    window.dispatchEvent(new CustomEvent('showInstructions'));
  };

  return (
    <nav className="sticky top-0 z-50 navbar w-full relative">
      {/* Top bar - reduced height only */}
      <div className="bg-black text-white flex items-center px-4 py-1 border-b border-neu-red w-full relative">
        <button
          className="flex items-center gap-1 font-bold text-sm focus:outline-none"
          onClick={() => setIsOpen((open) => !open)}
        >
          <span>Menu</span>
          <span
            className={`transform transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
          >
            ▶
          </span>
        </button>
        <div className="absolute left-1/2 transform -translate-x-1/2">
          <Link href="/dashboard" className="text-2xl font-bold text-neu-red drop-shadow-lg">
            NUHire
          </Link>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          {/* Help button - smaller */}
          {showHelpButton && (
            <div className="bg-neu-red text-white px-3 py-1 rounded-md hover:bg-white border-2 border-black transition text-sm">
              <button onClick={handleShowInstructions} className="w-full">
                Instructions
              </button>
            </div>
          )}
          <div className="w-40 flex items-center">
            <NotesPage />
          </div>
          <Link
            href="/userProfile"
            className="flex items-center justify-center w-8 h-8 rounded-full bg-neu-red cursor-pointer transition duration-300 ease-in-out hover:bg-black hover:border-2 hover:border-neu-red relative"
          >
            <div
              className="w-5 h-5 bg-cover bg-center rounded-full border-2 border-white"
              style={{
                backgroundImage: "url('https://cdn-icons-png.flaticon.com/512/847/847969.png')",
              }}
            >
              {' '}
            </div>
          </Link>
        </div>
      </div>
      {/* Collapsible sidebar - smaller */}
      <div
        ref={dropdownRef}
        className={`fixed top-0 left-0 z-50 bg-white shadow-lg transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : '-translate-x-full'} w-36 border-r-2 border-neu-red`}
        style={{
          borderTopRightRadius: isOpen ? '0.5rem' : '0',
          borderBottomRightRadius: isOpen ? '0.5rem' : '0',
          height: '180px',
          top: '0',
        }}
      >
        <div className="flex flex-col gap-1 pt-4 px-3">
          <div className="flex items-center justify-between mb-1">
            <span className="font-bold text-base text-neu-red">Menu</span>
            <button
              className="text-lg text-gray-500 hover:text-neu-red"
              onClick={() => setIsOpen(false)}
              aria-label="Close menu"
            >
              ✕
            </button>
          </div>
          <button
            className="block px-3 py-1 text-sm text-black hover:bg-neu-red hover:text-white rounded-md text-left"
            onClick={() => {
              setIsOpen(false);
              router.push('/dashboard');
            }}
          >
            Dashboard
          </button>
          <button
            className="block px-3 py-1 text-sm text-neu-red hover:bg-neu-red hover:text-white rounded-md text-left"
            onClick={() => {
              setIsOpen(false);
              router.push('/userProfile');
            }}
          >
            Profile
          </button>
          <button
            className="block px-3 py-1 text-sm text-neu-red hover:bg-neu-red hover:text-white rounded-md text-left"
            onClick={() => {
              setIsOpen(false);
              router.push('/notes');
            }}
          >
            Notes
          </button>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
