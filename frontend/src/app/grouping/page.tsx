'use client';
import { useState } from 'react';
import NavbarAdmin from '../components/navbar-admin';
import Tabs from '../components/tabs';
import { StudentCSVTab } from '../components/StudentCSVTab';
import { ManageGroupsTab } from '../components/ManageGroupsTab';
import { useAuth } from '../components/AuthContext';
import { PageLoader } from '../components/spinner';

const PANEL_CLASS =
  'w-full max-h-[calc(100vh-200px)] overflow-y-auto border-4 border-black rounded-lg';

const Grouping = () => {
  const { user, loading: userloading } = useAuth();
  const [tab, setTab] = useState<'manage' | 'csv'>('manage');

  if (userloading) {
    return <PageLoader />;
  }

  if (!user || user.affiliation !== 'admin') {
    return <div>This account is not authorized for this page</div>;
  }

  return (
    <div className="flex flex-col h-screen bg-white">
      <NavbarAdmin />
      <div className="flex-1 p-4 overflow-hidden flex flex-col">
        <Tabs
          selected={tab}
          onSelect={setTab}
          tabs={[
            {
              id: 'manage',
              label: 'Manage Groups',
              content: (
                <div className={PANEL_CLASS}>
                  <ManageGroupsTab />
                </div>
              ),
            },
            {
              id: 'csv',
              label: 'CSV Group Assignment',
              content: (
                <div className={PANEL_CLASS}>
                  <StudentCSVTab />
                </div>
              ),
            },
          ]}
        />
      </div>
    </div>
  );
};

export default Grouping;
