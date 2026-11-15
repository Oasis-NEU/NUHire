'use client';
export const dynamic = 'force-dynamic';
import React from 'react';
import Navbar from '../components/navbar';
import NotesEditor from '../components/NotesEditor';
import { useAuth } from '../components/AuthContext';
import { PageLoader } from '../components/spinner';

const NotesPage: React.FC = () => {
  const { loading } = useAuth();

  if (loading) {
    return <PageLoader />;
  }

  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <div className="container mx-auto py-8 px-4">
        <h1 className="text-3xl font-bold text-neu-red mb-6 text-center">My Notes</h1>
        <div className="mx-auto flex h-[70vh] max-w-2xl flex-col rounded-2xl border border-gray-200 bg-white p-5 shadow-[0_6px_18px_rgba(20,22,27,0.06),0_1px_2px_rgba(20,22,27,0.04)]">
          <NotesEditor />
        </div>
      </div>
    </div>
  );
};

export default NotesPage;
