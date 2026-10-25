'use client';

import { useEffect, useState } from 'react';

// Where a student is in the interview stage and the ratings they have entered
// for the current candidate, kept in localStorage so a refresh does not lose them.
export const useInterviewProgress = (interviews: { resume_id: number }[]) => {
  const [noShow, setNoShow] = useState(false);
  const [overall, setOverall] = useState(5);
  const [professionalPresence, setProfessionalPresence] = useState(5);
  const [qualityOfAnswer, setQualityOfAnswer] = useState(5);
  const [personality, setPersonality] = useState(5);
  const [videoIndex, setVideoIndex] = useState(0);
  const [currentCandidateId, setCurrentCandidateId] = useState<number | null>(null);

  useEffect(() => {
    const savedVideoIndex = localStorage.getItem('interviewStage_videoIndex');
    const savedCandidateId = localStorage.getItem('interviewStage_candidateId');
    const savedOverall = localStorage.getItem('interviewStage_overall');
    const savedProfessionalPresence = localStorage.getItem('interviewStage_professionalPresence');
    const savedQualityOfAnswer = localStorage.getItem('interviewStage_qualityOfAnswer');
    const savedPersonality = localStorage.getItem('interviewStage_personality');
    const savedNoShow = localStorage.getItem('interviewStage_noShow');

    if (savedVideoIndex) setVideoIndex(Number(savedVideoIndex));
    if (savedCandidateId) setCurrentCandidateId(Number(savedCandidateId));
    if (savedOverall) setOverall(Number(savedOverall));
    if (savedProfessionalPresence) setProfessionalPresence(Number(savedProfessionalPresence));
    if (savedQualityOfAnswer) setQualityOfAnswer(Number(savedQualityOfAnswer));
    if (savedPersonality) setPersonality(Number(savedPersonality));
    if (savedNoShow) setNoShow(savedNoShow === 'true');
  }, []);

  // Save state to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('interviewStage_videoIndex', String(videoIndex));
  }, [videoIndex]);

  useEffect(() => {
    localStorage.setItem('interviewStage_overall', String(overall));
  }, [overall]);

  useEffect(() => {
    localStorage.setItem('interviewStage_professionalPresence', String(professionalPresence));
  }, [professionalPresence]);

  useEffect(() => {
    localStorage.setItem('interviewStage_qualityOfAnswer', String(qualityOfAnswer));
  }, [qualityOfAnswer]);

  useEffect(() => {
    localStorage.setItem('interviewStage_personality', String(personality));
  }, [personality]);

  useEffect(() => {
    localStorage.setItem('interviewStage_noShow', String(noShow));
  }, [noShow]);

  const currentVid = interviews[videoIndex];

  // Save candidate ID whenever video changes
  useEffect(() => {
    if (currentVid) {
      setCurrentCandidateId(currentVid.resume_id);
      localStorage.setItem('interviewStage_candidateId', String(currentVid.resume_id));
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
        localStorage.setItem('interviewStage_candidateId', String(currentVideoCandidate));
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
    localStorage.removeItem('interviewStage_videoIndex');
    localStorage.removeItem('interviewStage_candidateId');
    localStorage.removeItem('interviewStage_overall');
    localStorage.removeItem('interviewStage_professionalPresence');
    localStorage.removeItem('interviewStage_qualityOfAnswer');
    localStorage.removeItem('interviewStage_personality');
    localStorage.removeItem('interviewStage_noShow');
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
