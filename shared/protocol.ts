/**
 * NEXUS — Offline-First Emergency & Community Network
 * Shared Relay Protocol Envelopes & Wire Messages
 * 
 * Implements the 6-stage store-carry-forward handshake:
 * HELLO -> MANIFEST -> MISSING -> REQUEST -> PAYLOAD -> ACK (+ FORWARD)
 */

import type { DeviceId, Incident, IncidentId, IncidentManifestItem } from './types.ts';
import { PROTOCOL_VERSION } from './constants.ts';

export type ProtocolMessageType =
  | 'HELLO'
  | 'MANIFEST'
  | 'MISSING'
  | 'REQUEST'
  | 'PAYLOAD'
  | 'ACK'
  | 'FORWARD';

export type ProtocolErrorCode =
  | 'MALFORMED_ENVELOPE'
  | 'UNSUPPORTED_VERSION'
  | 'STALE_VERSION'
  | 'TTL_EXPIRED'
  | 'HOP_BUDGET_EXCEEDED'
  | 'SCHEMA_VALIDATION_FAILED'
  | 'STORAGE_ERROR';

/** Base envelope present on all over-the-wire messages */
export interface BaseRelayMessage {
  /** Discriminator tag */
  type: ProtocolMessageType;
  /** Unique message envelope ID for idempotency */
  messageId: string;
  /** Sender's device identifier */
  senderDeviceId: DeviceId;
  /** Unix epoch timestamp when message was packed */
  timestamp: number;
  /** Protocol version string */
  protocolVersion: string;
}

/** Stage 1: Peer discovery and capability handshake */
export interface HelloMessage extends BaseRelayMessage {
  type: 'HELLO';
  sessionId: string;
  capabilities: {
    maxBatchSize: number;
    supportedTypes: readonly string[];
  };
}

/** Stage 2: Inventory advertisement of locally held incidents */
export interface ManifestMessage extends BaseRelayMessage {
  type: 'MANIFEST';
  sessionId: string;
  items: IncidentManifestItem[];
}

/** Stage 3: Notification of items that one peer needs from another */
export interface MissingMessage extends BaseRelayMessage {
  type: 'MISSING';
  sessionId: string;
  missingItems: IncidentManifestItem[];
}

/** Stage 4: Specific payload request */
export interface RequestMessage extends BaseRelayMessage {
  type: 'REQUEST';
  sessionId: string;
  requestedIds: IncidentId[];
}

/** Stage 5: Incident data payload transfer */
export interface PayloadMessage extends BaseRelayMessage {
  type: 'PAYLOAD';
  sessionId: string;
  incidents: Incident[];
}

/** Detail for rejected items in an ACK */
export interface AckRejectionItem {
  incidentId: IncidentId;
  code: ProtocolErrorCode;
  reason: string;
}

/** Stage 6: Persistence confirmation */
export interface AckMessage extends BaseRelayMessage {
  type: 'ACK';
  sessionId: string;
  acceptedIncidentIds: IncidentId[];
  rejectedItems?: AckRejectionItem[];
}

/** Forward announcement: broadcast/relay notification */
export interface ForwardMessage extends BaseRelayMessage {
  type: 'FORWARD';
  sessionId: string;
  incidentId: IncidentId;
  hopCount: number;
}

/** Discriminated union of all possible wire messages */
export type RelayMessage =
  | HelloMessage
  | ManifestMessage
  | MissingMessage
  | RequestMessage
  | PayloadMessage
  | AckMessage
  | ForwardMessage;

// ─── HELPER FACTORY FUNCTIONS ────────────────────────────────────────────────

export function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function createHelloMessage(
  senderDeviceId: DeviceId,
  sessionId: string,
  maxBatchSize: number = 50
): HelloMessage {
  return {
    type: 'HELLO',
    messageId: generateMessageId(),
    senderDeviceId,
    sessionId,
    timestamp: Date.now(),
    protocolVersion: PROTOCOL_VERSION,
    capabilities: {
      maxBatchSize,
      supportedTypes: ['medical', 'trapped', 'missing', 'resource', 'shelter', 'safety'],
    },
  };
}

export function createManifestMessage(
  senderDeviceId: DeviceId,
  sessionId: string,
  items: IncidentManifestItem[]
): ManifestMessage {
  return {
    type: 'MANIFEST',
    messageId: generateMessageId(),
    senderDeviceId,
    sessionId,
    timestamp: Date.now(),
    protocolVersion: PROTOCOL_VERSION,
    items,
  };
}

export function createMissingMessage(
  senderDeviceId: DeviceId,
  sessionId: string,
  missingItems: IncidentManifestItem[]
): MissingMessage {
  return {
    type: 'MISSING',
    messageId: generateMessageId(),
    senderDeviceId,
    sessionId,
    timestamp: Date.now(),
    protocolVersion: PROTOCOL_VERSION,
    missingItems,
  };
}

export function createRequestMessage(
  senderDeviceId: DeviceId,
  sessionId: string,
  requestedIds: IncidentId[]
): RequestMessage {
  return {
    type: 'REQUEST',
    messageId: generateMessageId(),
    senderDeviceId,
    sessionId,
    timestamp: Date.now(),
    protocolVersion: PROTOCOL_VERSION,
    requestedIds,
  };
}

export function createPayloadMessage(
  senderDeviceId: DeviceId,
  sessionId: string,
  incidents: Incident[]
): PayloadMessage {
  return {
    type: 'PAYLOAD',
    messageId: generateMessageId(),
    senderDeviceId,
    sessionId,
    timestamp: Date.now(),
    protocolVersion: PROTOCOL_VERSION,
    incidents,
  };
}

export function createAckMessage(
  senderDeviceId: DeviceId,
  sessionId: string,
  acceptedIncidentIds: IncidentId[],
  rejectedItems?: AckRejectionItem[]
): AckMessage {
  return {
    type: 'ACK',
    messageId: generateMessageId(),
    senderDeviceId,
    sessionId,
    timestamp: Date.now(),
    protocolVersion: PROTOCOL_VERSION,
    acceptedIncidentIds,
    rejectedItems: rejectedItems && rejectedItems.length > 0 ? rejectedItems : undefined,
  };
}

/**
 * Type guard for RelayMessage
 */
export function isRelayMessage(msg: unknown): msg is RelayMessage {
  if (typeof msg !== 'object' || msg === null) return false;
  const candidate = msg as Partial<BaseRelayMessage>;
  if (typeof candidate.type !== 'string') return false;
  return (
    candidate.type === 'HELLO' ||
    candidate.type === 'MANIFEST' ||
    candidate.type === 'MISSING' ||
    candidate.type === 'REQUEST' ||
    candidate.type === 'PAYLOAD' ||
    candidate.type === 'ACK' ||
    candidate.type === 'FORWARD'
  );
}
