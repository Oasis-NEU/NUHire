// The API sends a failed login back to `/?error=<code>` (auth.controller.ts).
// Each message tells the student whether retrying can help, because otherwise
// a room of them clicks "Get Started" again with no idea why it bounced.

interface LoginErrorPopup {
  headline: string;
  message: string;
}

const TRY_AGAIN = 'Try again, and tell your professor if it keeps happening.';

const MESSAGES: Record<string, LoginErrorPopup> = {
  auth_failed: {
    headline: 'Login failed',
    message: `Your login didn't go through. ${TRY_AGAIN}`,
  },
  invalid_callback: {
    headline: 'Login expired',
    message: 'That login link has expired. Click "Get Started" to log in again.',
  },
  not_authenticated: {
    headline: 'Login expired',
    message: 'Your login has expired. Click "Get Started" to log in again.',
  },
  no_user: {
    headline: 'Login failed',
    message: "We couldn't read your account details. Tell your professor.",
  },
  user_not_found: {
    headline: 'Login failed',
    message: "We couldn't find your account. Tell your professor.",
  },
  session_error: {
    headline: 'Login failed',
    message: `Your login didn't finish. ${TRY_AGAIN}`,
  },
  login_error: {
    headline: 'Login failed',
    message: `Your login didn't finish. ${TRY_AGAIN}`,
  },
  db_error: {
    headline: 'Login failed',
    message: "NUHire couldn't reach its database. Tell your professor.",
  },
};

// A code added to the API later still gets a message instead of nothing.
const FALLBACK: LoginErrorPopup = {
  headline: 'Login failed',
  message: `Something went wrong logging you in. ${TRY_AGAIN}`,
};

export const loginErrorPopup = (code: string | null): LoginErrorPopup | null => {
  if (!code) return null;
  return Object.hasOwn(MESSAGES, code) ? MESSAGES[code] : FALLBACK;
};
