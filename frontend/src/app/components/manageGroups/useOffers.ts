'use client';

import { useState, useEffect } from 'react';
import type { Socket } from 'socket.io-client';
import type { AcceptedOffer, CandidateOption, PendingOffer, User } from '../../../types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

// The selected class's candidates and the groups' pending and accepted offers,
// kept current by the offer socket events.
export function useOffers(
  socket: Socket | null,
  user: User | null,
  selectedClass: string,
  availableGroups: number[]
) {
  const [pendingOffers, setPendingOffers] = useState<PendingOffer[]>([]);
  const [candidates, setCandidates] = useState<CandidateOption[]>([]);
  const [acceptedOffers, setAcceptedOffers] = useState<AcceptedOffer[]>([]);
  const [dismissedOffers, setDismissedOffers] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!socket || !user || user.affiliation !== 'admin') return;

    // Joining the advisor's room is what makes every notification below
    // reachable: offer requests, offer responses, progress updates and roster
    // changes are all addressed to it. A socket that drops and reconnects gets
    // a new id and is in no rooms, so this has to run again on every connect or
    // the dashboard goes quiet for the rest of the class with nothing on screen
    // to say so.
    const joinAdminRoom = () => socket.emit('adminOnline', { adminEmail: user.email });

    if (socket.connected) joinAdminRoom();
    socket.on('connect', joinAdminRoom);

    const onRequest = ({
      classId,
      groupId,
      candidateId,
      firstName,
      lastName,
    }: {
      classId: number;
      groupId: number;
      candidateId: number;
      firstName: string;
      lastName: string;
    }) => {
      if (selectedClass && Number(selectedClass) === classId) {
        const candidate = candidates.find((c) => c.id === candidateId);
        const candidateName =
          firstName && lastName
            ? `${firstName} ${lastName}`
            : candidate
              ? candidate.name
              : `Candidate ${candidateId}`;

        setPendingOffers((prev) => {
          const exists = prev.some(
            (o) => o.classId === classId && o.groupId === groupId && o.candidateId === candidateId
          );
          if (exists) return prev;
          return [
            ...prev,
            {
              classId,
              groupId,
              candidateId,
              candidateName,
            },
          ];
        });
      }
    };

    const onResponse = (data: {
      classId: number;
      groupId: number;
      candidateId: number;
      accepted: boolean;
    }) => {
      setPendingOffers((prev) =>
        prev.filter(
          (o) =>
            !(
              o.classId === data.classId &&
              o.groupId === data.groupId &&
              o.candidateId === data.candidateId
            )
        )
      );
    };

    socket.on('makeOfferRequest', onRequest);
    socket.on('makeOfferResponse', onResponse);

    return () => {
      socket.off('connect', joinAdminRoom);
      socket.off('makeOfferRequest', onRequest);
      socket.off('makeOfferResponse', onResponse);
    };
  }, [socket, user, selectedClass, candidates]);

  useEffect(() => {
    const fetchCandidates = async () => {
      if (!selectedClass) {
        setCandidates([]);
        return;
      }

      try {
        const response = await fetch(`${API_BASE_URL}/candidates/by-class/${selectedClass}`, {
          credentials: 'include',
        });

        if (response.ok) {
          const candidatesData = await response.json();
          const formattedCandidates = candidatesData.map((candidate: any) => ({
            id: candidate.id || candidate.resume_id,
            name: `${candidate.f_name} ${candidate.l_name}`,
          }));
          setCandidates(formattedCandidates);
        }
      } catch (error) {
        console.error('Error fetching candidates:', error);
        setCandidates([]);
      }
    };

    fetchCandidates();
  }, [selectedClass]);

  useEffect(() => {
    const fetchAcceptedOffers = async () => {
      if (!selectedClass || availableGroups.length === 0 || candidates.length === 0) return;

      try {
        const offerPromises = availableGroups.map(async (groupId) => {
          const response = await fetch(
            `${API_BASE_URL}/offers/group/${groupId}/class/${selectedClass}`,
            {
              credentials: 'include',
            }
          );

          if (response.ok) {
            const offers = await response.json();
            return offers.filter((offer: any) => offer.status === 'accepted');
          }
          return [];
        });

        const allOffers = await Promise.all(offerPromises);
        const flattenedOffers = allOffers.flat();

        const formattedOffers = flattenedOffers.map((offer: any) => {
          const candidate = candidates.find((c) => c.id === offer.candidate_id);
          return {
            groupId: offer.group_id,
            candidateName: candidate ? candidate.name : `Candidate ${offer.candidate_id}`,
          };
        });
        setAcceptedOffers(formattedOffers);
      } catch (error) {
        console.error('Error fetching accepted offers:', error);
      }
    };

    fetchAcceptedOffers();
  }, [selectedClass, availableGroups, candidates]);

  useEffect(() => {
    const fetchPendingOffers = async () => {
      if (!selectedClass || availableGroups.length === 0 || candidates.length === 0) return;

      try {
        const offerPromises = availableGroups.map(async (groupId) => {
          const response = await fetch(
            `${API_BASE_URL}/offers/group/${groupId}/class/${selectedClass}`,
            {
              credentials: 'include',
            }
          );

          if (response.ok) {
            const offers = await response.json();
            return offers.filter((offer: any) => offer.status === 'pending');
          }
          return [];
        });

        const allOffers = await Promise.all(offerPromises);
        const flattenedOffers = allOffers.flat();

        const formattedOffers = flattenedOffers.map((offer: any) => {
          const candidate = candidates.find((c) => c.id === offer.candidate_id);
          return {
            classId: Number(selectedClass),
            groupId: offer.group_id,
            candidateId: offer.candidate_id,
            candidateName: candidate ? candidate.name : `Candidate ${offer.candidate_id}`,
          };
        });

        setPendingOffers(formattedOffers);
      } catch (error) {
        console.error('Error fetching pending offers:', error);
      }
    };

    fetchPendingOffers();
  }, [selectedClass, availableGroups, candidates]);

  return {
    pendingOffers,
    setPendingOffers,
    acceptedOffers,
    setAcceptedOffers,
    dismissedOffers,
    setDismissedOffers,
  };
}
