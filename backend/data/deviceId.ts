// ============================================================
// NEXUS Offline Data Core — Persistent Device Identity
// ============================================================
// Generates and persists a unique device UUID that survives
// app restarts. Does not require Internet access.
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import { db, NexusDatabase } from './db';
import type { DeviceRecord } from './types';

const DEVICE_STORAGE_KEY = 'nexus_device_id';
const DEVICE_RECORD_ID = 'local'; // Singleton key in Dexie device table

/**
 * Synchronous initial ID retriever for React components to avoid 'DEV-INIT' flicker.
 */
export function getSynchronousDeviceId(nodeParam?: string | null): string {
  if (nodeParam) {
    return `DEV-${nodeParam.toUpperCase()}`;
  }
  try {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(DEVICE_STORAGE_KEY);
      if (stored) return stored;
      const generated = uuidv4();
      localStorage.setItem(DEVICE_STORAGE_KEY, generated);
      return generated;
    }
  } catch {
    // localStorage not available
  }
  return uuidv4();
}

/**
 * Get the persistent device ID.
 * 
 * Resolution order:
 * 1. Check Dexie `device` table (primary source)
 * 2. Check localStorage (backup source)
 * 3. Generate new UUIDv4 and persist to both
 * 
 * The device retains the same ID across application restarts
 * unless explicitly reset via resetDeviceId().
 */
export async function getDeviceId(database: NexusDatabase = db): Promise<string> {
  // 1. Try Dexie first
  const record = await database.device.get(DEVICE_RECORD_ID);
  if (record) {
    // Ensure localStorage backup is in sync
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(DEVICE_STORAGE_KEY, record.deviceId);
      }
    } catch {
      // localStorage may not be available in all environments
    }
    return record.deviceId;
  }

  // 2. Try localStorage backup
  let deviceId: string | null = null;
  try {
    if (typeof localStorage !== 'undefined') {
      deviceId = localStorage.getItem(DEVICE_STORAGE_KEY);
    }
  } catch {
    // localStorage may not be available
  }

  // 3. Generate new if nothing found
  if (!deviceId) {
    deviceId = uuidv4();
  }

  // Persist to both stores
  const newRecord: DeviceRecord = {
    id: DEVICE_RECORD_ID,
    deviceId,
    createdAt: Date.now(),
  };
  await database.device.put(newRecord);

  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(DEVICE_STORAGE_KEY, deviceId);
    }
  } catch {
    // Silently continue if localStorage is unavailable
  }

  return deviceId;
}

/**
 * Reset the device ID — generates a new UUID and persists it.
 * Use only for testing or explicit user-triggered identity reset.
 * Returns the new device ID.
 */
export async function resetDeviceId(database: NexusDatabase = db): Promise<string> {
  const newDeviceId = uuidv4();
  const record: DeviceRecord = {
    id: DEVICE_RECORD_ID,
    deviceId: newDeviceId,
    createdAt: Date.now(),
  };

  await database.device.put(record);

  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(DEVICE_STORAGE_KEY, newDeviceId);
    }
  } catch {
    // Silently continue
  }

  return newDeviceId;
}
