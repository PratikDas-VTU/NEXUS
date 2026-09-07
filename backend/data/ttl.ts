// ============================================================
// NEXUS Offline Data Core — TTL & Hop Count Utilities
// ============================================================
// Handles incident expiration and relay budget enforcement.
// No network dependencies.
// ============================================================

import type { Incident } from './types';
import { DEFAULT_TTL_DURATION_MS, MAX_HOP_COUNT } from './types';

/**
 * Calculate the TTL (expiration timestamp) for a new incident.
 * Default duration is 24 hours from the creation timestamp.
 * 
 * @param timestamp - The incident creation timestamp (epoch ms)
 * @param durationMs - Optional custom TTL duration in milliseconds
 * @returns The expiration epoch timestamp in milliseconds
 */
export function calculateTTL(
  timestamp: number,
  durationMs: number = DEFAULT_TTL_DURATION_MS
): number {
  return timestamp + durationMs;
}

/**
 * Check if an incident has expired.
 * Expired incidents are retained for audit but removed from relay queues.
 * 
 * @param incident - The incident to check
 * @param now - Optional current time override (for testing)
 * @returns true if the incident has expired
 */
export function isExpired(incident: Incident, now: number = Date.now()): boolean {
  return now >= incident.ttl;
}

/**
 * Check if an incident's relay hop budget is exhausted.
 * Incidents that have reached the max hop count must stop propagating.
 * 
 * @param incident - The incident to check
 * @param maxHops - Optional custom max hop count (default: 3)
 * @returns true if the hop budget is exhausted
 */
export function isHopBudgetExhausted(
  incident: Incident,
  maxHops: number = MAX_HOP_COUNT
): boolean {
  return incident.hopCount >= maxHops;
}

/**
 * Determine if an incident is eligible for forwarding to a peer.
 * An incident can be forwarded if:
 * - It has NOT expired (TTL not exceeded)
 * - Its hop budget is NOT exhausted
 * - Its status is NOT 'resolved' or 'expired'
 * 
 * @param incident - The incident to evaluate
 * @param now - Optional current time override (for testing)
 * @returns true if the incident can be forwarded
 */
export function canForward(incident: Incident, now: number = Date.now()): boolean {
  if (isExpired(incident, now)) return false;
  if (isHopBudgetExhausted(incident)) return false;
  if (incident.status === 'resolved' || incident.status === 'expired') return false;
  return true;
}

/**
 * Create a copy of the incident with hopCount incremented by 1.
 * Used when relaying an incident to a peer.
 * Does NOT mutate the original incident.
 * 
 * @param incident - The incident to increment
 * @returns A new Incident object with hopCount + 1
 */
export function incrementHop(incident: Incident): Incident {
  return {
    ...incident,
    hopCount: incident.hopCount + 1,
  };
}

/**
 * Calculate the remaining TTL in milliseconds.
 * Returns 0 if already expired.
 * 
 * @param incident - The incident to check
 * @param now - Optional current time override (for testing)
 * @returns Remaining TTL in milliseconds (>= 0)
 */
export function remainingTTL(incident: Incident, now: number = Date.now()): number {
  return Math.max(0, incident.ttl - now);
}
