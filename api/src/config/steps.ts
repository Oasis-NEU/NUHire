// src/config/steps.ts

export const STEP_ORDER: string[] = [
  'none',
  'job_description',
  'res_1',
  'res_2',
  'interview',
  'offer',
  'employer',
];

// checks that request is valid
export const isStep = (step: unknown): step is string =>
  typeof step === 'string' && STEP_ORDER.includes(step);

export type StepDecision = 'allow' | 'noop' | 'reject';

// stored: what the DB has (null/undefined counts as "none")
// moved:  the stored row belongs to a different class or group than the
//         student is in now, e.g. a professor moved them mid-activity
// allow  = exactly one step ahead, or any step after a move
// noop   = same step or earlier, nothing to write
// reject = skipping ahead
export function decideStep(
  stored: string | null | undefined,
  incoming: string,
  moved = false
): StepDecision {
  const from = STEP_ORDER.indexOf(stored ?? 'none');
  const to = STEP_ORDER.indexOf(incoming);
  if (to === -1) {
    return 'reject';
  }
  // A moved student starts over wherever their new group's page puts them,
  // so the old group's step says nothing about what they may do now.
  if (moved) {
    return 'allow';
  }
  if (from === -1) {
    return 'reject';
  }
  if (to <= from) {
    return 'noop';
  }
  if (to === from + 1) {
    return 'allow';
  }

  return 'reject';
}
