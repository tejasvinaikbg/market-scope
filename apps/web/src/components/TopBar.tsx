'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';

type Health = { ok: boolean; db: boolean; version: string };

export function TopBar() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: async () => (await fetch('/api/health')).json() as Promise<Health>,   // relative URL: the rewrite handles it
    refetchInterval: 10_000,
  });
  const label = health.isLoading ? 'checking api…' : health.data?.db ? 'api online' : 'api offline';
  return (
    <header className="flex items-center justify-between border-b border-line bg-surface px-4 py-2.5">
      <Link href="/" className="font-bold text-fg no-underline">MarketScope</Link>
      <span className={health.data?.db ? 'text-ok' : 'text-bad'}>{label}</span>
    </header>
  );
}