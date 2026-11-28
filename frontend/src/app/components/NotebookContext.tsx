'use client';

import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from './AuthContext';
import { useSocket } from './socketContext';
import { dropOtherUsersKeys, userScope } from '../../lib/userStorage';
import type { JobUpdatedEvent } from '../../types';

export const NOTEBOOK_TABS = [
  { id: 'notes', label: 'Notes' },
  { id: 'job', label: 'Job' },
  { id: 'resumes', label: 'Resumes' },
] as const;

export type NotebookTab = (typeof NOTEBOOK_TABS)[number]['id'];

// Saved per student: every step change is a full page load, and lab browsers
// are shared.
interface Saved {
  open: boolean;
  tab: NotebookTab;
  draft: string;
}

const DEFAULTS: Saved = { open: true, tab: 'notes', draft: '' };

const PREFIX = 'notebook';
const storageKey = (userId: string) => `${userScope(PREFIX, userId)}state`;

function readSaved(userId: string): Saved {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return DEFAULTS;
    const parsed: Partial<Saved> = JSON.parse(raw);
    return {
      open: typeof parsed.open === 'boolean' ? parsed.open : DEFAULTS.open,
      tab: NOTEBOOK_TABS.find(({ id }) => id === parsed.tab)?.id ?? DEFAULTS.tab,
      draft: typeof parsed.draft === 'string' ? parsed.draft : DEFAULTS.draft,
    };
  } catch {
    return DEFAULTS;
  }
}

const writeSaved = (userId: string, saved: Saved) =>
  localStorage.setItem(storageKey(userId), JSON.stringify(saved));

interface NotebookState extends Saved {
  // False until the signed-in student's saved state is read. Nothing renders
  // before then, so the panel never flashes open for a student who hid it.
  ready: boolean;
  setOpen: (open: boolean) => void;
  setTab: (tab: NotebookTab) => void;
  setDraft: (draft: string) => void;
}

const NotebookContext = createContext<NotebookState | undefined>(undefined);

export function NotebookProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const socket = useSocket();
  const userId = user ? String(user.id) : null;
  // The state and the student it belongs to change together, so one student's
  // state can never be written under another's key.
  const [loaded, setLoaded] = useState<{ userId: string; saved: Saved } | null>(null);

  // Before paint, so the page and the panel appear in the same frame.
  useLayoutEffect(() => {
    if (!userId) return;
    dropOtherUsersKeys(PREFIX, userId);
    setLoaded({ userId, saved: readSaved(userId) });
  }, [userId]);

  useEffect(() => {
    if (loaded) writeSaved(loaded.userId, loaded.saved);
  }, [loaded]);

  // A reset erases the group's notes, so the unsent draft goes too. It is
  // written here and now because useProgress leaves the page on the same event,
  // before an effect would get to run.
  useEffect(() => {
    if (!socket || !userId) return;
    const onJobUpdated = ({ reset }: JobUpdatedEvent) => {
      if (!reset) return;
      const saved = { ...readSaved(userId), draft: '' };
      writeSaved(userId, saved);
      setLoaded({ userId, saved });
    };
    socket.on('jobUpdated', onJobUpdated);
    return () => {
      socket.off('jobUpdated', onJobUpdated);
    };
  }, [socket, userId]);

  const value = useMemo<NotebookState>(() => {
    const update = (patch: Partial<Saved>) =>
      setLoaded((current) => current && { ...current, saved: { ...current.saved, ...patch } });
    return {
      ...(loaded?.saved ?? DEFAULTS),
      ready: loaded !== null && loaded.userId === userId,
      setOpen: (open) => update({ open }),
      setTab: (tab) => update({ tab }),
      setDraft: (draft) => update({ draft }),
    };
  }, [loaded, userId]);

  return <NotebookContext.Provider value={value}>{children}</NotebookContext.Provider>;
}

export function useNotebook() {
  const context = useContext(NotebookContext);
  if (!context) {
    throw new Error('useNotebook must be used within NotebookProvider');
  }
  return context;
}
