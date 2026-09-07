// ============================================================
// NEXUS Offline Data Core — Dexie Database Initialization
// ============================================================
// Local IndexedDB database using Dexie.js.
// 5 stores: incidents, outbox, peerCache, device, syncState
// ============================================================

import Dexie, { type Table } from 'dexie';
import type {
  Incident,
  OutboxItem,
  PeerCacheEntry,
  DeviceRecord,
  SyncStateRecord,
} from './types';

/**
 * NexusDatabase — the local offline database.
 * 
 * This is the single source of truth for all incident data
 * when the device is offline. It persists across browser restarts.
 */
export class NexusDatabase extends Dexie {
  incidents!: Table<Incident, string>;
  outbox!: Table<OutboxItem, string>;
  peerCache!: Table<PeerCacheEntry, string>;
  device!: Table<DeviceRecord, string>;
  syncState!: Table<SyncStateRecord, string>;

  constructor(dbName: string = 'NexusLocalDB') {
    super(dbName);

    this.version(1).stores({
      // Primary key: incidentId. Indexed fields for queries.
      incidents: 'incidentId, originDeviceId, type, priority, status, version, timestamp',
      // Primary key: incidentId. Indexed for priority-ordered retrieval.
      outbox: 'incidentId, status, priority, timestamp',
      // Primary key: peerId.
      peerCache: 'peerId, lastSeen',
      // Primary key: id (singleton — always 'local').
      device: 'id',
      // Primary key: id (singleton — always 'default').
      syncState: 'id',
    });
  }
}

/**
 * Default database instance.
 * Import this for application use. Tests create their own instances.
 */
export const db = new NexusDatabase();

/**
 * Reset the database — clears all tables.
 * Use for testing or explicit user-triggered data reset.
 */
export async function resetDatabase(database: NexusDatabase = db): Promise<void> {
  await database.incidents.clear();
  await database.outbox.clear();
  await database.peerCache.clear();
  await database.device.clear();
  await database.syncState.clear();
}
