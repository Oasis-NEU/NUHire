import { beforeEach, describe, expect, it } from 'vitest';
import { loadSavedOffer, saveOffer, type SavedOffer } from './offerStorage';

// A lab browser is shared, so what one student saved must never come back for
// the next one to log in.

class MemoryStorage {
  private items = new Map<string, string>();
  get length() {
    return this.items.size;
  }
  key(i: number) {
    return [...this.items.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.items.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.items.set(k, v);
  }
  removeItem(k: string) {
    this.items.delete(k);
  }
}

const offer: SavedOffer = {
  checkedState: { 3: true },
  offerConfirmations: { 3: ['7'] },
  existingOffer: null,
  acceptedOffer: false,
  sentIn: [true, 'none', 'none', 'none'],
  offerPending: true,
};

beforeEach(() => {
  globalThis.localStorage = new MemoryStorage() as unknown as Storage;
});

describe('offerStorage', () => {
  it('gives a user back what they saved', () => {
    saveOffer('7', offer);
    expect(loadSavedOffer('7')).toEqual(offer);
  });

  it("does not hand one user's selections to the next", () => {
    saveOffer('7', offer);
    expect(loadSavedOffer('8')).toEqual({});
    expect(loadSavedOffer('7')).toEqual({});
  });

  it('drops the old unscoped keys', () => {
    localStorage.setItem('makeOffer_checkedState', '{"3":true}');
    expect(loadSavedOffer('8')).toEqual({});
    expect(localStorage.length).toBe(0);
  });

  it('keeps only the acceptance once the offer is accepted', () => {
    saveOffer('7', offer);
    saveOffer('7', { ...offer, acceptedOffer: true });
    expect(loadSavedOffer('7')).toEqual({ acceptedOffer: true });
  });

  it('leaves the progress key alone', () => {
    localStorage.setItem('progress', 'offer');
    loadSavedOffer('7');
    expect(localStorage.getItem('progress')).toBe('offer');
  });
});
