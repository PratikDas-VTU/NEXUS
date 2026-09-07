// ============================================================
// NEXUS Offline Data Core — Incident CRUD Service
// ============================================================
// Core service for incident lifecycle management.
// Creates, reads, updates, and ingests incidents — all offline.
// No React, Firebase, WebRTC, or network dependencies.
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import { db, NexusDatabase } from './db';
import type {
  Incident,
  DraftIncident,
  IncidentStatus,
  IngestResult,
} from './types';
import { validateDraft, validateIncident } from './schema';
import { getDeviceId } from './deviceId';
import { suggestPriority } from './priority';
import { calculateTTL } from './ttl';
import { applyIncoming } from './dedup';
import { addToOutbox } from './outboxService';

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
    const errors = validation.error.issues
      .map((i) => `${String(i.path.join('.'))}: ${i.message}`)
      .join('; ');
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
