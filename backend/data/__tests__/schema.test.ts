// ============================================================
// NEXUS Offline Data Core — Schema Validation Unit Tests
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  incidentSchema,
  draftIncidentSchema,
  peerPayloadSchema,
  validateIncident,
  validateDraft,
  validatePeerPayload,
  formatValidationErrors,
} from '../schema';
import {
  INCIDENT_TYPES,
  INCIDENT_PRIORITIES,
  INCIDENT_STATUSES,
} from '../types';

describe('Zod Validation Schemas', () => {
  const validIncident = {
    incidentId: '550e8400-e29b-41d4-a716-446655440000',
    originDeviceId: 'device-001',
    type: 'medical' as const,
    priority: 'P0' as const,
    latitude: 22.5726,
    longitude: 88.3639,
    timestamp: 1700000000000,
    status: 'reported' as const,
    peopleAffected: 3,
    version: 1,
    hopCount: 0,
    ttl: 1700086400000,
  };

  const validDraft = {
    type: 'medical' as const,
    priority: 'P0' as const,
    latitude: 22.5726,
    longitude: 88.3639,
    peopleAffected: 3,
    description: 'Urgent medical assistance required',
  };

  // ------------------------------------------------------------
  // Full Incident Validation Tests
  // ------------------------------------------------------------
  describe('incidentSchema & validateIncident', () => {
    it('1. Valid full incident passes validation', () => {
      const parseResult = incidentSchema.safeParse(validIncident);
      expect(parseResult.success).toBe(true);

      const helperResult = validateIncident(validIncident);
      expect(helperResult.success).toBe(true);
      if (helperResult.success) {
        expect(helperResult.data).toEqual(validIncident);
      }
    });

    it('accepts all valid incident types', () => {
      for (const incidentType of INCIDENT_TYPES) {
        const incident = { ...validIncident, type: incidentType };
        const result = validateIncident(incident);
        expect(result.success).toBe(true);
      }
    });

    it('accepts all valid priorities', () => {
      for (const priority of INCIDENT_PRIORITIES) {
        const incident = { ...validIncident, priority };
        const result = validateIncident(incident);
        expect(result.success).toBe(true);
      }
    });

    it('accepts all valid lifecycle statuses', () => {
      for (const status of INCIDENT_STATUSES) {
        const incident = { ...validIncident, status };
        const result = validateIncident(incident);
        expect(result.success).toBe(true);
      }
    });

    it('3. Missing required fields rejected', () => {
      // Empty object
      expect(validateIncident({}).success).toBe(false);

      // Omit each required field one by one
      const requiredKeys: (keyof typeof validIncident)[] = [
        'incidentId',
        'originDeviceId',
        'type',
        'priority',
        'latitude',
        'longitude',
        'timestamp',
        'status',
        'peopleAffected',
        'version',
        'hopCount',
        'ttl',
      ];

      for (const key of requiredKeys) {
        const invalidData = { ...validIncident };
        delete (invalidData as Record<string, unknown>)[key];
        const result = validateIncident(invalidData);
        expect(result.success).toBe(false);
      }
    });

    it('4. Invalid incidentId (not UUID) rejected', () => {
      const invalidIds = ['not-a-uuid', '12345', '', '550e8400-e29b-41d4-a716-44665544000Z'];
      for (const incidentId of invalidIds) {
        const result = validateIncident({ ...validIncident, incidentId });
        expect(result.success).toBe(false);
      }
    });

    it('5. Empty originDeviceId rejected', () => {
      const result = validateIncident({ ...validIncident, originDeviceId: '' });
      expect(result.success).toBe(false);
    });

    it('6. Invalid type (e.g., "earthquake") rejected', () => {
      const result = validateIncident({ ...validIncident, type: 'earthquake' as unknown as typeof validIncident.type });
      expect(result.success).toBe(false);
    });

    it('7. Invalid priority (e.g., "P5") rejected', () => {
      const result = validateIncident({ ...validIncident, priority: 'P5' as unknown as typeof validIncident.priority });
      expect(result.success).toBe(false);
    });

    it('8. Invalid status (e.g., "unknown") rejected', () => {
      const result = validateIncident({ ...validIncident, status: 'unknown' as unknown as typeof validIncident.status });
      expect(result.success).toBe(false);
    });

    it('9. Latitude out of range (e.g., 999) rejected', () => {
      expect(validateIncident({ ...validIncident, latitude: 999 }).success).toBe(false);
      expect(validateIncident({ ...validIncident, latitude: 90.0001 }).success).toBe(false);
      expect(validateIncident({ ...validIncident, latitude: -90.0001 }).success).toBe(false);
      expect(validateIncident({ ...validIncident, latitude: -999 }).success).toBe(false);

      // Boundary values should pass
      expect(validateIncident({ ...validIncident, latitude: 90 }).success).toBe(true);
      expect(validateIncident({ ...validIncident, latitude: -90 }).success).toBe(true);
      expect(validateIncident({ ...validIncident, latitude: 0 }).success).toBe(true);
    });

    it('10. Longitude out of range (e.g., -200) rejected', () => {
      expect(validateIncident({ ...validIncident, longitude: -200 }).success).toBe(false);
      expect(validateIncident({ ...validIncident, longitude: 180.0001 }).success).toBe(false);
      expect(validateIncident({ ...validIncident, longitude: -180.0001 }).success).toBe(false);
      expect(validateIncident({ ...validIncident, longitude: 360 }).success).toBe(false);

      // Boundary values should pass
      expect(validateIncident({ ...validIncident, longitude: 180 }).success).toBe(true);
      expect(validateIncident({ ...validIncident, longitude: -180 }).success).toBe(true);
      expect(validateIncident({ ...validIncident, longitude: 0 }).success).toBe(true);
    });

    it('11. Negative timestamp rejected', () => {
      expect(validateIncident({ ...validIncident, timestamp: -1 }).success).toBe(false);
      expect(validateIncident({ ...validIncident, timestamp: -1000 }).success).toBe(false);
      expect(validateIncident({ ...validIncident, timestamp: 0 }).success).toBe(false);
      expect(validateIncident({ ...validIncident, timestamp: 1700000000000.5 }).success).toBe(false);
    });

    it('12. Zero peopleAffected rejected', () => {
      expect(validateIncident({ ...validIncident, peopleAffected: 0 }).success).toBe(false);
      expect(validateIncident({ ...validIncident, peopleAffected: -1 }).success).toBe(false);
      expect(validateIncident({ ...validIncident, peopleAffected: 1.5 }).success).toBe(false);

      // Minimum valid value is 1
      expect(validateIncident({ ...validIncident, peopleAffected: 1 }).success).toBe(true);
    });

    it('13. Zero version rejected', () => {
      expect(validateIncident({ ...validIncident, version: 0 }).success).toBe(false);
      expect(validateIncident({ ...validIncident, version: -1 }).success).toBe(false);
      expect(validateIncident({ ...validIncident, version: 1.5 }).success).toBe(false);

      // Minimum valid value is 1
      expect(validateIncident({ ...validIncident, version: 1 }).success).toBe(true);
    });

    it('14. Negative hopCount rejected', () => {
      expect(validateIncident({ ...validIncident, hopCount: -1 }).success).toBe(false);
      expect(validateIncident({ ...validIncident, hopCount: 1.5 }).success).toBe(false);

      // 0 is valid for hopCount
      expect(validateIncident({ ...validIncident, hopCount: 0 }).success).toBe(true);
      expect(validateIncident({ ...validIncident, hopCount: 3 }).success).toBe(true);
    });

    it('15. Negative ttl rejected', () => {
      expect(validateIncident({ ...validIncident, ttl: -1 }).success).toBe(false);
      expect(validateIncident({ ...validIncident, ttl: 0 }).success).toBe(false);
      expect(validateIncident({ ...validIncident, ttl: 1700086400000.5 }).success).toBe(false);

      // Positive integer ttl is valid
      expect(validateIncident({ ...validIncident, ttl: 1700086400000 }).success).toBe(true);
    });

    it('16. Optional description field accepted when provided', () => {
      const withDescription = {
        ...validIncident,
        description: 'Building collapse near market square with multiple injuries',
      };
      const result = validateIncident(withDescription);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.description).toBe('Building collapse near market square with multiple injuries');
      }

      // Explicitly undefined description is also accepted
      const withUndefinedDescription = {
        ...validIncident,
        description: undefined,
      };
      expect(validateIncident(withUndefinedDescription).success).toBe(true);

      // Invalid description type (number) rejected
      const withInvalidDescription = {
        ...validIncident,
        description: 12345 as unknown as string,
      };
      expect(validateIncident(withInvalidDescription).success).toBe(false);
    });
  });

  // ------------------------------------------------------------
  // Draft Incident Validation Tests
  // ------------------------------------------------------------
  describe('draftIncidentSchema & validateDraft', () => {
    it('2. Valid draft incident passes validation', () => {
      const parseResult = draftIncidentSchema.safeParse(validDraft);
      expect(parseResult.success).toBe(true);

      const helperResult = validateDraft(validDraft);
      expect(helperResult.success).toBe(true);
      if (helperResult.success) {
        expect(helperResult.data).toEqual(validDraft);
      }
    });

    it('accepts draft incident without optional priority', () => {
      const draftWithoutPriority = {
        type: 'medical' as const,
        latitude: 22.5726,
        longitude: 88.3639,
        peopleAffected: 2,
      };
      const result = validateDraft(draftWithoutPriority);
      expect(result.success).toBe(true);
    });

    it('accepts draft incident without optional description', () => {
      const draftWithoutDescription = {
        type: 'trapped' as const,
        priority: 'P1' as const,
        latitude: 22.5726,
        longitude: 88.3639,
        peopleAffected: 1,
      };
      const result = validateDraft(draftWithoutDescription);
      expect(result.success).toBe(true);
    });

    it('rejects draft incident with missing required fields', () => {
      expect(validateDraft({}).success).toBe(false);

      const requiredDraftKeys: (keyof typeof validDraft)[] = ['type', 'latitude', 'longitude', 'peopleAffected'];
      for (const key of requiredDraftKeys) {
        const invalidDraft = { ...validDraft };
        delete (invalidDraft as Record<string, unknown>)[key];
        expect(validateDraft(invalidDraft).success).toBe(false);
      }
    });

    it('rejects draft incident with out-of-range coordinates', () => {
      expect(validateDraft({ ...validDraft, latitude: 91 }).success).toBe(false);
      expect(validateDraft({ ...validDraft, longitude: 181 }).success).toBe(false);
    });

    it('rejects draft incident with invalid type', () => {
      expect(
        validateDraft({ ...validDraft, type: 'flood' as unknown as typeof validDraft.type }).success
      ).toBe(false);
    });

    it('rejects draft incident with zero peopleAffected', () => {
      expect(validateDraft({ ...validDraft, peopleAffected: 0 }).success).toBe(false);
    });
  });

  // ------------------------------------------------------------
  // Peer Payload Validation Tests
  // ------------------------------------------------------------
  describe('peerPayloadSchema & validatePeerPayload', () => {
    it('valid peer payload passes validation', () => {
      expect(peerPayloadSchema.safeParse(validIncident).success).toBe(true);
      expect(validatePeerPayload(validIncident).success).toBe(true);
    });

    it('invalid peer payload is rejected', () => {
      expect(validatePeerPayload({}).success).toBe(false);
      expect(validatePeerPayload({ ...validIncident, incidentId: 'not-valid' }).success).toBe(false);
    });
  });

  // ------------------------------------------------------------
  // formatValidationErrors Helper Tests
  // ------------------------------------------------------------
  describe('formatValidationErrors', () => {
    it('17. formatValidationErrors returns empty string for valid data', () => {
      const validIncidentResult = validateIncident(validIncident);
      expect(formatValidationErrors(validIncidentResult)).toBe('');

      const validDraftResult = validateDraft(validDraft);
      expect(formatValidationErrors(validDraftResult)).toBe('');
    });

    it('18. formatValidationErrors returns descriptive message for invalid data', () => {
      const invalidResult = validateIncident({
        ...validIncident,
        type: 'earthquake' as unknown as typeof validIncident.type,
      });
      const errorMsg = formatValidationErrors(invalidResult);
      expect(errorMsg.length).toBeGreaterThan(0);
      expect(errorMsg).toContain('type');
      expect(errorMsg).toContain('medical');
      expect(errorMsg).toContain('trapped');
    });

    it('formats multiple validation errors separated by semicolons', () => {
      const multiErrorResult = validateIncident({
        ...validIncident,
        latitude: 999,
        longitude: -200,
      });
      const errorMsg = formatValidationErrors(multiErrorResult);
      expect(errorMsg).toContain('latitude');
      expect(errorMsg).toContain('longitude');
      expect(errorMsg).toContain(';');
    });
  });
});
