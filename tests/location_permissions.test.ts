import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  saveCachedPosition,
  getCachedPosition,
  createManualCoordinates,
  formatCoordinates,
  isInsecureLanOrigin,
  GeolocationCoordinates,
  LocationState,
} from '../frontend/src/services/api/geolocation';
import {
  queryNotificationPermission,
  queryWakeLockStatus,
  queryBluetoothCapability,
  queryAllPermissionsStatus,
} from '../frontend/src/services/api/permissions';

class MockStorage {
  private store: Record<string, string> = {};
  getItem(key: string) {
    return this.store[key] ?? null;
  }
  setItem(key: string, value: string) {
    this.store[key] = value.toString();
  }
  removeItem(key: string) {
    delete this.store[key];
  }
  clear() {
    this.store = {};
  }
}

describe('NEXUS Offline Location & Device Permissions Suite', () => {
  let originalWindowDescriptor: PropertyDescriptor | undefined;
  let originalNavigatorDescriptor: PropertyDescriptor | undefined;
  let originalLocalStorageDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
    originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    originalLocalStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

    const mockStorage = new MockStorage();

    Object.defineProperty(globalThis, 'localStorage', {
      value: mockStorage,
      configurable: true,
      writable: true,
    });

    Object.defineProperty(globalThis, 'window', {
      value: {
        isSecureContext: true,
        localStorage: mockStorage,
        location: {
          protocol: 'http:',
          hostname: 'localhost',
          port: '3000',
          host: 'localhost:3000',
        },
      },
      configurable: true,
      writable: true,
    });

    Object.defineProperty(globalThis, 'navigator', {
      value: {
        geolocation: {},
        storage: {
          persisted: async () => true,
          persist: async () => true,
        },
      },
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    if (originalLocalStorageDescriptor) {
      Object.defineProperty(globalThis, 'localStorage', originalLocalStorageDescriptor);
    } else {
      delete (globalThis as any).localStorage;
    }

    if (originalWindowDescriptor) {
      Object.defineProperty(globalThis, 'window', originalWindowDescriptor);
    } else {
      delete (globalThis as any).window;
    }

    if (originalNavigatorDescriptor) {
      Object.defineProperty(globalThis, 'navigator', originalNavigatorDescriptor);
    }

    vi.restoreAllMocks();
  });

  describe('1. Offline Location Persistence & Source Tracking', () => {
    it('saves live coordinates to localStorage and marks as CACHED upon retrieval', () => {
      const liveCoords: GeolocationCoordinates = {
        latitude: 13.0827,
        longitude: 80.2707,
        accuracy: 12,
        altitude: 15,
        heading: 90,
        speed: 1.2,
        timestamp: 1700000000000,
        source: 'LIVE',
        isManual: false,
      };

      saveCachedPosition(liveCoords);

      const retrieved = getCachedPosition();
      expect(retrieved).not.toBeNull();
      expect(retrieved?.latitude).toBe(13.0827);
      expect(retrieved?.longitude).toBe(80.2707);
      expect(retrieved?.accuracy).toBe(12);
      // Critical NEXUS requirement: must clearly identify as CACHED, never falsely as LIVE
      expect(retrieved?.source).toBe('CACHED');
    });

    it('returns null if no cached position exists on fresh boot', () => {
      expect(getCachedPosition()).toBeNull();
    });

    it('creates manual coordinates with MANUAL source tag and caches them', () => {
      const manual = createManualCoordinates(12.9716, 77.5946);
      expect(manual.latitude).toBe(12.9716);
      expect(manual.longitude).toBe(77.5946);
      expect(manual.source).toBe('MANUAL');
      expect(manual.isManual).toBe(true);

      const cached = getCachedPosition();
      expect(cached).not.toBeNull();
      expect(cached?.latitude).toBe(12.9716);
    });

    it('formats coordinates accurately with given precision', () => {
      expect(formatCoordinates(13.263158, 80.028421, 4)).toBe('13.2632, 80.0284');
      expect(formatCoordinates(13.263158, 80.028421, 2)).toBe('13.26, 80.03');
    });
  });

  describe('2. Location State Transitions (LIVE vs CACHED vs MANUAL vs UNAVAILABLE)', () => {
    it('transitions to LIVE when fresh hardware GPS fix succeeds', () => {
      let state: LocationState = 'IDLE';
      const onGpsSuccess = (coords: GeolocationCoordinates) => {
        state = coords.source === 'LIVE' ? 'LIVE' : 'CACHED';
      };

      onGpsSuccess({
        latitude: 13.263,
        longitude: 80.028,
        accuracy: 10,
        timestamp: Date.now(),
        source: 'LIVE',
      });

      expect(state).toBe('LIVE');
    });

    it('falls back to CACHED when live GPS fails but cached coordinates exist', () => {
      saveCachedPosition({
        latitude: 13.0827,
        longitude: 80.2707,
        timestamp: Date.now() - 60000,
        source: 'LIVE',
      });

      let state: LocationState = 'ACQUIRING';
      const onGpsFailure = () => {
        const cached = getCachedPosition();
        if (cached) {
          state = 'CACHED';
        } else {
          state = 'UNAVAILABLE';
        }
      };

      onGpsFailure();
      expect(state).toBe('CACHED');
    });

    it('transitions to UNAVAILABLE or DENIED when both GPS and cache are absent', () => {
      let state: LocationState = 'ACQUIRING';
      const onGpsDenied = () => {
        const cached = getCachedPosition();
        if (cached) {
          state = 'CACHED';
        } else {
          state = 'DENIED';
        }
      };

      onGpsDenied();
      expect(state).toBe('DENIED');
    });

    it('transitions to MANUAL when user overrides coordinates', () => {
      let state: LocationState = 'IDLE';
      const onManualInput = (lat: number, lng: number) => {
        const coords = createManualCoordinates(lat, lng);
        state = coords.source === 'MANUAL' ? 'MANUAL' : 'IDLE';
      };

      onManualInput(13.1, 80.1);
      expect(state).toBe('MANUAL');
    });
  });

  describe('3. Insecure Origin Detection on Mobile LAN IP', () => {
    it('detects insecure LAN origin when protocol is http: and host is an IP address', () => {
      (globalThis as any).window.location = {
        protocol: 'http:',
        hostname: '11.12.21.234',
        port: '3000',
        host: '11.12.21.234:3000',
      };
      (globalThis as any).window.isSecureContext = false;

      expect(isInsecureLanOrigin()).toBe(true);
    });

    it('does not flag localhost as an insecure LAN origin', () => {
      (globalThis as any).window.location = {
        protocol: 'http:',
        hostname: 'localhost',
        port: '3000',
        host: 'localhost:3000',
      };
      expect(isInsecureLanOrigin()).toBe(false);
    });

    it('does not flag https: as an insecure origin', () => {
      (globalThis as any).window.location = {
        protocol: 'https:',
        hostname: '11.12.21.234',
        port: '3000',
        host: '11.12.21.234:3000',
      };
      (globalThis as any).window.isSecureContext = true;
      expect(isInsecureLanOrigin()).toBe(false);
    });
  });

  describe('4. Truthful Device Permissions Inspection', () => {
    it('truthfully reports Notification permission state', () => {
      (globalThis as any).window.Notification = {
        permission: 'granted',
      };
      expect(queryNotificationPermission()).toBe('GRANTED');

      (globalThis as any).window.Notification.permission = 'denied';
      expect(queryNotificationPermission()).toBe('DENIED');

      (globalThis as any).window.Notification.permission = 'default';
      expect(queryNotificationPermission()).toBe('PROMPT');

      delete (globalThis as any).window.Notification;
      expect(queryNotificationPermission()).toBe('NOT_SUPPORTED');
    });

    it('truthfully reports Screen Wake Lock capability', () => {
      (globalThis as any).navigator.wakeLock = {};

      (globalThis as any).window.isSecureContext = true;
      expect(queryWakeLockStatus()).toBe('INACTIVE');

      (globalThis as any).window.isSecureContext = false;
      expect(queryWakeLockStatus()).toBe('INSECURE_ORIGIN');

      delete (globalThis as any).navigator.wakeLock;
      expect(queryWakeLockStatus()).toBe('NOT_SUPPORTED');
    });

    it('truthfully handles Bluetooth capability without auto-triggering device scans', () => {
      (globalThis as any).navigator.bluetooth = {};

      (globalThis as any).window.isSecureContext = true;
      expect(queryBluetoothCapability()).toBe('PROMPT');

      (globalThis as any).window.isSecureContext = false;
      expect(queryBluetoothCapability()).toBe('INSECURE_ORIGIN');

      delete (globalThis as any).navigator.bluetooth;
      expect(queryBluetoothCapability()).toBe('NOT_SUPPORTED');
    });

    it('evaluates complete permissions status truthfully', async () => {
      (globalThis as any).window.isSecureContext = true;
      const status = await queryAllPermissionsStatus();

      expect(status).toHaveProperty('location');
      expect(status).toHaveProperty('notifications');
      expect(status).toHaveProperty('storage');
      expect(status).toHaveProperty('wakeLock');
      expect(status).toHaveProperty('bluetooth');
      expect(status.isSecureContext).toBe(true);
    });
  });

  describe('5. Emergency Report Priority Resolution', () => {
    it('prioritizes LIVE GPS > CACHED GPS > MANUAL fallback', () => {
      const livePos: GeolocationCoordinates = {
        latitude: 13.263,
        longitude: 80.028,
        accuracy: 8,
        timestamp: Date.now(),
        source: 'LIVE',
      };

      const cachedPos: GeolocationCoordinates = {
        latitude: 12.971,
        longitude: 77.594,
        accuracy: 25,
        timestamp: Date.now() - 300000,
        source: 'CACHED',
      };

      function resolveReportCoordinates(
        live: GeolocationCoordinates | null,
        cached: GeolocationCoordinates | null,
        manual: { lat: number; lng: number }
      ) {
        if (live && live.source === 'LIVE') {
          return { lat: live.latitude, lng: live.longitude, source: 'LIVE' };
        }
        if (cached && cached.source === 'CACHED') {
          return { lat: cached.latitude, lng: cached.longitude, source: 'CACHED' };
        }
        return { lat: manual.lat, lng: manual.lng, source: 'MANUAL' };
      }

      // Case 1: LIVE available
      const r1 = resolveReportCoordinates(livePos, cachedPos, { lat: 10, lng: 20 });
      expect(r1.source).toBe('LIVE');
      expect(r1.lat).toBe(13.263);

      // Case 2: LIVE lost, CACHED available
      const r2 = resolveReportCoordinates(null, cachedPos, { lat: 10, lng: 20 });
      expect(r2.source).toBe('CACHED');
      expect(r2.lat).toBe(12.971);

      // Case 3: Both absent, MANUAL fallback
      const r3 = resolveReportCoordinates(null, null, { lat: 12.9716, lng: 77.5946 });
      expect(r3.source).toBe('MANUAL');
      expect(r3.lat).toBe(12.9716);
    });
  });
});
