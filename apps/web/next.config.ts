import type { NextConfig } from "next";

const API_URL = process.env.API_URL ?? 'http://localhost:4200'

const nextConfig: NextConfig = {
  transpilePackages: ['@market-scope/shared'],   // the shared package ships raw TypeScript
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_URL}/api/:path*` }]
  }
};

export default nextConfig;
