/**
 * NEXUS — Centralized Frontend API & Environment Configuration
 * 
 * Provides a single authoritative source for external endpoints,
 * WebRTC signaling URLs, and development configurations.
 * Supports LAN IP resolution for real phone demonstrations.
 */

export function getSignalingUrl(): string {
  // 1. Explicit environment variable override
  if (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_SIGNALING_URL) {
    return (import.meta as any).env.VITE_SIGNALING_URL;
  }

  // 2. Dynamic host detection for local phone / LAN demonstration
  // If user opens the app from a phone at http://192.168.x.x:3000,
  // this automatically routes signaling to ws://192.168.x.x:8080.
  if (typeof window !== 'undefined' && window.location?.hostname) {
    const host = window.location.hostname;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${host}:8080`;
  }

  // 3. Safe fallback for server/test environments
  return 'ws://localhost:8080';
}

export const API_CONFIG = {
  signalingUrl: getSignalingUrl(),
  signalingPort: 8080,
  defaultTtlMs: 86_400_000, // 24 hours
  maxRelayHops: 3,
  isDevelopment: typeof import.meta !== 'undefined' && Boolean((import.meta as any).env?.DEV),
  // Placeholder for future cloud sync endpoints (PLANNED - not currently integrated)
  cloudSyncEndpoint: null,
};
