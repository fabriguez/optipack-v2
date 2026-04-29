import type { NextConfig } from 'next';

const orchestratorUrl =
  process.env.NEXT_PUBLIC_ORCHESTRATOR_URL || 'http://localhost:4020';

// CSP — durcie pour un dashboard ops, on tolere unsafe-inline en style/script car Next
// inject des bouts inline pour l'hydratation. connect-src whiteliste l'orchestrateur.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  `connect-src 'self' ${orchestratorUrl}`,
  "font-src 'self' data:",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@transitsoftservices/ui'],
  env: {
    NEXT_PUBLIC_ORCHESTRATOR_URL: orchestratorUrl,
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
