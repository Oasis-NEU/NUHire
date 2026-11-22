// src/models/User.ts

export interface User {
  id: number;
  f_name: string;
  l_name: string;
  email: string;
  // 'none' is what the Keycloak callback inserts for a first-time login that
  // is not on any roster yet.
  affiliation: 'student' | 'admin' | 'none';
  group_id?: number;
  class?: number;
  current_page?:
    'dashboard' | 'resumepage' | 'resumepage2' | 'jobdes' | 'interviewpage' | 'makeofferpage';
  seen?: number;
  // When the student was first seen since their group started; null until then.
  present_at?: Date | null;
  keycloakProfile?: KeycloakProfile;
}

export interface KeycloakProfile {
  id?: string;
  username?: string;
  email?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  firstName?: string;
  lastName?: string;
  keycloakId?: string;
  [key: string]: any;
}

// Keycloak guarantees only the email; name, given_name and family_name are all
// optional. The last name is '' rather than null so a one-word name is not
// stored as NULL, and everything after the first word stays in the surname.
export function nameFromProfile(
  profile: KeycloakProfile,
  email: string
): { firstName: string; lastName: string } {
  if (profile.given_name) {
    return { firstName: profile.given_name, lastName: profile.family_name ?? '' };
  }
  const [first, ...rest] = (profile.name ?? '').trim().split(/\s+/);
  if (first) return { firstName: first, lastName: rest.join(' ') };
  return { firstName: email.split('@')[0], lastName: '' };
}

export function isAdmin(user: Pick<User, 'affiliation'> | undefined): boolean {
  return user?.affiliation === 'admin';
}
