// src/models/ClassCode.ts

// One row of `ClassCodes`: the code students type to join the class `crn`.
export interface ClassCode {
  crn: number;
  code: string;
}

// The 409 from POST /classes/join when the student is already in another class.
// The frontend asks them to confirm, then repeats the request with confirm: true.
export interface JoinClassConfirmNeeded {
  error: string;
  requiresConfirm: true;
  currentClass: number;
}
