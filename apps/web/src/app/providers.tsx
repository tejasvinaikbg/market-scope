'use client';
/**
 * Everything the whole app shares: the theme, the query client, and the portfolio chosen in this session.
 * "Current portfolio" is app state, not server state: it is whatever this browser uploaded last, and a fresh
 * session starts with none — which is what the stepper's "no file yet" means.
 */
import { createContext, useContext, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';

export interface CurrentPortfolio { id: number; name: string; rowCount: number; withCoords: number; withoutCoords: number }

const CurrentPortfolioContext = createContext<{ portfolio: CurrentPortfolio | null; setPortfolio: (p: CurrentPortfolio | null) => void }>({
  portfolio: null, setPortfolio: () => { },                                 // the default is only seen outside <Providers>, which never happens
});

/** The portfolio uploaded in this session, or null. Read by the stepper and the setup screen; set by the upload screen. */
export const useCurrentPortfolio = () => useContext(CurrentPortfolioContext);

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } }));
  const [portfolio, setPortfolio] = useState<CurrentPortfolio | null>(null);
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <QueryClientProvider client={client}>
        <CurrentPortfolioContext.Provider value={{ portfolio, setPortfolio }}>{children}</CurrentPortfolioContext.Provider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
