/**
 * Root layout (server component): HTML shell, theme tokens via globals.css, app-wide providers and the top bar.
 */
import type { ReactNode } from 'react';
import { Providers } from './providers';
import { TopBar } from '@/components/TopBar';
import './globals.css';

export const metadata = { title: 'MarketScope' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-bg text-fg text-sm">
        <Providers>
          <TopBar />
          <main className="p-4">{children}</main>
        </Providers>
      </body>
    </html>
  );
}