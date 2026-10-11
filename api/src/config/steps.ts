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
// allow  = exactly one step ahead
// noop   = same step or earlier, nothing to write
// reject = skipping ahead
export function decideStep(stored: string | null | undefined, incoming: string): StepDecision {
  const from = STEP_ORDER.indexOf(stored ?? 'none');
  const to = STEP_ORDER.indexOf(incoming);
  if (from === -1 || to === -1) {
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
