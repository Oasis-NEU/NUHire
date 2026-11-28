import type { Metadata } from 'next';
import { Lato } from 'next/font/google';
import './globals.css';
import { SocketProvider } from './components/socketContext';
import { AuthProvider } from './components/AuthContext';
import { NotebookProvider } from './components/NotebookContext';

const lato = Lato({
  variable: '--font-lato',
  weight: ['400', '700', '900'],
  subsets: ['latin'],
});

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
      <body className={`${lato.variable} font-sans antialiased`}>
        <AuthProvider>
          <SocketProvider>
            <NotebookProvider>{children}</NotebookProvider>
          </SocketProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
