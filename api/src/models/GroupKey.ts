/**
 * One team of students: a group within a class (the CRN). A group id alone
 * repeats across course sections, so group-scoped data is always keyed on both.
 */
export interface GroupKey {
  groupId: number;
  classId: number;
}
