'use client';
import NavbarAdmin from '../components/navbar-admin';
import Tabs from '../components/tabs';
import { StudentCSVTab } from '../components/StudentCSVTab';
import { ManageGroupsTab } from '../components/ManageGroupsTab';
import { useAuth } from '../components/AuthContext';

const Grouping = () => {
  const { user, loading: userloading } = useAuth();

  if (userloading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-sand">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Loading...</h2>
          <div className="w-16 h-16 border-t-4 border-navy border-solid rounded-full animate-spin mx-auto"></div>
        </div>
      </div>
    );
  }

  if (!user || user.affiliation !== 'admin') {
    return <div>This account is not authorized for this page</div>;
  }

  return (
    <div className="flex flex-col h-screen bg-sand font-rubik">
      <NavbarAdmin />
      <div className="flex-1 p-4 overflow-hidden flex flex-col">
        <Tabs>
          <div title="Manage Groups">
            <div className="w-full max-h-[calc(100vh-200px)] overflow-y-auto border-4 border-northeasternBlack rounded-lg">
              <ManageGroupsTab />
            </div>
          </div>

          <div title="CSV Group Assignment">
            <div className="w-full max-h-[calc(100vh-200px)] overflow-y-auto border-4 border-northeasternBlack rounded-lg">
              <StudentCSVTab />
            </div>
          </div>
        </Tabs>
      </div>
    </div>
  );
};

export default Grouping;
