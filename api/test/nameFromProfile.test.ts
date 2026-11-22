import { describe, expect, it } from 'vitest';
import { nameFromProfile } from '../src/models/User';

// Keycloak's name claims are optional, and splitting a missing one crashed login.

const email = 'student@northeastern.edu';

describe('nameFromProfile', () => {
  it('prefers given_name and family_name', () => {
    const profile = { given_name: 'Ana', family_name: 'de la Cruz', name: 'Something Else' };
    expect(nameFromProfile(profile, email)).toEqual({ firstName: 'Ana', lastName: 'de la Cruz' });
  });

  it('keeps every word after the first in the last name', () => {
    expect(nameFromProfile({ name: 'Ana de la Cruz' }, email)).toEqual({
      firstName: 'Ana',
      lastName: 'de la Cruz',
    });
  });

  it('gives a one-word name an empty last name, not null', () => {
    expect(nameFromProfile({ name: 'Madonna' }, email)).toEqual({
      firstName: 'Madonna',
      lastName: '',
    });
  });

  it('falls back to the email when there is no name', () => {
    expect(nameFromProfile({}, email)).toEqual({ firstName: 'student', lastName: '' });
    expect(nameFromProfile({ name: '  ' }, email)).toEqual({ firstName: 'student', lastName: '' });
  });
});
