// ============================================================
// NEXUS Offline Data Core — Incident CRUD Service
// ============================================================
// Core service for incident lifecycle management.
// Creates, reads, updates, and ingests incidents — all offline.
// No React, Firebase, WebRTC, or network dependencies.
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import { liveQuery } from 'dexie';
import { db, NexusDatabase } from './db';
import type {
  Incident,
  DraftIncident,
  IncidentStatus,
  IngestResult,
} from './types';
import { PRIORITY_ORDER } from './types';
import type {
  IFrontendIncidentService,
} from '../../shared/interfaces';
import type {
  IncidentFilter,
  IncidentId,
} from '../../shared/types';
import { validateDraft, validateIncident, formatValidationErrors } from './schema';
import { getDeviceId } from './deviceId';
import { suggestPriority } from './priority';
import { calculateTTL } from './ttl';
import { applyIncoming } from './dedup';
import { addToOutbox, getOutboxCount } from './outboxService';

/**
 * Create a new incident from user input.
 * 
 * Pipeline:
 * 1. Validate draft fields via Zod
 * 2. Generate UUIDv4 incidentId
 * 3. Get persistent device ID
 * 4. Calculate default priority (if not specified)
 * 5. Set initial system fields (version: 1, hopCount: 0, status: 'stored')
 * 6. Calculate TTL (24h from creation)
 * 7. Persist to Dexie incidents table
 * 8. Add to outbox queue
 * 
 * Returns the fully-constructed Incident.
 * Throws if validation fails.
 */
export async function createIncident(
  draft: DraftIncident,
  database: NexusDatabase = db
): Promise<Incident> {
  // Step 1: Validate the draft
  const validation = validateDraft(draft);
  if (!validation.success) {
    const errors = formatValidationErrors(validation);
    throw new Error(`Invalid incident draft: ${errors}`);
  }

  const validatedDraft = validation.data;

  // Step 2-6: Build the full incident
  const now = Date.now();
  const incidentId = uuidv4();
  const originDeviceId = await getDeviceId(database);
  const priority = validatedDraft.priority ?? suggestPriority(validatedDraft.type);

  const incident: Incident = {
    incidentId,
    originDeviceId,
    type: validatedDraft.type,
    priority,
    latitude: validatedDraft.latitude,
    longitude: validatedDraft.longitude,
    timestamp: now,
    status: 'stored',
    peopleAffected: validatedDraft.peopleAffected,
    version: 1,
    hopCount: 0,
    ttl: calculateTTL(now),
    description: validatedDraft.description,
  };

  // Step 7: Persist to Dexie
  await database.incidents.put(incident);

  // Step 8: Add to outbox for relay/sync
  await addToOutbox(incidentId, priority, now, database);

  // Update status to 'queued' (incident is now in the outbox)
  const queuedIncident: Incident = {
    ...incident,
    status: 'queued',
  };
  await database.incidents.put(queuedIncident);

  return queuedIncident;
}

/**
 * Get a single incident by its ID.
 */
export async function getIncident(
  incidentId: string,
  database: NexusDatabase = db
): Promise<Incident | undefined> {
  return database.incidents.get(incidentId);
}

/**
 * Get all incidents in the local store.
 */
export async function getAllIncidents(
  database: NexusDatabase = db
): Promise<Incident[]> {
  return database.incidents.toArray();
}

/**
 * Get incidents filtered by status.
 */
export async function getIncidentsByStatus(
  status: IncidentStatus,
  database: NexusDatabase = db
): Promise<Incident[]> {
  return database.incidents.where('status').equals(status).toArray();
}

/**
 * Get incidents filtered by priority.
 */
export async function getIncidentsByPriority(
  priority: string,
  database: NexusDatabase = db
): Promise<Incident[]> {
  return database.incidents.where('priority').equals(priority).toArray();
}

/**
 * Update the status of an existing incident.
 * Automatically increments the version number.
 */
export async function updateIncidentStatus(
  incidentId: string,
  newStatus: IncidentStatus,
  database: NexusDatabase = db
): Promise<void> {
  const existing = await database.incidents.get(incidentId);
  if (!existing) {
    throw new Error(`Incident not found: ${incidentId}`);
  }

  await database.incidents.put({
    ...existing,
    status: newStatus,
    version: existing.version + 1,
  });
}

/**
 * Ingest an incident received from a peer relay.
 * 
 * Full pipeline:
 * 1. Zod schema validation
 * 2. TTL expiration check
 * 3. Hop budget check
 * 4. Deduplication / version check
 * 5. Store in Dexie (if accepted)
 * 6. Add to outbox (if accepted and new)
 * 
 * This is the primary entry point for the relay engine (Member 1).
 */
export async function ingestFromPeer(
  incoming: unknown,
  database: NexusDatabase = db
): Promise<IngestResult> {
  // Validate that it's a valid incident first
  const validation = validateIncident(incoming);
  if (!validation.success) {
    return {
      accepted: false,
      reason: 'MALFORMED_SCHEMA',
    };
  }

  const validatedIncident = validation.data as Incident;

  // Delegate to the dedup engine (which handles TTL, hop, and version checks)
  const result = await applyIncoming(validatedIncident, database);

  // If accepted, add to outbox for further relay/sync
  if (result.accepted) {
    await addToOutbox(
      validatedIncident.incidentId,
      validatedIncident.priority,
      validatedIncident.timestamp,
      database
    );
  }

  return result;
}

/**
 * List incidents with optional filtering criteria and sorted by timestamp descending.
 */
export async function listIncidents(
  filter?: IncidentFilter,
  database: NexusDatabase = db
): Promise<Incident[]> {
  let items = await database.incidents.toArray();

  if (filter) {
    if (filter.type) {
      items = items.filter((inc) => inc.type === filter.type);
    }
    if (filter.priority) {
      items = items.filter((inc) => inc.priority === filter.priority);
    }
    if (filter.status) {
      items = items.filter((inc) => inc.status === filter.status);
    }
    if (filter.minPriority) {
      const minWeight = PRIORITY_ORDER[filter.minPriority];
      items = items.filter((inc) => PRIORITY_ORDER[inc.priority] <= minWeight);
    }
    if (filter.sinceTimestamp) {
      items = items.filter((inc) => inc.timestamp >= filter.sinceTimestamp!);
    }
    if (filter.originDeviceId) {
      items = items.filter((inc) => inc.originDeviceId === filter.originDeviceId);
    }
  }

  return items.sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Subscribes to database changes for incidents using Dexie liveQuery.
 */
export function subscribeToIncidents(
  callback: (incidents: Incident[]) => void,
  filter?: IncidentFilter,
  database: NexusDatabase = db
): () => void {
  const observable = liveQuery(() => listIncidents(filter, database));
  const subscription = observable.subscribe({
    next: (incidents) => {
      callback(incidents);
    },
    error: (err) => {
      console.error('[FrontendIncidentService] Subscription error:', err);
    },
  });

  return () => {
    subscription.unsubscribe();
  };
}

/**
 * Concrete implementation of IFrontendIncidentService.
 */
export class FrontendIncidentService implements IFrontendIncidentService {
  private database: NexusDatabase;

  constructor(database: NexusDatabase = db) {
    this.database = database;
  }

  async createIncident(draft: DraftIncident): Promise<Incident> {
    return createIncident(draft, this.database);
  }

  async getIncident(id: IncidentId): Promise<Incident | undefined> {
    return getIncident(id, this.database);
  }

  async listIncidents(filter?: IncidentFilter): Promise<Incident[]> {
    return listIncidents(filter, this.database);
  }

  subscribeToIncidents(
    callback: (incidents: Incident[]) => void,
    filter?: IncidentFilter
  ): () => void {
    return subscribeToIncidents(callback, filter, this.database);
  }

  async getOutboxCount(): Promise<number> {
    return getOutboxCount(this.database);
  }

  async updateIncidentStatus(id: IncidentId, newStatus: IncidentStatus): Promise<void> {
    return updateIncidentStatus(id, newStatus, this.database);
  }
}

/**
 * Singleton default instance for frontend application consumption.
 */
export const frontendIncidentService = new FrontendIncidentService();

