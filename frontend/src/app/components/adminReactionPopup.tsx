'use client';

import React from 'react';

interface PopupProps {
  headline: string;
  message: string;
  onAccept: () => void;
  onReject: () => void;
}

const adminReactionPopup = ({ headline, message, onAccept, onReject }: PopupProps) => {
  return (
    <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-gray-50 p-8 w-96 rounded-md shadow-lg z-50">
      <h2 className="font-bold text-neu-red text-2xl mb-4">{headline}</h2>
      <p className="text-black text-lg mb-6">{message}</p>
      <div className="flex justify-center gap-10">
        <button
          onClick={onAccept}
          className="px-4 py-2 rounded-md bg-green-400 text-green-800 hover:bg-green-300 transition"
        >
          Accept
        </button>
        <button
          onClick={onReject}
          className="px-4 py-2 rounded-md bg-red-400 text-red-800 hover:bg-red-200 transition"
        >
          Reject
        </button>
      </div>
    </div>
  );
};

export default adminReactionPopup;
