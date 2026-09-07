/**
 * NEXUS — Centralized Device Permissions & Hardware Readiness Service
 * 
 * Truthfully inspects and requests hardware capabilities:
 * 1. Location (GPS) — Primary / Recommended for emergency incident geotagging
 * 2. Notifications — Optional for field alert dispatch
 * 3. Persistent Storage — Recommended for zero-eviction IndexedDB vault
 * 4. Screen Wake Lock — Optional for field responders
 * 5. Bluetooth — OPTIONAL / EXPERIMENTAL only (WebRTC is the primary transport)
 * 
 * Strict Truthfulness Guarantee:
 * Never claims an API is granted unless confirmed by the browser.
 * Distinguishes Not Supported vs Denied vs Insecure Origin.
 */

import { isSecureContextOrigin, isInsecureLanOrigin, isGeolocationSupported } from './geolocation';

export type PermissionTruthStatus =
  | 'GRANTED'
  | 'DENIED'
  | 'PROMPT'
  | 'NOT_REQUESTED'
  | 'NOT_SUPPORTED'
  | 'UNAVAILABLE'
  | 'ACTIVE'
  | 'INACTIVE'
  | 'INSECURE_ORIGIN'
  | 'TESTED';

export interface DevicePermissionsStatus {
  location: PermissionTruthStatus;
  notifications: PermissionTruthStatus;
  storage: PermissionTruthStatus;
  wakeLock: PermissionTruthStatus;
  bluetooth: PermissionTruthStatus;
  isSecureContext: boolean;
}

// Active screen wake lock sentinel reference
let activeWakeLock: any = null;

/**
 * Checks current permission state for Geolocation without triggering a prompt.
 */
export async function queryLocationPermission(): Promise<PermissionTruthStatus> {
  if (!isGeolocationSupported()) return 'NOT_SUPPORTED';
  if (isInsecureLanOrigin()) return 'INSECURE_ORIGIN';

  if (typeof navigator !== 'undefined' && 'permissions' in navigator && navigator.permissions.query) {
    try {
      const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
      if (status.state === 'granted') return 'GRANTED';
      if (status.state === 'denied') return 'DENIED';
      if (status.state === 'prompt') return 'PROMPT';
    } catch {
      // Browser does not support querying 'geolocation' permission name
    }
  }

  return 'NOT_REQUESTED';
}

/**
 * Checks current permission state for Push Notifications without triggering a prompt.
 */
export function queryNotificationPermission(): PermissionTruthStatus {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'NOT_SUPPORTED';
  }
  if (isInsecureLanOrigin()) {
    return 'INSECURE_ORIGIN';
  }

  const notif = (window as any).Notification;
  if (!notif) return 'NOT_SUPPORTED';

  const perm = notif.permission;
  if (perm === 'granted') return 'GRANTED';
  if (perm === 'denied') return 'DENIED';
  if (perm === 'default') return 'PROMPT';
  return 'NOT_REQUESTED';
}

/**
 * Checks if IndexedDB persistent storage is active.
 */
export async function queryStoragePersistence(): Promise<PermissionTruthStatus> {
  if (typeof navigator === 'undefined' || !navigator.storage || !navigator.storage.persisted) {
    return 'NOT_SUPPORTED';
  }

  try {
    const isPersisted = await navigator.storage.persisted();
    return isPersisted ? 'GRANTED' : 'PROMPT';
  } catch {
    return 'UNAVAILABLE';
  }
}

/**
 * Checks screen wake lock capability and current status.
 */
export function queryWakeLockStatus(): PermissionTruthStatus {
  if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) {
    return 'NOT_SUPPORTED';
  }
  if (!isSecureContextOrigin()) {
    return 'INSECURE_ORIGIN';
  }
  return activeWakeLock ? 'ACTIVE' : 'INACTIVE';
}

/**
 * Checks Web Bluetooth capability.
 * Strictly OPTIONAL: Bluetooth is NOT the current transport.
 */
export function queryBluetoothCapability(): PermissionTruthStatus {
  if (typeof navigator === 'undefined' || !('bluetooth' in navigator)) {
    return 'NOT_SUPPORTED';
  }
  if (!isSecureContextOrigin()) {
    return 'INSECURE_ORIGIN';
  }
  return 'PROMPT';
}

/**
 * Evaluates the complete device readiness state truthfully.
 */
export async function queryAllPermissionsStatus(): Promise<DevicePermissionsStatus> {
  const isSecure = isSecureContextOrigin();
  const location = await queryLocationPermission();
  const notifications = queryNotificationPermission();
  const storage = await queryStoragePersistence();
  const wakeLock = queryWakeLockStatus();
  const bluetooth = queryBluetoothCapability();

  return {
    location,
    notifications,
    storage,
    wakeLock,
    bluetooth,
    isSecureContext: isSecure,
  };
}

/**
 * Requests browser push notification permission.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }
  try {
    const notif = (window as any).Notification;
    if (!notif || !notif.requestPermission) return false;
    const result = await notif.requestPermission();
    return result === 'granted';
  } catch (err) {
    console.warn('[Permissions] Failed to request notification permission:', err);
    return false;
  }
}

/**
 * Requests persistent storage for IndexedDB so local emergency caches survive low-storage purges.
 */
export async function requestStoragePersistence(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage || !navigator.storage.persist) {
    return false;
  }
  try {
    const persisted = await navigator.storage.persist();
    return persisted;
  } catch (err) {
    console.warn('[Permissions] Failed to request storage persistence:', err);
    return false;
  }
}

/**
 * Requests screen wake lock to keep the device active during field operations.
 */
export async function requestScreenWakeLock(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) {
    return false;
  }
  try {
    if (activeWakeLock) {
      return true;
    }
    const sentinel = await (navigator as any).wakeLock.request('screen');
    activeWakeLock = sentinel;
    sentinel.addEventListener('release', () => {
      activeWakeLock = null;
    });
    return true;
  } catch (err) {
    console.warn('[Permissions] Screen wake lock error:', err);
    return false;
  }
}

/**
 * Releases active screen wake lock.
 */
export async function releaseScreenWakeLock(): Promise<void> {
  if (activeWakeLock) {
    try {
      await activeWakeLock.release();
    } catch {}
    activeWakeLock = null;
  }
}

/**
 * Explicit user-triggered test of Web Bluetooth API.
 * ONLY triggered after an explicit click/tap by the user.
 * Note: Bluetooth is OPTIONAL / EXPERIMENTAL. WebRTC remains the primary transport.
 */
export async function testBluetoothDeviceScan(): Promise<{
  success: boolean;
  deviceName?: string;
  error?: string;
}> {
  if (typeof navigator === 'undefined' || !('bluetooth' in navigator)) {
    return {
      success: false,
      error: 'Web Bluetooth API is not supported by this browser.',
    };
  }

  if (!isSecureContextOrigin()) {
    return {
      success: false,
      error: 'Web Bluetooth requires a Secure Context (HTTPS or localhost).',
    };
  }

  try {
    const device = await (navigator as any).bluetooth.requestDevice({
      acceptAllDevices: true,
    });
    return {
      success: true,
      deviceName: device.name || device.id || 'Nearby Bluetooth Device',
    };
  } catch (err: any) {
    if (err.name === 'NotFoundError') {
      // User cancelled the native browser picker
      return {
        success: false,
        error: 'Bluetooth scan closed by user.',
      };
    }
    return {
      success: false,
      error: err.message || 'Bluetooth scan failed.',
    };
  }
}
