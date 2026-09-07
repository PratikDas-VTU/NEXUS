// ============================================================
// NEXUS Offline Data Core — Deduplication Engine
// ============================================================
// Prevents duplicate logical incidents in the local store.
// Uses incidentId + version for conflict resolution.
// ============================================================

import { db, NexusDatabase } from './db';
import type { Incident, DedupResult, IngestResult } from './types';
import { validateIncident } from './schema';
import { isExpired, isHopBudgetExhausted } from './ttl';

/**
 * Check if an incoming incident is a duplicate, update, or new record.
 * 
 * Rules:
 * - Different incidentId           → NEW
 * - Same incidentId + newer version → UPDATE
 * - Same incidentId + same version  → DUPLICATE (ignore)
 * - Same incidentId + older version → STALE (ignore)
 */
export async function checkDuplicate(
  incoming: Incident,
  database: NexusDatabase = db
): Promise<DedupResult> {
  const existing = await database.incidents.get(incoming.incidentId);

  if (!existing) {
    return 'NEW';
  }

  if (incoming.version > existing.version) {
    return 'UPDATE';
  }

  if (incoming.version === existing.version) {
    return 'DUPLICATE';
  }

  // incoming.version < existing.version
  return 'STALE';
}

/**
 * Apply an incoming incident through the full deduplication pipeline.
 * 
 * Pipeline:
 * 1. Zod schema validation
 * 2. TTL expiration check
 * 3. Hop budget check
 * 4. Deduplication / version comparison
 * 5. Store or update in Dexie
 * 
 * Returns whether the incident was accepted and the reason if rejected.
 */
export async function applyIncoming(
  incoming: Incident,
  database: NexusDatabase = db
): Promise<IngestResult> {
  // Step 1: Validate schema
  const validation = validateIncident(incoming);
  if (!validation.success) {
    return {
      accepted: false,
      reason: 'MALFORMED_SCHEMA',
    };
  }

  const validated = validation.data as Incident;

  // Step 2: Check TTL expiration
  if (isExpired(validated)) {
    return {
      accepted: false,
      reason: 'EXPIRED_TTL',
    };
  }

  // Step 3: Check hop budget
  if (isHopBudgetExhausted(validated)) {
    return {
      accepted: false,
      reason: 'HOP_BUDGET_EXHAUSTED',
    };
  }

  // Step 4: Deduplication check
  const dedupResult = await checkDuplicate(validated, database);

  switch (dedupResult) {
    case 'NEW':
      // Store the new incident with status 'stored'
      await database.incidents.put({
        ...validated,
        status: 'stored',
      });
      return { accepted: true, result: 'NEW' };

    case 'UPDATE':
      // Overwrite with the newer version
      await database.incidents.put({
        ...validated,
        status: 'stored',
      });
      return { accepted: true, result: 'UPDATE' };

    case 'DUPLICATE':
      return {
        accepted: false,
        reason: 'STALE_OR_DUPLICATE',
        result: 'DUPLICATE',
      };

    case 'STALE':
      return {
        accepted: false,
        reason: 'STALE_OR_DUPLICATE',
        result: 'STALE',
      };

    default:
      return {
        accepted: false,
        reason: 'UNKNOWN_ERROR',
      };
  }
}
