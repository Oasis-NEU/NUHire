// src/models/SocketEvents.ts

import type { DbBool } from './DbBool';
import type { MyVote, VoteKind } from './Vote';

// What the server reads from each client event. Student events carry no group,
// class or student id: the server takes those from the sender's login, and
// anything else the browser sends is ignored.
export interface SocketEvents {
  // Connection events
  adminOnline: { adminEmail: string };
  studentOnline: { studentId: string };
  joinGroup: string;
  joinClass: { classId: number };

  // Checkbox events
  check: {
    resume_number: number;
    // Written straight into `Resume.checked`; res-review-group sends 1 or 0.
    checked: DbBool;
  };
  checkint: {
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
    class: number;
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
    targetPage: string;
  };

  // Completion events
  confirmOffer: {
    candidateId: number;
  };

  // Group votes (OAS-368). The student's group, class and id come from their
  // login; the payload only says which vote and what they chose. resume_review
  // takes `votes` (or one `resumeId` with `vote`), final_pick takes `resumeId`.
  castGroupVote: {
    kind: VoteKind;
    votes?: MyVote[];
    resumeId?: number;
    vote?: MyVote['vote'];
  };
  // Teacher only. On an escalated round `winners` must come from its tied
  // options; on an open round it forces the result from all of its options.
  decideGroupVote: {
    classId: number;
    groupId: number;
    kind: VoteKind;
    winners: number[];
  };

  // Preset votes
  sentPresetVotes: {
    question1: number;
    question2: number;
    question3: number;
    question4: number;
    candidate_id: number;
  };
}
