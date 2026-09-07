// ============================================================
// NEXUS Offline Data Core — Storage Adapter for Networking
// ============================================================
// Exposes the boundary interface required by the networking layer
// without leaking Dexie or IndexedDB implementation details.
// Pure offline coordination boundary.
// ============================================================

import { NexusDatabase, db } from './db';
import type { Incident, IngestResult } from './types';
import { ingestFromPeer } from './incidentService';
import { markRelayed as markOutboxRelayed, getPendingRelayItems } from './outboxService';
import { isExpired, isHopBudgetExhausted } from './ttl';

/**
 * Manifest item representing an incident and its version
 * for local peer manifest exchange.
 */
export interface ManifestItem {
  incidentId: string;
  version: number;
}

/**
 * IOfflineStorageAdapter — Contract boundary expected by the Networking Layer.
 * Networking must NOT access Dexie or IndexedDB directly.
 */
export interface IOfflineStorageAdapter {
  /**
   * Retrieves the current local incident manifest.
   * Excludes expired or terminal incidents.
   */
  getManifest(): Promise<ManifestItem[]>;

  /**
   * Retrieves full incident records pending outbound peer relay.
   * Sorted by priority (P0 > P1 > P2 > P3), timestamp, and remaining TTL.
   * Excludes expired incidents and incidents with exhausted hop budgets.
   * 
   * @param limit - Optional maximum number of items to retrieve
   */
  getPendingOutbox(limit?: number): Promise<Incident[]>;

  /**
   * Ingests an incident payload received from a peer.
   * Enforces schema validation, TTL check, hop budget check, and dedup.
   * 
   * @param incident - Inbound raw or structured payload
   */
  ingestRelayedIncident(incident: unknown): Promise<IngestResult>;

  /**
   * Updates state when an incident is successfully relayed to a peer.
   * Advances both outbox and incident records to 'relayed'.
   * 
   * @param incidentId - ID of the relayed incident
   * @param peerId - ID of the receiving peer
   */
  markRelayed(incidentId: string, peerId: string): Promise<void>;

  /**
   * Checks whether the local store possesses the specified incident.
   * If version is provided, returns true only if the stored version >= version.
   * 
   * @param incidentId - Unique incident UUID
   * @param version - Optional minimum version requirement
   */
  hasIncident(incidentId: string, version?: number): Promise<boolean>;

  /**
   * Retrieves full incident records for an array of incident IDs.
   * Used when responding to a peer's REQUEST packet.
   * 
   * @param incidentIds - Array of requested incident IDs
   */
  getIncidentsByIds(incidentIds: string[]): Promise<Incident[]>;
}

/**
 * OfflineStorageAdapter — Implementation of IOfflineStorageAdapter.
 */
export class OfflineStorageAdapter implements IOfflineStorageAdapter {
  private database: NexusDatabase;

  constructor(database: NexusDatabase = db) {
    this.database = database;
  }

  async getManifest(): Promise<ManifestItem[]> {
    const all = await this.database.incidents.toArray();
    const now = Date.now();
    return all
      .filter((inc) => !isExpired(inc, now) && inc.status !== 'expired')
      .map((inc) => ({
        incidentId: inc.incidentId,
        version: inc.version,
      }));
  }

  async getPendingOutbox(limit?: number): Promise<Incident[]> {
    const pendingItems = await getPendingRelayItems(this.database);
    const now = Date.now();
    const incidents: Incident[] = [];

    for (const item of pendingItems) {
      const inc = await this.database.incidents.get(item.incidentId);
      if (
        inc &&
        !isExpired(inc, now) &&
        !isHopBudgetExhausted(inc) &&
        inc.status !== 'expired' &&
        inc.status !== 'resolved'
      ) {
        incidents.push(inc);
      }
    }

    if (typeof limit === 'number' && limit > 0) {
      return incidents.slice(0, limit);
    }
    return incidents;
  }

  async ingestRelayedIncident(incident: unknown): Promise<IngestResult> {
    return ingestFromPeer(incident, this.database);
  }

  async markRelayed(incidentId: string, peerId: string): Promise<void> {
    return markOutboxRelayed(incidentId, peerId, this.database);
  }

  async hasIncident(incidentId: string, version?: number): Promise<boolean> {
    const existing = await this.database.incidents.get(incidentId);
    if (!existing) return false;
    if (typeof version === 'number') {
      return existing.version >= version;
    }
    return true;
  }

  async getIncidentsByIds(incidentIds: string[]): Promise<Incident[]> {
    const results: Incident[] = [];
    for (const id of incidentIds) {
      const inc = await this.database.incidents.get(id);
      if (inc) {
        results.push(inc);
      }
    }
    return results;
  }
}

/**
 * Default singleton storage adapter for the application.
 */
export const offlineStorageAdapter = new OfflineStorageAdapter();
