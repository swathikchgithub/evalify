// app/api/endpoints/route.ts
// Serves endpoint configs to the frontend.
// Resolves apiKeyEnvVar → actual key from .env.local server-side.
// The frontend never sees the raw env var names.

import { CUSTOM_ENDPOINTS, KSERVE_ENDPOINTS } from '@/config/endpoints';

export async function GET() {
  // Resolve API keys server-side — never expose env var names to client
  const customEndpoints = CUSTOM_ENDPOINTS.map(({ apiKeyEnvVar, ...ep }) => ({
    ...ep,
    resolvedApiKey: apiKeyEnvVar ? (process.env[apiKeyEnvVar] ?? '') : '',
  }));

  const kserveEndpoints = KSERVE_ENDPOINTS.map(({ apiKeyEnvVar, ...ep }) => ({
    ...ep,
    resolvedApiKey: apiKeyEnvVar ? (process.env[apiKeyEnvVar] ?? '') : '',
  }));

  return new Response(
    JSON.stringify({ customEndpoints, kserveEndpoints }),
    { headers: { 'Content-Type': 'application/json' } }
  );
}
