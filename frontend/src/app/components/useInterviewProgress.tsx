'use client';

import { useEffect, useState } from 'react';
import { dropOtherUsersKeys, userScope } from '../../lib/userStorage';

const STORAGE_PREFIX = 'interviewStage';

const storageKeys = (userId: string) => {
  const scope = userScope(STORAGE_PREFIX, userId);
  return {
    videoIndex: `${scope}videoIndex`,
    candidateId: `${scope}candidateId`,
    overall: `${scope}overall`,
    professionalPresence: `${scope}professionalPresence`,
    qualityOfAnswer: `${scope}qualityOfAnswer`,
    personality: `${scope}personality`,
    noShow: `${scope}noShow`,
  };
};

// Where a student is in the interview stage and the ratings they have entered
// for the current candidate, kept in localStorage so a refresh does not lose them.
export const useInterviewProgress = (
  userId: number | undefined,
  interviews: { resume_id: number }[]
) => {
  const [noShow, setNoShow] = useState(false);
  const [overall, setOverall] = useState(5);
  const [professionalPresence, setProfessionalPresence] = useState(5);
  const [qualityOfAnswer, setQualityOfAnswer] = useState(5);
  const [personality, setPersonality] = useState(5);
  const [videoIndex, setVideoIndex] = useState(0);
  const [currentCandidateId, setCurrentCandidateId] = useState<number | null>(null);
  // The user whose progress has been read back. Null until then, which stops
  // the save effect writing the initial values over the saved ones, or writing
  // under nobody's key before login.
  const [storageUserId, setStorageUserId] = useState<string | null>(null);

  // Waits for the user because the keys are per user. The shared keys these
  // replace handed a previous student's position on a lab browser to the next.
  useEffect(() => {
    if (!userId) return;
    const id = String(userId);
    dropOtherUsersKeys(STORAGE_PREFIX, id);

    const keys = storageKeys(id);
    const savedVideoIndex = localStorage.getItem(keys.videoIndex);
    const savedCandidateId = localStorage.getItem(keys.candidateId);
    const savedOverall = localStorage.getItem(keys.overall);
    const savedProfessionalPresence = localStorage.getItem(keys.professionalPresence);
    const savedQualityOfAnswer = localStorage.getItem(keys.qualityOfAnswer);
    const savedPersonality = localStorage.getItem(keys.personality);
    const savedNoShow = localStorage.getItem(keys.noShow);

    if (savedVideoIndex) setVideoIndex(Number(savedVideoIndex));
    if (savedCandidateId) setCurrentCandidateId(Number(savedCandidateId));
    if (savedOverall) setOverall(Number(savedOverall));
    if (savedProfessionalPresence) setProfessionalPresence(Number(savedProfessionalPresence));
    if (savedQualityOfAnswer) setQualityOfAnswer(Number(savedQualityOfAnswer));
    if (savedPersonality) setPersonality(Number(savedPersonality));
    if (savedNoShow) setNoShow(savedNoShow === 'true');
    setStorageUserId(id);
  }, [userId]);

  useEffect(() => {
    if (!storageUserId) return;
    const keys = storageKeys(storageUserId);
    localStorage.setItem(keys.videoIndex, String(videoIndex));
    localStorage.setItem(keys.overall, String(overall));
    localStorage.setItem(keys.professionalPresence, String(professionalPresence));
    localStorage.setItem(keys.qualityOfAnswer, String(qualityOfAnswer));
    localStorage.setItem(keys.personality, String(personality));
    localStorage.setItem(keys.noShow, String(noShow));
    if (currentCandidateId !== null) {
      localStorage.setItem(keys.candidateId, String(currentCandidateId));
    }
  }, [
    storageUserId,
    videoIndex,
    overall,
    professionalPresence,
    qualityOfAnswer,
    personality,
    noShow,
    currentCandidateId,
  ]);

  const currentVid = interviews[videoIndex];

  // Save candidate ID whenever video changes
  useEffect(() => {
    if (currentVid) {
      setCurrentCandidateId(currentVid.resume_id);
    }
  }, [currentVid]);

  // Verify ratings match current candidate after interviews load
  useEffect(() => {
    if (interviews.length > 0 && currentCandidateId !== null) {
      const currentVideoCandidate = interviews[videoIndex]?.resume_id;

      if (currentVideoCandidate !== currentCandidateId) {
        resetRatings();
        setNoShow(false);
        setCurrentCandidateId(currentVideoCandidate);
      }
    }
  }, [interviews, videoIndex, currentCandidateId]);

  // Reset all ratings
  const resetRatings = () => {
    setOverall(5);
    setProfessionalPresence(5);
    setQualityOfAnswer(5);
    setPersonality(5);
  };

  const clearSavedProgress = () => {
    if (!storageUserId) return;
    Object.values(storageKeys(storageUserId)).forEach((key) => localStorage.removeItem(key));
  };

  return {
    videoIndex,
    setVideoIndex,
    noShow,
    setNoShow,
    overall,
    setOverall,
    professionalPresence,
    setProfessionalPresence,
    qualityOfAnswer,
    setQualityOfAnswer,
    personality,
    setPersonality,
    resetRatings,
    clearSavedProgress,
  };
};
