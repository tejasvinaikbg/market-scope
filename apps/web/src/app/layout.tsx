import type { ReactNode } from 'react';
import { Providers } from './providers';
import { AppHeader } from '@/components/AppHeader';
import { Stepper } from '@/components/Stepper';
import './globals.css';

export const metadata = { title: 'MarketScope' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-bg text-fg text-sm">
        <Providers>
          <AppHeader />
          <Stepper />
          <main>{children}</main>
        </Providers>
      </body>
    </html>
  );
}