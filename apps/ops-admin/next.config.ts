import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  env: {
    NEXT_PUBLIC_ORCHESTRATOR_URL:
      process.env.NEXT_PUBLIC_ORCHESTRATOR_URL || 'http://localhost:4020',
  },
};

export default nextConfig;
