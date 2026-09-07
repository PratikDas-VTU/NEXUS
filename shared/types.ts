/**
 * NEXUS — Offline-First Emergency & Community Network
 * Shared Domain Contracts & Core Types
 * 
 * NOTE: This is the frozen data contract defined in 00_SHARED/05_DATA_CONTRACT.md.
 * It is transport-independent and framework-agnostic.
 * Do not couple directly to React, Dexie, Firebase, or WebRTC.
 */

/** Primary incident identifier (UUIDv4) */
export type IncidentId = string;

/** Identifier for the originating physical device (e.g. DEV-XXXX) */
export type DeviceId = string;

/** Semantic version number (integer >= 1) */
export type IncidentVersion = number;

/** Emergency incident categories supported by NEXUS */
export type IncidentType =
  | 'medical'
  | 'trapped'
  | 'missing'
  | 'resource'
  | 'shelter'
  | 'safety';

/**
 * Priority levels:
 * - P0: Life-threatening (medical, trapped, missing)
 * - P1: Urgent
 * - P2: Resource / Shelter
 * - P3: Safety / Informational
 */
export type IncidentPriority = 'P0' | 'P1' | 'P2' | 'P3';

/**
 * Incident lifecycle status:
 * Active lifecycle: reported -> stored -> queued -> relayed -> synced -> verified -> assigned -> resolved
 * Terminal audit state: expired (retained for audit, not forwarded)
 */
export type IncidentStatus =
  | 'reported'
  | 'stored'
  | 'queued'
  | 'relayed'
  | 'synced'
  | 'verified'
  | 'assigned'
  | 'resolved'
  | 'expired';

/**
 * Frozen NEXUS Incident Envelope (12 required fields + optional description).
 * Represents a single canonical emergency or community incident record.
 */
export interface Incident {
  /** Unique primary incident identifier */
  incidentId: IncidentId;

  /** Physical hardware or client instance ID that originated the incident */
  originDeviceId: DeviceId;

  /** Category of emergency or report */
  type: IncidentType;

  /** Severity ranking (P0 - P3) */
  priority: IncidentPriority;

  /** GPS latitude in decimal degrees (-90 to +90) */
  latitude: number;

  /** GPS longitude in decimal degrees (-180 to +180) */
  longitude: number;

  /** Creation timestamp in Unix epoch milliseconds */
  timestamp: number;

  /** Current lifecycle status */
  status: IncidentStatus;

  /** Estimated number of individuals requiring assistance */
  peopleAffected: number;

  /** Monotonically increasing version counter for deduplication and updates */
  version: IncidentVersion;

  /** Number of peer-to-peer relay hops traversed so far (max budget: 3) */
  hopCount: number;

  /** Time-to-live duration in milliseconds (default: 86,400,000 / 24h) */
  ttl: number;

  /** Optional descriptive details / citizen notes */
  description?: string;
}

/**
 * Draft incident created from user input before system assigns
 * identifiers, origin device, version, hop count, and TTL defaults.
 */
export interface DraftIncident {
  type: IncidentType;
  priority?: IncidentPriority;
  latitude: number;
  longitude: number;
  peopleAffected: number;
  description?: string;
}

/**
 * Lightweight manifest entry used during peer synchronization
 * to advertise locally held incident versions.
 */
export interface IncidentManifestItem {
  incidentId: IncidentId;
  version: IncidentVersion;
}

/**
 * Query filter criteria for retrieving incidents
 */
export interface IncidentFilter {
  type?: IncidentType;
  priority?: IncidentPriority;
  status?: IncidentStatus;
  minPriority?: IncidentPriority;
  sinceTimestamp?: number;
  originDeviceId?: DeviceId;
}

/**
 * Metadata recorded for relay trace and store-carry-forward hops
 */
export interface RelayHopRecord {
  relayDeviceId: DeviceId;
  relayedAt: number;
  hopNumber: number;
}
