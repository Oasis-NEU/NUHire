import type { ClassBoard, DbBool, Group, Student } from '../../../types';
import { API_BASE_URL } from '../../../lib/api';

// Fetching and assembling the Manage Groups board. Kept out of the hook so the
// hook only decides when to load and which load may draw.

const NO_JOB = 'No job assigned';

type GroupState = Pick<Group, 'isStarted' | 'jobAssignment' | 'progress'>;

// The reply's JSON, or null when the API does not answer 2xx. A network
// failure still throws.
async function getJson<T>(path: string): Promise<T | null> {
  const response = await fetch(`${API_BASE_URL}${path}`, { credentials: 'include' });
  return response.ok ? response.json() : null;
}

export async function fetchGroupJob(classId: string, groupId: number): Promise<string> {
  const reply = await getJson<{ job: string | null }>(`/jobs/assignment/${groupId}/${classId}`);
  return reply?.job || NO_JOB;
}

// One group's failed lookups blank only that group's card.
async function fetchGroupState(classId: string, groupId: number): Promise<GroupState> {
  try {
    const [started, jobAssignment, progress] = await Promise.all([
      getJson<{ started: DbBool }>(`/groups/started/${classId}/${groupId}`),
      fetchGroupJob(classId, groupId),
      getJson<{ progress: string | null }>(`/groups/getProgress/${classId}/${groupId}`),
    ]);
    return {
      isStarted: Boolean(started?.started),
      jobAssignment,
      progress: progress?.progress || 'none',
    };
  } catch (error) {
    console.error(`Error fetching state for group ${groupId}:`, error);
    return { isStarted: false, jobAssignment: NO_JOB, progress: 'none' };
  }
}

const byFirstName = (a: Student, b: Student) => (a.f_name || '').localeCompare(b.f_name || '');

// One card per group in `groupIds` order, then one for students with no group.
function buildGroups(students: Student[], groupIds: number[], states: GroupState[]): Group[] {
  const groups: Group[] = groupIds.map((groupId, i) => ({
    group_id: groupId,
    students: students.filter((student) => student.group_id === groupId).sort(byFirstName),
    ...states[i],
  }));

  const ungrouped = students.filter((student) => student.group_id === null).sort(byFirstName);
  if (ungrouped.length > 0) {
    groups.push({
      group_id: -1,
      students: ungrouped,
      isStarted: false,
      jobAssignment: 'N/A',
      progress: 'N/A',
    });
  }
  return groups;
}

// Throws when the roster or the group list cannot be loaded.
export async function loadBoard(classId: string): Promise<ClassBoard> {
  const [students, groupIds] = await Promise.all([
    getJson<Student[]>(`/groups/students-by-class/${classId}`),
    // Already sorted: the API orders by group_id.
    getJson<number[]>(`/groups?class=${classId}`),
  ]);
  if (!students || !groupIds) throw new Error(`Could not load the roster of class ${classId}`);

  // A class with no groups has not been imported yet, and the board says so
  // rather than showing a lone "no group" card.
  if (groupIds.length === 0) return { students, groupIds, groups: [] };

  const states = await Promise.all(groupIds.map((groupId) => fetchGroupState(classId, groupId)));
  return { students, groupIds, groups: buildGroups(students, groupIds, states) };
}
