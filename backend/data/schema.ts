// ============================================================
// NEXUS Offline Data Core — Zod Validation Schemas
// ============================================================
// Runtime validation for all incident data entering the system.
// Malformed data is rejected before it can corrupt the local store.
// Compatible with Zod v4 API.
// ============================================================

import { z } from 'zod';
import {
  INCIDENT_TYPES,
  INCIDENT_PRIORITIES,
  INCIDENT_STATUSES,
} from './types';

// ============================================================
// Core Incident Schema — validates the full 12-field envelope
// ============================================================

export const incidentSchema = z.object({
  incidentId: z.string().uuid('incidentId must be a valid UUIDv4'),
  originDeviceId: z.string().min(1, 'originDeviceId must be a non-empty string'),
  type: z.enum(INCIDENT_TYPES),
  priority: z.enum(INCIDENT_PRIORITIES),
  latitude: z.number().min(-90, 'latitude must be >= -90').max(90, 'latitude must be <= 90'),
  longitude: z.number().min(-180, 'longitude must be >= -180').max(180, 'longitude must be <= 180'),
  timestamp: z.number().int('timestamp must be an integer').positive('timestamp must be positive'),
  status: z.enum(INCIDENT_STATUSES),
  peopleAffected: z.number().int('peopleAffected must be an integer').min(1, 'peopleAffected must be >= 1'),
  version: z.number().int('version must be an integer').min(1, 'version must be >= 1'),
  hopCount: z.number().int('hopCount must be an integer').min(0, 'hopCount must be >= 0'),
  ttl: z.number().int('ttl must be an integer').positive('ttl must be positive'),
  description: z.string().optional(),
});

// ============================================================
// Draft Incident Schema — validates user-supplied creation fields
// ============================================================

export const draftIncidentSchema = z.object({
  type: z.enum(INCIDENT_TYPES),
  priority: z.enum(INCIDENT_PRIORITIES).optional(),
  latitude: z.number().min(-90, 'latitude must be >= -90').max(90, 'latitude must be <= 90'),
  longitude: z.number().min(-180, 'longitude must be >= -180').max(180, 'longitude must be <= 180'),
  peopleAffected: z.number().int('peopleAffected must be an integer').min(1, 'peopleAffected must be >= 1'),
  description: z.string().optional(),
});

// ============================================================
// Peer Payload Schema — validates inbound peer relay packets
// Same as full incident schema (peers send complete envelopes)
// ============================================================

export const peerPayloadSchema = incidentSchema;

// ============================================================
// Validation Helper Functions
// ============================================================

/** Result type from safeParse — either success with data or failure with error */
export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: z.ZodError };

/**
 * Validate a full incident record.
 * Returns the parsed incident on success, or an error object on failure.
 */
export function validateIncident(data: unknown): ValidationResult<z.infer<typeof incidentSchema>> {
  return incidentSchema.safeParse(data) as ValidationResult<z.infer<typeof incidentSchema>>;
}

/**
 * Validate a draft incident from user input.
 * Returns the parsed draft on success, or an error object on failure.
 */
export function validateDraft(data: unknown): ValidationResult<z.infer<typeof draftIncidentSchema>> {
  return draftIncidentSchema.safeParse(data) as ValidationResult<z.infer<typeof draftIncidentSchema>>;
}

/**
 * Validate an inbound peer payload.
 * Returns the parsed incident on success, or an error object on failure.
 */
export function validatePeerPayload(data: unknown): ValidationResult<z.infer<typeof peerPayloadSchema>> {
  return peerPayloadSchema.safeParse(data) as ValidationResult<z.infer<typeof peerPayloadSchema>>;
}

/**
 * Extract a human-readable error message from a Zod validation result.
 */
export function formatValidationErrors(result: { success: boolean; error?: z.ZodError }): string {
  if (result.success) return '';
  if (!result.error) return '';
  return result.error.issues.map((i: z.ZodIssue) => `${i.path.join('.')}: ${i.message}`).join('; ');
}
