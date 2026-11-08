import type { Offer } from '../../types';
import { dropOtherUsersKeys, userScope } from '../../lib/userStorage';

// What the offer page keeps in localStorage so a refresh does not lose the
// group's selections. Keyed per user, because the shared keys this replaces
// handed one student's selections on a lab browser to the next.
export interface SavedOffer {
  checkedState: Record<number, boolean>;
  offerConfirmations: Record<number, string[]>;
  existingOffer: Offer | null;
  acceptedOffer: boolean;
  sentIn: (true | false | 'none')[];
  offerPending: boolean;
}

const STORAGE_PREFIX = 'makeOffer';

const FIELDS: readonly (keyof SavedOffer)[] = [
  'checkedState',
  'offerConfirmations',
  'existingOffer',
  'acceptedOffer',
  'sentIn',
  'offerPending',
];

const storageKey = (userId: string, field: keyof SavedOffer) =>
  `${userScope(STORAGE_PREFIX, userId)}${field}`;

// Also removes whatever another user, or the old unscoped keys, left behind.
export const loadSavedOffer = (userId: string): Partial<SavedOffer> => {
  dropOtherUsersKeys(STORAGE_PREFIX, userId);
  const saved: Partial<SavedOffer> = {};
  for (const field of FIELDS) {
    const raw = localStorage.getItem(storageKey(userId, field));
    if (raw !== null) saved[field] = JSON.parse(raw);
  }
  return saved;
};

export const saveOffer = (userId: string, offer: SavedOffer) => {
  for (const field of FIELDS) {
    const key = storageKey(userId, field);
    // Once the offer is accepted, that is the only thing worth keeping.
    if (offer.acceptedOffer && field !== 'acceptedOffer') {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, JSON.stringify(offer[field]));
    }
  }
};
