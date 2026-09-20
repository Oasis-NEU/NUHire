// src/models/types.ts

import { Request } from 'express';
import { Session } from 'express-session';

// User Types
export interface User {
  id: number;
  f_name: string;
  l_name: string;
  email: string;
  // 'none' is what the Keycloak callback inserts for a first-time login that
  // is not on any roster yet.
  affiliation: 'student' | 'admin' | 'none';
  group_id?: number;
  class?: number;
  current_page?:
    'dashboard' | 'resumepage' | 'resumepage2' | 'jobdes' | 'interviewpage' | 'makeofferpage';
  seen?: number;
  keycloakProfile?: any;
}

export interface AuthRequest extends Request {
  user?: User;
  session: Session & {
    passport?: { user?: number | string };
    isModerator?: boolean;
  };
}

// Socket Event Types
export interface SocketEvents {
  // Connection events
  adminOnline: { adminEmail: string };
  studentOnline: { studentId: string };
  joinGroup: string;
  joinClass: { classId: number };

  // Checkbox events
  check: {
    group_id: string;
    resume_number: number;
    checked: boolean;
  };
  checkint: {
    group_id: string;
    interview_number: number;
    checked: boolean;
  };

  // Page change events
  studentPageChanged: {
    studentId: string;
    currentPage: string;
  };

  // Popup events
  sendPopupToGroups: {
    groups: number[];
    headline: string;
    message: string;
    class?: number;
    candidateId?: number;
  };

  // Rating events
  updateRatingsWithPresetBackend: {
    classId: number;
    groupId: number;
    candidateId: number;
    vote: string;
    isNoShow: boolean;
  };

  // Offer events
  makeOfferRequest: {
    classId: number;
    groupId: number;
    candidateId: number;
  };
  makeOfferResponse: {
    classId: number;
    groupId: number;
    candidateId: number;
    accepted: boolean;
  };

  // Navigation events
  moveGroup: {
    classId: number;
    groupId: number;
    targetPage: string;
  };

  // Interview events
  submitInterview: {
    currentVideoIndex: number;
    nextVideoIndex: number;
    isLastInterview: boolean;
    groupId: number;
    classId: number;
  };

  // Selection events
  offerSelected: {
    candidateId: number;
    groupId: number;
    classId: number;
    roomId: string;
    checked: boolean;
  };
  offerSubmitted: {
    candidateId: number;
    groupId: number;
    classId: number;
    roomId: string;
  };

  // Completion events
  userCompletedResReview: { groupId: number };
  confirmOffer: {
    groupId: number;
    classId: number;
    candidateId: number;
    studentId: string;
    roomId: string;
  };
  teamConfirmSelection: {
    groupId: number;
    classId: number;
    studentId: string;
    roomId: string;
  };
  teamUnconfirmSelection: {
    groupId: number;
    classId: number;
    studentId: string;
    roomId: string;
  };

  // Preset votes
  sentPresetVotes: {
    student_id: number;
    group_id: number;
    class: number;
    question1: number;
    question2: number;
    question3: number;
    question4: number;
    candidate_id: number;
  };

  // Group assignment
  allowGroupAssignment: {
    classId: number;
    message: string;
  };
  groupAssignmentClosed: {
    classId: number;
    message: string;
  };
}
