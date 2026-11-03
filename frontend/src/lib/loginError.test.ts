import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loginErrorPopup } from './loginError';

// Read the codes from the API itself, so a code added there without a message
// here fails this test instead of falling through to the generic text.
const authController = readFileSync(
  join(__dirname, '../../../api/src/controller/auth.controller.ts'),
  'utf8'
);
const apiCodes = [...authController.matchAll(/\?error=([a-z_]+)/g)].map((m) => m[1]);

describe('loginErrorPopup', () => {
  it('finds the codes the API sends', () => {
    expect(apiCodes.length).toBeGreaterThan(0);
  });

  it.each(apiCodes)('has its own message for %s', (code) => {
    const popup = loginErrorPopup(code);
    expect(popup).not.toBeNull();
    expect(popup).not.toEqual(loginErrorPopup('not_a_real_code'));
  });

  it('falls back to a generic message for an unknown code', () => {
    expect(loginErrorPopup('not_a_real_code')).toEqual({
      headline: 'Login failed',
      message: expect.stringContaining('tell your professor'),
    });
  });

  it('does not treat an inherited property name as a code', () => {
    expect(loginErrorPopup('toString')).toEqual(loginErrorPopup('not_a_real_code'));
  });

  it('shows nothing without a code', () => {
    expect(loginErrorPopup(null)).toBeNull();
    expect(loginErrorPopup('')).toBeNull();
  });
});
