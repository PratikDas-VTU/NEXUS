/**
 * NEXUS — Centralized Geolocation API Service
 * 
 * Safely wraps navigator.geolocation to provide device coordinates
 * with error handling for permission denied, timeout, and unavailability.
 * Does NOT fallback to fake coordinates silently.
 */

export interface GeolocationCoordinates {
  latitude: number;
  longitude: number;
  accuracy?: number;
  isManual?: boolean;
}

export interface GeolocationResult {
  success: boolean;
  coords?: GeolocationCoordinates;
  error?: string;
  errorCode?: 'PERMISSION_DENIED' | 'POSITION_UNAVAILABLE' | 'TIMEOUT' | 'NOT_SUPPORTED';
}

/**
 * Checks if Geolocation API is available in the current browser/environment.
 */
export function isGeolocationSupported(): boolean {
  return typeof navigator !== 'undefined' && 'geolocation' in navigator;
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
        error: 'Geolocation is not supported by your browser',
        errorCode: 'NOT_SUPPORTED',
      });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          success: true,
          coords: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: Math.round(position.coords.accuracy),
            isManual: false,
          },
        });
      },
      (error) => {
        let errorCode: GeolocationResult['errorCode'] = 'POSITION_UNAVAILABLE';
        let userMessage = 'Unable to determine your physical location.';

        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorCode = 'PERMISSION_DENIED';
            userMessage = 'Location access denied. Please enable GPS permissions.';
            break;
          case error.POSITION_UNAVAILABLE:
            errorCode = 'POSITION_UNAVAILABLE';
            userMessage = 'Location information is currently unavailable from GPS.';
            break;
          case error.TIMEOUT:
            errorCode = 'TIMEOUT';
            userMessage = 'Location request timed out. Please try again or enter manually.';
            break;
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
 * Formats coordinates for clean field-app presentation.
 */
export function formatCoordinates(latitude: number, longitude: number, precision: number = 4): string {
  return `${latitude.toFixed(precision)}, ${longitude.toFixed(precision)}`;
}
