import scoping from './scoping.mjs';
import sockets from './sockets.mjs';
import auth from './auth.mjs';
import sql from './sql.mjs';
import env from './env.mjs';
import conventions from './conventions.mjs';
import security from './security.mjs';
import react from './react.mjs';
import process_ from './process.mjs';

export const allRules = [
  ...scoping,
  ...sockets,
  ...auth,
  ...sql,
  ...env,
  ...conventions,
  ...security,
  ...react,
  ...process_,
];

const seen = new Set();
for (const r of allRules) {
  if (seen.has(r.id)) throw new Error(`duplicate rule id: ${r.id}`);
  seen.add(r.id);
  if (!['error', 'warn', 'info'].includes(r.severity)) throw new Error(`bad severity on ${r.id}`);
}

export const fileRules = allRules.filter((r) => r.scope !== 'pr');
export const prRules = allRules.filter((r) => r.scope === 'pr');
