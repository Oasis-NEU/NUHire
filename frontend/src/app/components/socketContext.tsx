'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;
const SocketContext = createContext<Socket | null>(null);

export function SocketProvider({ children }: { children: ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    const newSocket = io(API_BASE_URL, {
      // The API reads the login session off the socket handshake to learn who
      // is connecting and which rooms they may join. The API is a different
      // origin from this app (separate hosts in deploy, different ports
      // locally), and a cross-origin handshake sends no cookie unless asked.
      // Without this every socket arrives anonymous, the room checks cannot
      // police it, and SOCKET_AUTH_REQUIRED would disconnect the whole class.
      withCredentials: true,
      reconnection: true,
      // Five attempts at one second apart meant a student on bad campus wifi
      // gave up permanently after about five seconds and sat on a page that
      // would never hear the barrier open. Keep trying for the whole class;
      // the delay backs off to ten seconds so it is not a hammer.
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      transports: ['websocket', 'polling'],
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, []);

  return <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>;
}

export function useSocket() {
  return useContext(SocketContext);
}
