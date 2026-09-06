import type { NextConfig } from 'next';
import { config } from 'dotenv';

config({ path: '../../.env' }); // the one .env at the repository root serves the web app too (NEXT_PUBLIC_* are inlined at build time)

const API_URL = process.env.API_URL ?? 'http://localhost:4200';

const nextConfig: NextConfig = {
  output: 'standalone', // a self-contained server for a container image
  distDir: process.env.NEXT_DIST_DIR ?? '.next', // the end-to-end run builds beside a running dev server, never over it
  transpilePackages: ['@market-scope/shared'], // the shared package ships raw TypeScript
  // One Leaflet for every importer: react-leaflet takes the UMD build and the GoogleMutant source the ES build, and a grid
  // layer from one copy on a map from the other stays two zoom levels behind. The ES build serves both.
  turbopack: { resolveAlias: { leaflet: 'leaflet/dist/leaflet-src.esm.js' } },
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_URL}/api/:path*` }];
  },
};

export default nextConfig;
