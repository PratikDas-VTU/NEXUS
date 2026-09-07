/**
 * NEXUS — Offline-First Emergency & Community Network
 * In-Memory Mock Storage Adapter
 * 
 * Provides an isolated in-memory implementation of `IOfflineStorageAdapter`
 * for testing and verification without coupling to IndexedDB or Dexie.
 */

import type { Incident, IncidentId, IncidentManifestItem } from '../shared/types.ts';
import type { IngestionResult, IOfflineStorageAdapter } from '../shared/interfaces.ts';
import { isIncidentExpired, MAX_HOPS } from '../shared/constants.ts';

export class MockStorageAdapter implements IOfflineStorageAdapter {
  private incidents = new Map<IncidentId, Incident>();
  private outbox = new Set<IncidentId>();
  private relayedRecords = new Map<IncidentId, { relayedToPeer: string; relayedAt: number }>();

  public async getManifest(): Promise<IncidentManifestItem[]> {
    const items: IncidentManifestItem[] = [];
    for (const [id, inc] of this.incidents) {
      items.push({ incidentId: id, version: inc.version });
    }
    return items;
  }

  public async getPendingOutbox(limit: number = 50): Promise<Incident[]> {
    const results: Incident[] = [];
    for (const id of this.outbox) {
      const inc = this.incidents.get(id);
      if (inc) {
        results.push(inc);
        if (results.length >= limit) break;
      }
    }
    return results;
  }

  public async ingestRelayedIncident(incoming: Incident): Promise<IngestionResult> {
    // 1. Hop budget check
    if (incoming.hopCount > MAX_HOPS) {
      return {
        accepted: false,
        incidentId: incoming.incidentId,
        code: 'HOP_BUDGET_EXCEEDED',
        reason: `Hop count ${incoming.hopCount} exceeds maximum ${MAX_HOPS}`,
      };
    }

    // 2. TTL check
    if (isIncidentExpired(incoming.timestamp, incoming.ttl)) {
      return {
        accepted: false,
        incidentId: incoming.incidentId,
        code: 'TTL_EXPIRED',
        reason: 'Incident TTL has expired',
      };
    }

    // 3. Deduplication and versioning check
    const existing = this.incidents.get(incoming.incidentId);
    if (existing) {
      if (incoming.version <= existing.version) {
        // Ignore stale or duplicate update
        return {
          accepted: false,
          incidentId: incoming.incidentId,
          code: 'STALE_VERSION',
          reason: `Incoming version ${incoming.version} <= local version ${existing.version}`,
        };
      }
    }

    // 4. Accept and persist
    this.incidents.set(incoming.incidentId, { ...incoming });
    this.outbox.add(incoming.incidentId);

    return {
      accepted: true,
      incidentId: incoming.incidentId,
    };
  }

  public async markRelayed(incidentId: IncidentId, peerId: string): Promise<void> {
    const inc = this.incidents.get(incidentId);
    if (inc) {
      inc.status = 'relayed';
    }
    this.outbox.delete(incidentId);
    this.relayedRecords.set(incidentId, { relayedToPeer: peerId, relayedAt: Date.now() });
  }

  public async hasIncident(incidentId: IncidentId, version?: number): Promise<boolean> {
    const inc = this.incidents.get(incidentId);
    if (!inc) return false;
    if (version !== undefined && inc.version < version) return false;
    return true;
  }

  public async getIncidentsByIds(incidentIds: IncidentId[]): Promise<Incident[]> {
    const results: Incident[] = [];
    for (const id of incidentIds) {
      const inc = this.incidents.get(id);
      if (inc) {
        results.push({ ...inc });
      }
    }
    return results;
  }

  // ─── TEST UTILITIES ────────────────────────────────────────────────────────

  /** Seed an incident directly into storage (for test setup) */
  public seedIncident(incident: Incident, addToOutbox: boolean = true): void {
    this.incidents.set(incident.incidentId, { ...incident });
    if (addToOutbox) {
      this.outbox.add(incident.incidentId);
    }
  }

  /** Direct retrieval for assertions */
  public getLocalIncident(id: IncidentId): Incident | undefined {
    return this.incidents.get(id);
  }

  /** Total count of stored incidents */
  public size(): number {
    return this.incidents.size;
  }
}
