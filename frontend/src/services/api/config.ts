/**
 * NEXUS — Centralized Frontend API & Environment Configuration
 * 
 * Provides a single authoritative source for all:
 * - External endpoints & WebSocket signaling URLs
 * - Browser & Hardware APIs (Geolocation, Battery, Storage)
 * - Map Tile APIs (Esri Dark Canvas, OpenStreetMap, Carto)
 * - Development & LAN configurations
 */

export function getSignalingUrl(): string {
  // 1. Explicit environment variable override
  if (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_SIGNALING_URL) {
    return (import.meta as any).env.VITE_SIGNALING_URL;
  }

  // 2. Dynamic host detection for local phone / LAN demonstration
  // If running on HTTPS, route through Vite's secure WebSocket proxy on /ws (port 3000)
  // to eliminate mixed-content blocking in mobile Chrome!
  if (typeof window !== 'undefined' && window.location?.hostname) {
    if (window.location.protocol === 'https:') {
      return `wss://${window.location.host}/ws`;
    }
    const host = window.location.hostname;
    return `ws://${host}:8080`;
  }

  // 3. Safe fallback for server/test environments
  return 'ws://localhost:8080';
}

/**
 * Returns map tile provider configuration.
 * By default uses Esri World Dark Gray Canvas & OpenStreetMap:
 * - 100% FREE
 * - ZERO API KEY REQUIRED
 * - ZERO WATERMARK
 * 
 * If a custom CARTO API key is provided via VITE_CARTO_API_KEY, it will use Carto.
 */
export function getMapTileConfig(layer: 'dark' | 'street' = 'dark'): {
  url: string;
  subdomains?: string | string[];
  maxZoom: number;
  attribution: string;
} {
  const cartoKey = typeof import.meta !== 'undefined' ? (import.meta as any).env?.VITE_CARTO_API_KEY : undefined;

  if (layer === 'dark') {
    // If user provided an optional Carto API key, use Carto Dark Matter
    if (cartoKey) {
      return {
        url: `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?api_key=${cartoKey}`,
        subdomains: 'abcd',
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      };
    }

    // Default: Esri World Dark Gray Canvas (100% Free, NO API KEY REQUIRED, NO WATERMARK)
    return {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
      maxZoom: 16,
      attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ',
    };
  }

  // Standard Street Map layer (100% Free OpenStreetMap, NO API KEY REQUIRED)
  return {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    subdomains: 'abc',
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
  };
}

export const API_CONFIG = {
  signalingUrl: getSignalingUrl(),
  signalingPort: 8080,
  defaultTtlMs: 86_400_000, // 24 hours
  maxRelayHops: 3,
  isDevelopment: typeof import.meta !== 'undefined' && Boolean((import.meta as any).env?.DEV),
  getMapTileConfig,
  cartoApiKey: typeof import.meta !== 'undefined' ? (import.meta as any).env?.VITE_CARTO_API_KEY : undefined,
  // Placeholder for future cloud sync endpoints (PLANNED - not currently integrated)
  cloudSyncEndpoint: null,
};
