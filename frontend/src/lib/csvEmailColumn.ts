// The columns that could hold student emails. An exact "Email" header wins
// outright, because a Canvas export also has "Secondary Email" and taking the
// first header containing "email" imported a whole class under the wrong
// addresses. More than one result means the professor has to pick.
export const emailColumnCandidates = (headers: string[]): number[] => {
  const normalized = headers.map((h) => h.trim().toLowerCase());
  const exact = normalized.indexOf('email');
  if (exact !== -1) return [exact];
  return normalized.flatMap((h, i) => (h.includes('email') ? [i] : []));
};
