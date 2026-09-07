/**
 * NEXUS — Offline-First Emergency & Community Network
 * Shared Constants & System Defaults
 */

import type { IncidentPriority, IncidentStatus, IncidentType } from './types.ts';

/** Protocol wire version */
export const PROTOCOL_VERSION = '1.0.0';

/** Maximum peer-to-peer relay hops before dropping/halting forwarding */
export const MAX_HOPS = 3;

/** Default incident Time-To-Live: 24 hours in milliseconds */
export const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 86,400,000 ms

/** Maximum allowable future clock skew (5 minutes in milliseconds) */
export const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

/** Default priority mappings per incident type */
export const DEFAULT_PRIORITY_BY_TYPE: Record<IncidentType, IncidentPriority> = {
  medical: 'P0',
  trapped: 'P0',
  missing: 'P0',
  resource: 'P2',
  shelter: 'P2',
  safety: 'P3',
};

/** Numeric priority weights (lower number = higher urgency) */
export const PRIORITY_WEIGHTS: Record<IncidentPriority, number> = {
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
};

/** All canonical incident types */
export const ALL_INCIDENT_TYPES: readonly IncidentType[] = [
  'medical',
  'trapped',
  'missing',
  'resource',
  'shelter',
  'safety',
] as const;

/** All canonical incident priority levels */
export const ALL_INCIDENT_PRIORITIES: readonly IncidentPriority[] = [
  'P0',
  'P1',
  'P2',
  'P3',
] as const;

/** All canonical incident lifecycle statuses */
export const ALL_INCIDENT_STATUSES: readonly IncidentStatus[] = [
  'reported',
  'stored',
  'queued',
  'relayed',
  'synced',
  'verified',
  'assigned',
  'resolved',
  'expired',
] as const;

/**
 * Checks if an incident priority is higher urgency than another.
 * e.g. isHigherPriority('P0', 'P1') === true
 */
export function isHigherPriority(a: IncidentPriority, b: IncidentPriority): boolean {
  return PRIORITY_WEIGHTS[a] < PRIORITY_WEIGHTS[b];
}

/**
 * Checks whether an incident has expired based on current epoch time.
 */
export function isIncidentExpired(timestamp: number, ttl: number, now: number = Date.now()): boolean {
  return now > timestamp + ttl;
}

/**
 * Checks whether an incident is eligible for peer forwarding.
 * Stops forwarding if:
 * 1. Hop budget exhausted (hopCount >= MAX_HOPS)
 * 2. TTL expired
 * 3. Status is 'resolved' or 'expired'
 */
export function isEligibleForForwarding(
  incident: { hopCount: number; timestamp: number; ttl: number; status: IncidentStatus },
  now: number = Date.now()
): boolean {
  if (incident.hopCount >= MAX_HOPS) return false;
  if (incident.status === 'resolved' || incident.status === 'expired') return false;
  if (isIncidentExpired(incident.timestamp, incident.ttl, now)) return false;
  return true;
}
