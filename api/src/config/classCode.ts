import { randomInt } from 'crypto';

// Students read these off a projector and type them on a phone, so the
// alphabet leaves out characters that look alike: 0/O and 1/I/L.
// cspell:ignore ABCDEFGHJKMNPQRSTUVWXYZ
export const CLASS_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CLASS_CODE_LENGTH = 6;

const CLASS_CODE_PATTERN = new RegExp(`^[${CLASS_CODE_ALPHABET}]{${CLASS_CODE_LENGTH}}$`);

// `pick` is injectable so tests can make the output predictable; the default is
// crypto-random because a guessable code would let anyone join any class.
export function generateClassCode(pick: (max: number) => number = randomInt): string {
  let code = '';
  for (let i = 0; i < CLASS_CODE_LENGTH; i++) {
    code += CLASS_CODE_ALPHABET[pick(CLASS_CODE_ALPHABET.length)];
  }
  return code;
}

// What a student typed, as stored, or null when it cannot be any code we issue.
// Rejecting the shape up front gives a typo a clearer message than "not found".
export function normalizeClassCode(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const code = input.trim().toUpperCase();
  return CLASS_CODE_PATTERN.test(code) ? code : null;
}
