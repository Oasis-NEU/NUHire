'use client';
import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { API_BASE_URL } from '../../lib/api';
import { useAuth } from './AuthContext';

export function useLogout() {
  const router = useRouter();
  const { refetchUser } = useAuth();

  return useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) {
        console.error('Failed to logout:', response.statusText);
        return false;
      }
      await refetchUser();
      router.push('/');
      return true;
    } catch (error) {
      console.error('Error logging out:', error);
      return false;
    }
  }, [router, refetchUser]);
}
