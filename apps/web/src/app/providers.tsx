'use client';
/**
 * Everything the whole app shares: the theme, the query client, and what this session has decided so far —
 * the portfolio it uploaded and the market it created. Both are app state, not server state: a fresh session
 * starts with neither, which is what the stepper's "no file yet" and "create the market first" mean.
 */
import { createContext, useContext, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { isApiError } from '@/api/client';

export interface CurrentPortfolio { id: number; name: string; rowCount: number; withCoords: number; withoutCoords: number }
export interface CurrentMarket { id: number; name: string; areaSqKm: number }

interface Session {
  portfolio: CurrentPortfolio | null; setPortfolio: (p: CurrentPortfolio | null) => void;
  market: CurrentMarket | null; setMarket: (m: CurrentMarket | null) => void;
}
const SessionContext = createContext<Session>({ portfolio: null, setPortfolio: () => { }, market: null, setMarket: () => { } });   // seen only outside <Providers>, which never happens

/** The portfolio uploaded in this session, or null. Read by the stepper and the setup screen; set by the upload screen. */
export const useCurrentPortfolio = () => { const { portfolio, setPortfolio } = useContext(SessionContext); return { portfolio, setPortfolio }; };
/** The market created in this session, or null. Read by the stepper; set by the setup screen. */
export const useCurrentMarket = () => { const { market, setMarket } = useContext(SessionContext); return { market, setMarket }; };

export function Providers({ children }: { children: ReactNode }) {
  // One retry for a request that never got an answer; none for an answer the API meant (a 404 stays a 404 on the second try too).
  const [client] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failures, error) => failures < 1 && !(isApiError(error) && error.status < 500),
        refetchOnWindowFocus: false,
      }
    }
  }));
  const [portfolio, setPortfolio] = useState<CurrentPortfolio | null>(null);
  const [market, setMarket] = useState<CurrentMarket | null>(null);
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <QueryClientProvider client={client}>
        <SessionContext.Provider value={{ portfolio, setPortfolio, market, setMarket }}>{children}</SessionContext.Provider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}