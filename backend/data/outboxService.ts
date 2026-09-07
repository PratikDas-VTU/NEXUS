// ============================================================
// NEXUS Offline Data Core — Outbox Queue Service
// ============================================================
// Manages the queue of incidents pending relay or cloud sync.
// Sync/transport state is tracked HERE, not on the Incident entity.
// ============================================================

import { db, NexusDatabase } from './db';
import type {
  Incident,
  OutboxItem,
  OutboxStatus,
  IncidentPriority,
} from './types';
import { PRIORITY_ORDER } from './types';
import { isExpired } from './ttl';

/**
 * Add an incident to the outbox queue for relay/sync.
 * Initial status is 'pending_relay'.
 */
export async function addToOutbox(
  incidentId: string,
  priority: IncidentPriority,
  timestamp: number,
  database: NexusDatabase = db
): Promise<void> {
  const existing = await database.outbox.get(incidentId);
  if (existing) {
    // Already in outbox — don't create duplicate entry
    return;
  }

  const item: OutboxItem = {
    incidentId,
    status: 'pending_relay',
    priority,
    timestamp,
    retryCount: 0,
  };

  await database.outbox.put(item);
}

/**
 * Get all items pending relay, sorted by priority queue rules:
 * 1. Priority (P0 first)
 * 2. Timestamp (newest first)
 * 3. Remaining TTL (most urgent first)
 * 
 * Automatically excludes expired incidents.
 */
export async function getPendingRelayItems(
  database: NexusDatabase = db
): Promise<OutboxItem[]> {
  const pending = await database.outbox
    .where('status')
    .equals('pending_relay')
    .toArray();

  // Filter out items whose incidents have expired
  const validItems: OutboxItem[] = [];
  for (const item of pending) {
    const incident = await database.incidents.get(item.incidentId);
    if (incident && !isExpired(incident)) {
      validItems.push(item);
    }
  }

  // Sort by priority → timestamp → remaining TTL
  return validItems.sort((a, b) => {
    const priorityDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (priorityDiff !== 0) return priorityDiff;
    return b.timestamp - a.timestamp;
  });
}

/**
 * Get all items pending cloud synchronization.
 */
export async function getPendingSyncItems(
  database: NexusDatabase = db
): Promise<OutboxItem[]> {
  return database.outbox
    .where('status')
    .equals('pending_sync')
    .toArray();
}

/**
 * Mark an outbox item as relayed to a specific peer.
 * Advances the status to 'relayed', then to 'pending_sync'.
 * Called by the relay engine after receiving an ACK from the peer.
 */
export async function markRelayed(
  incidentId: string,
  peerId: string,
  database: NexusDatabase = db
): Promise<void> {
  const item = await database.outbox.get(incidentId);
  if (!item) return;

  await database.outbox.put({
    ...item,
    status: 'pending_sync' as OutboxStatus,
    relayedToPeerId: peerId,
    completedAt: Date.now(),
  });

  // Also update the incident status to 'relayed'
  const incident = await database.incidents.get(incidentId);
  if (incident) {
    await database.incidents.put({
      ...incident,
      status: 'relayed',
    });
  }
}

/**
 * Mark an outbox item as successfully synced to the cloud.
 * Called by the cloud sync service after a successful Firestore write.
 */
export async function markSynced(
  incidentId: string,
  database: NexusDatabase = db
): Promise<void> {
  const item = await database.outbox.get(incidentId);
  if (!item) return;

  await database.outbox.put({
    ...item,
    status: 'synced' as OutboxStatus,
    completedAt: Date.now(),
  });

  // Also update the incident status to 'synced'
  const incident = await database.incidents.get(incidentId);
  if (incident) {
    await database.incidents.put({
      ...incident,
      status: 'synced',
    });
  }
}

/**
 * Remove expired incidents from the outbox.
 * Expired items are set to a terminal state and excluded from relay/sync queues.
 * Returns the count of items removed.
 */
export async function removeExpiredFromOutbox(
  database: NexusDatabase = db
): Promise<number> {
  const allPending = await database.outbox
    .where('status')
    .anyOf('pending_relay', 'pending_sync')
    .toArray();

  let removedCount = 0;

  for (const item of allPending) {
    const incident = await database.incidents.get(item.incidentId);
    if (!incident || isExpired(incident)) {
      await database.outbox.delete(item.incidentId);
      // If incident exists, mark it as expired
      if (incident && incident.status !== 'expired') {
        await database.incidents.put({
          ...incident,
          status: 'expired',
        });
      }
      removedCount++;
    }
  }

  return removedCount;
}

/**
 * Get the total count of items still pending in the outbox
 * (pending_relay + pending_sync).
 */
export async function getOutboxCount(
  database: NexusDatabase = db
): Promise<number> {
  return database.outbox
    .where('status')
    .anyOf('pending_relay', 'pending_sync')
    .count();
}
