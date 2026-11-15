import type { ReactNode } from 'react';
import StepLayout from '../components/notebook/StepLayout';

export default function Layout({ children }: { children: ReactNode }) {
  return <StepLayout>{children}</StepLayout>;
}
