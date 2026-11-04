// Where each simulated student should end a run, and how long they "think".

// Every gate counts only the members who have shown up (presentMembers in
// api/src/config/socket.ts), so a group holding the dormant student finishes
// like any other.
export function expectedStep(student) {
  return student.group === null ? null : 'employer';
}

// An hour-long class, compressed. Ranges in ms.
export const THINK = {
  click: [300, 1200],
  resume: [500, 2500],
  interview: [1500, 4000],
};

// Students arrive over this window.
export const LOGIN_SPREAD_MS = 20_000;

// Waiting at one point longer than this counts as stuck.
export const STUCK_MS = 180_000;

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export const pick = ([min, max]) => min + Math.random() * (max - min);
export const think = (range) => sleep(pick(range));
