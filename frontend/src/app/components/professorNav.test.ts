import { describe, expect, it } from 'vitest';
import { PROFESSOR_TABS, isActiveTab } from './professorNav';

// Which header tab is underlined. Renaming a route or adding a page breaks it
// without any other sign.
const tab = (label: string) => PROFESSOR_TABS.find((t) => t.label === label)!;

describe('isActiveTab', () => {
  it('matches its own path and the pages under it', () => {
    expect(isActiveTab(tab('Jobs & resumes'), '/new-pdf')).toBe(true);
    expect(isActiveTab(tab('Jobs & resumes'), '/new-pdf/edit')).toBe(true);
  });

  it('matches the routes it lists in alsoActiveOn', () => {
    expect(isActiveTab(tab('Classes'), '/grouping')).toBe(true);
    expect(isActiveTab(tab('Settings'), '/adminFacts')).toBe(true);
  });

  it('does not match another route that only shares its prefix', () => {
    expect(isActiveTab(tab('Jobs & resumes'), '/new-pdf-archive')).toBe(false);
    expect(isActiveTab(tab('Classes'), '/live-class')).toBe(false);
  });
});
