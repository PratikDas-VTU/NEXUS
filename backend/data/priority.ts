// ============================================================
// NEXUS Offline Data Core — Priority Engine
// ============================================================
// Deterministic P0-P3 priority handling.
// Works entirely offline — no network dependencies.
// ============================================================

import type { Incident, IncidentType, IncidentPriority } from './types';
import { PRIORITY_ORDER } from './types';

/**
 * Default priority mapping by incident type.
 * 
 * REPORT EMERGENCY:     medical, trapped, missing → P0
 * REPORT RESOURCE NEED: resource, shelter         → P2
 * REPORT SAFETY ISSUE:  safety                    → P3
 * 
 * Users can override the suggestion to any valid priority level.
 */
const DEFAULT_PRIORITY_MAP: Record<IncidentType, IncidentPriority> = {
  medical: 'P0',
  trapped: 'P0',
  missing: 'P0',
  resource: 'P2',
  shelter: 'P2',
  safety: 'P3',
};

/**
 * Suggest a default priority based on the incident type.
 * This is a system suggestion — the user may override it.
 */
export function suggestPriority(type: IncidentType): IncidentPriority {
  return DEFAULT_PRIORITY_MAP[type];
}

/**
 * Compare two priority levels for sorting.
 * Returns negative if `a` is higher priority, positive if `b` is higher.
 * P0 > P1 > P2 > P3 (lower numeric value = higher priority)
 */
export function comparePriority(a: IncidentPriority, b: IncidentPriority): number {
  return PRIORITY_ORDER[a] - PRIORITY_ORDER[b];
}

/**
 * Sort incidents by the NEXUS priority queue rules:
 * 1. Priority (P0 first, then P1, P2, P3)
 * 2. Recency (newest first — higher timestamp)
 * 3. Remaining TTL (least remaining time first — most urgent)
 * 
 * Returns a NEW sorted array (does not mutate the input).
 */
export function sortByPriority(incidents: Incident[]): Incident[] {
  const now = Date.now();
  return [...incidents].sort((a, b) => {
    // 1. Priority (P0 before P3)
    const priorityDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (priorityDiff !== 0) return priorityDiff;

    // 2. Recency (newest first)
    const timestampDiff = b.timestamp - a.timestamp;
    if (timestampDiff !== 0) return timestampDiff;

    // 3. Remaining TTL (least remaining = most urgent first)
    const remainingA = a.ttl - now;
    const remainingB = b.ttl - now;
    return remainingA - remainingB;
  });
}

/**
 * Get the numeric priority order value (0 = highest, 3 = lowest).
 */
export function getPriorityOrder(priority: IncidentPriority): number {
  return PRIORITY_ORDER[priority];
}
