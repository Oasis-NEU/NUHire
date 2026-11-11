import type { Metadata } from 'next';
import './globals.css';
import { SocketProvider } from './components/socketContext';
import { AuthProvider } from './components/AuthContext';

export const metadata: Metadata = {
  title: 'NUHire',
  description: "Step into the employer's shoes!",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <AuthProvider>
          <SocketProvider>{children}</SocketProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
