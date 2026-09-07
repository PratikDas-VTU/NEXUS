/**
 * NEXUS — Centralized Geolocation API Service
 * 
 * Safely wraps navigator.geolocation to provide device coordinates
 * with error handling for permission denied, timeout, and unavailability.
 * Strictly adheres to "OFFLINE BY DEFAULT":
 * - Zero external/cloud geocoding dependencies
 * - Local storage caching of last known coordinates
 * - Distinct LIVE vs CACHED vs MANUAL states
 * - Continuous location watching where supported
 */

export type LocationSource = 'LIVE' | 'CACHED' | 'MANUAL';

export type LocationState = 'IDLE' | 'ACQUIRING' | 'LIVE' | 'CACHED' | 'MANUAL' | 'DENIED' | 'UNAVAILABLE';

export interface GeolocationCoordinates {
  latitude: number;
  longitude: number;
  accuracy?: number; // in meters
  altitude?: number | null;
  heading?: number | null;
  speed?: number | null;
  timestamp: number;
  source: LocationSource;
  isManual?: boolean;
}

export interface GeolocationResult {
  success: boolean;
  coords?: GeolocationCoordinates;
  error?: string;
  errorCode?: 'PERMISSION_DENIED' | 'POSITION_UNAVAILABLE' | 'TIMEOUT' | 'NOT_SUPPORTED' | 'INSECURE_ORIGIN';
}

const CACHE_KEY = 'nexus_last_known_location';

/**
 * Checks if Geolocation API is available in the current browser/environment.
 */
export function isGeolocationSupported(): boolean {
  return typeof navigator !== 'undefined' && 'geolocation' in navigator;
}

/**
 * Checks if running in a browser secure context (HTTPS or localhost).
 */
export function isSecureContextOrigin(): boolean {
  if (typeof window !== 'undefined') {
    return Boolean(window.isSecureContext);
  }
  return false;
}

/**
 * Checks if running over plain HTTP on a non-localhost IP address.
 */
export function isInsecureLanOrigin(): boolean {
  if (typeof window === 'undefined') return false;
  const isHttp = window.location.protocol === 'http:';
  const isNotLocal = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
  return isHttp && isNotLocal;
}

/**
 * Saves the latest successful coordinates to offline local storage.
 */
export function saveCachedPosition(coords: GeolocationCoordinates): void {
  try {
    if (typeof localStorage !== 'undefined') {
      const toStore: GeolocationCoordinates = {
        ...coords,
        source: 'CACHED',
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(toStore));
    }
  } catch (e) {
    console.warn('[Geolocation] Failed to persist location to localStorage:', e);
  }
}

/**
 * Retrieves the last-known position from offline local storage.
 */
export function getCachedPosition(): GeolocationCoordinates | null {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed.latitude === 'number' && typeof parsed.longitude === 'number') {
          return {
            latitude: parsed.latitude,
            longitude: parsed.longitude,
            accuracy: parsed.accuracy,
            altitude: parsed.altitude ?? null,
            heading: parsed.heading ?? null,
            speed: parsed.speed ?? null,
            timestamp: parsed.timestamp || Date.now(),
            source: 'CACHED',
            isManual: Boolean(parsed.isManual),
          };
        }
      }
    }
  } catch (e) {
    console.warn('[Geolocation] Failed to read cached location:', e);
  }
  return null;
}

/**
 * Creates a valid manual coordinate object.
 */
export function createManualCoordinates(latitude: number, longitude: number): GeolocationCoordinates {
  const coords: GeolocationCoordinates = {
    latitude,
    longitude,
    accuracy: 0,
    altitude: null,
    heading: null,
    speed: null,
    timestamp: Date.now(),
    source: 'MANUAL',
    isManual: true,
  };
  saveCachedPosition(coords);
  return coords;
}

/**
 * Retrieves the current physical device position via Browser Geolocation API.
 * Rejects silent fake coordinates; returns clean error diagnostics.
 */
export function getCurrentPosition(
  options: PositionOptions = {
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 30000,
  }
): Promise<GeolocationResult> {
  return new Promise((resolve) => {
    if (!isGeolocationSupported()) {
      resolve({
        success: false,
        error: 'Geolocation is not supported by your browser.',
        errorCode: 'NOT_SUPPORTED',
      });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords: GeolocationCoordinates = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: Math.round(position.coords.accuracy),
          altitude: position.coords.altitude,
          heading: position.coords.heading,
          speed: position.coords.speed,
          timestamp: position.timestamp || Date.now(),
          source: 'LIVE',
          isManual: false,
        };
        // Persist to offline cache
        saveCachedPosition(coords);
        resolve({
          success: true,
          coords,
        });
      },
      (error) => {
        let errorCode: GeolocationResult['errorCode'] = 'POSITION_UNAVAILABLE';
        let userMessage = 'Unable to determine your physical location.';

        if (error.code === error.PERMISSION_DENIED) {
          if (isInsecureLanOrigin()) {
            errorCode = 'INSECURE_ORIGIN';
            userMessage = `Location access blocked by Chrome over plain HTTP on LAN IP (${window.location.hostname}). Use HTTPS or enter location manually.`;
          } else {
            errorCode = 'PERMISSION_DENIED';
            userMessage = 'Location access denied. Please enable GPS permissions.';
          }
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          errorCode = 'POSITION_UNAVAILABLE';
          userMessage = 'Location information is currently unavailable from GPS.';
        } else if (error.code === error.TIMEOUT) {
          errorCode = 'TIMEOUT';
          userMessage = 'Location request timed out. Please try again or enter manually.';
        }

        resolve({
          success: false,
          error: userMessage,
          errorCode,
        });
      },
      options
    );
  });
}

/**
 * Continuously watches physical location as device moves in the field.
 * Returns an unwatch callback.
 */
export function watchUserPosition(
  onSuccess: (coords: GeolocationCoordinates) => void,
  onError: (errorResult: GeolocationResult) => void,
  options: PositionOptions = {
    enableHighAccuracy: true,
    timeout: 15000,
    maximumAge: 10000,
  }
): () => void {
  if (!isGeolocationSupported()) {
    onError({
      success: false,
      error: 'Geolocation is not supported by your browser.',
      errorCode: 'NOT_SUPPORTED',
    });
    return () => {};
  }

  try {
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const coords: GeolocationCoordinates = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: Math.round(position.coords.accuracy),
          altitude: position.coords.altitude,
          heading: position.coords.heading,
          speed: position.coords.speed,
          timestamp: position.timestamp || Date.now(),
          source: 'LIVE',
          isManual: false,
        };
        saveCachedPosition(coords);
        onSuccess(coords);
      },
      (error) => {
        let errorCode: GeolocationResult['errorCode'] = 'POSITION_UNAVAILABLE';
        let userMessage = 'GPS tracking unavailable.';

        if (error.code === error.PERMISSION_DENIED) {
          if (isInsecureLanOrigin()) {
            errorCode = 'INSECURE_ORIGIN';
            userMessage = `Location blocked by browser over HTTP on LAN IP. Chrome requires HTTPS for hardware GPS.`;
          } else {
            errorCode = 'PERMISSION_DENIED';
            userMessage = 'Location permission denied.';
          }
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          errorCode = 'POSITION_UNAVAILABLE';
          userMessage = 'GPS position lost or unavailable.';
        } else if (error.code === error.TIMEOUT) {
          errorCode = 'TIMEOUT';
          userMessage = 'GPS watch update timed out.';
        }

        onError({
          success: false,
          error: userMessage,
          errorCode,
        });
      },
      options
    );

    return () => {
      try {
        navigator.geolocation.clearWatch(watchId);
      } catch {}
    };
  } catch (err: any) {
    onError({
      success: false,
      error: err?.message || 'Failed to start GPS watch.',
      errorCode: 'POSITION_UNAVAILABLE',
    });
    return () => {};
  }
}

/**
 * Formats coordinates for clean field-app presentation.
 */
export function formatCoordinates(latitude: number, longitude: number, precision: number = 4): string {
  return `${latitude.toFixed(precision)}, ${longitude.toFixed(precision)}`;
}
