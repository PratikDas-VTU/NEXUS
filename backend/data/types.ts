// ============================================================
// NEXUS Offline Data Core — Type Definitions
// ============================================================
// Frozen incident contract as specified in 05_DATA_CONTRACT.md
// DO NOT modify these types without team-wide coordination.
// ============================================================

/**
 * Incident type categories.
 * REPORT EMERGENCY: medical, trapped, missing
 * REPORT RESOURCE NEED: resource, shelter
 * REPORT SAFETY ISSUE: safety
 */
export const INCIDENT_TYPES = ['medical', 'trapped', 'missing', 'resource', 'shelter', 'safety'] as const;
export type IncidentType = typeof INCIDENT_TYPES[number];

/**
 * Priority levels.
 * P0 — Life-threatening (immediate response)
 * P1 — Urgent (severe but not immediately fatal)
 * P2 — Resource / shelter
 * P3 — Safety / information
 */
export const INCIDENT_PRIORITIES = ['P0', 'P1', 'P2', 'P3'] as const;
export type IncidentPriority = typeof INCIDENT_PRIORITIES[number];

/**
 * Incident lifecycle statuses.
 * Active sequence: reported → stored → queued → relayed → synced → verified → assigned → resolved
 * Terminal audit: expired
 */
export const INCIDENT_STATUSES = [
  'reported', 'stored', 'queued', 'relayed', 'synced',
  'verified', 'assigned', 'resolved', 'expired'
] as const;
export type IncidentStatus = typeof INCIDENT_STATUSES[number];

/**
 * The frozen 12-field Incident envelope.
 * This is the canonical data shape across all NEXUS modules.
 */
export interface Incident {
  /** UUIDv4 — globally unique incident identity */
  incidentId: string;
  /** Unique ID of the device that originally created this report */
  originDeviceId: string;
  /** Incident category */
  type: IncidentType;
  /** Severity level */
  priority: IncidentPriority;
  /** GPS latitude (-90 to +90) */
  latitude: number;
  /** GPS longitude (-180 to +180) */
  longitude: number;
  /** Creation epoch timestamp in milliseconds */
  timestamp: number;
  /** Current lifecycle state */
  status: IncidentStatus;
  /** Number of people affected (>= 1) */
  peopleAffected: number;
  /** Monotonically increasing version (starts at 1) */
  version: number;
  /** Hop counter for relay tracking (starts at 0) */
  hopCount: number;
  /** Expiration epoch timestamp in milliseconds */
  ttl: number;
  /** Optional short description / evidence */
  description?: string;
}

/**
 * Draft incident — fields supplied by the user during creation.
 * System-generated fields (incidentId, originDeviceId, timestamp,
 * status, version, hopCount, ttl) are computed by the service layer.
 */
export interface DraftIncident {
  type: IncidentType;
  priority?: IncidentPriority; // Optional — system will suggest default
  latitude: number;
  longitude: number;
  peopleAffected: number;
  description?: string;
}

// ============================================================
// Outbox & Supporting Store Types
// ============================================================

/** Outbox relay/sync status */
export const OUTBOX_STATUSES = ['pending_relay', 'relayed', 'pending_sync', 'synced'] as const;
export type OutboxStatus = typeof OUTBOX_STATUSES[number];

/**
 * Outbox item — tracks relay and sync state for each incident.
 * Synchronization bookkeeping is kept HERE, not on the Incident entity.
 */
export interface OutboxItem {
  /** References incidents.incidentId */
  incidentId: string;
  /** Current outbox status */
  status: OutboxStatus;
  /** Cached priority for queue ordering */
  priority: IncidentPriority;
  /** When the incident was added to the outbox */
  timestamp: number;
  /** Number of relay/sync retry attempts */
  retryCount: number;
  /** ID of the peer that received this incident (set on relay) */
  relayedToPeerId?: string;
  /** Epoch ms when relay/sync was completed */
  completedAt?: number;
}

/**
 * Peer cache entry — tracks known peers for relay.
 */
export interface PeerCacheEntry {
  peerId: string;
  lastSeen: number;
  displayName?: string;
}

/**
 * Device record — persistent local device identity.
 */
export interface DeviceRecord {
  id: string; // Always 'local' — singleton record
  deviceId: string;
  createdAt: number;
}

/**
 * Sync state record — tracks cloud synchronization checkpoints.
 */
export interface SyncStateRecord {
  id: string; // Always 'default' — singleton record
  lastSyncTimestamp: number;
  lastSyncedIncidentId?: string;
  syncInProgress: boolean;
}

// ============================================================
// Result Types
// ============================================================

export type DedupResult = 'NEW' | 'UPDATE' | 'DUPLICATE' | 'STALE';

export interface IngestResult {
  accepted: boolean;
  reason?: string;
  result?: DedupResult;
}

/** Priority numeric mapping for sorting (lower = higher priority) */
export const PRIORITY_ORDER: Record<IncidentPriority, number> = {
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
};

/** Default TTL duration: 24 hours in milliseconds */
export const DEFAULT_TTL_DURATION_MS = 24 * 60 * 60 * 1000;

/** Maximum hop count before relay budget is exhausted */
export const MAX_HOP_COUNT = 3;
