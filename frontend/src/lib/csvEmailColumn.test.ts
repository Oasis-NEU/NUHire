import { describe, expect, it } from 'vitest';
import { emailColumnCandidates } from './csvEmailColumn';

describe('emailColumnCandidates', () => {
  it('prefers an exact Email header over one that only contains it', () => {
    expect(emailColumnCandidates(['Name', 'Secondary Email', ' EMAIL '])).toEqual([2]);
  });

  it('returns the only header containing email', () => {
    expect(emailColumnCandidates(['Student', 'Email Address'])).toEqual([1]);
  });

  it('returns every candidate when none is exact, so the professor can pick', () => {
    expect(emailColumnCandidates(['School Email', 'Secondary Email'])).toEqual([0, 1]);
  });

  it('returns nothing when no header mentions email', () => {
    expect(emailColumnCandidates(['Name', 'SIS ID'])).toEqual([]);
  });
});
