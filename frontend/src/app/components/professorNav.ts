export interface ProfessorLink {
  label: string;
  path: string;
  // Other routes that highlight this tab.
  alsoActiveOn?: string[];
}

export const PROFESSOR_TABS: ProfessorLink[] = [
  { label: 'Classes', path: '/advisor-dashboard', alsoActiveOn: ['/grouping'] },
  { label: 'Sessions', path: '/live-class' },
  { label: 'Jobs & resumes', path: '/new-pdf' },
  { label: 'Settings', path: '/userProfile', alsoActiveOn: ['/adminFacts'] },
];

export const PROFESSOR_MENU: ProfessorLink[] = [
  { label: 'Settings', path: '/userProfile' },
  { label: 'Waiting facts', path: '/adminFacts' },
];

export const isActiveTab = (tab: ProfessorLink, pathname: string) =>
  [tab.path, ...(tab.alsoActiveOn ?? [])].some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
