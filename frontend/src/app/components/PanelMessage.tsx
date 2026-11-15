import type { ReactNode } from 'react';

// Loading, empty and error text inside a compact panel, such as a notebook tab.
export default function PanelMessage({ children }: { children: ReactNode }) {
  return <p className="text-[13px] leading-5 text-gray-500">{children}</p>;
}
