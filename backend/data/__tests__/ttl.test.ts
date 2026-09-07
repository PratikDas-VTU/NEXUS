import { describe, it, expect } from 'vitest';
import {
  calculateTTL,
  isExpired,
  isHopBudgetExhausted,
  canForward,
  incrementHop,
  remainingTTL,
} from '../ttl';
import { DEFAULT_TTL_DURATION_MS, MAX_HOP_COUNT } from '../types';
import type { Incident } from '../types';

function makeIncident(overrides: Partial<Incident> = {}): Incident {
  const now = Date.now();
  return {
    incidentId: '550e8400-e29b-41d4-a716-446655440000',
    originDeviceId: 'device-001',
    type: 'medical',
    priority: 'P0',
    latitude: 22.5726,
    longitude: 88.3639,
    timestamp: now,
    status: 'stored',
    peopleAffected: 1,
    version: 1,
    hopCount: 0,
    ttl: now + 86400000,
    ...overrides,
  };
}

describe('TTL and Hop Utilities', () => {
  describe('calculateTTL', () => {
    it('returns timestamp + 24h by default', () => {
      const timestamp = 1700000000000;
      const expected = timestamp + DEFAULT_TTL_DURATION_MS;
      expect(calculateTTL(timestamp)).toBe(expected);
      expect(DEFAULT_TTL_DURATION_MS).toBe(86400000);
    });

    it('accepts custom duration', () => {
      const timestamp = 1700000000000;
      const customDuration = 60 * 1000; // 1 minute
      expect(calculateTTL(timestamp, customDuration)).toBe(timestamp + customDuration);
    });
  });

  describe('isExpired', () => {
    it('returns false for future TTL', () => {
      const now = 1000000;
      const incident = makeIncident({ ttl: now + 10000 });
      expect(isExpired(incident, now)).toBe(false);
    });

    it('returns true for past TTL', () => {
      const now = 1000000;
      const incident = makeIncident({ ttl: now - 10000 });
      expect(isExpired(incident, now)).toBe(true);
    });

    it('returns true for TTL exactly at now (edge case — now > ttl boundary)', () => {
      const now = 1000000;
      const incident = makeIncident({ ttl: now });
      expect(isExpired(incident, now)).toBe(true);
    });

    it('uses current Date.now() when now parameter is omitted', () => {
      const futureIncident = makeIncident({ ttl: Date.now() + 60000 });
      expect(isExpired(futureIncident)).toBe(false);

      const pastIncident = makeIncident({ ttl: Date.now() - 60000 });
      expect(isExpired(pastIncident)).toBe(true);
    });

    it('correctly evaluates canonical relative duration TTL', () => {
      const now = 1700000050000;
      // Created at 1700000000000, duration 60000 ms -> expires at 1700000060000 > now (not expired)
      const validIncident = makeIncident({
        timestamp: 1700000000000,
        ttl: 60000,
      });
      expect(isExpired(validIncident, now)).toBe(false);

      // Now at 1700000070000 > expires at 1700000060000 (expired)
      expect(isExpired(validIncident, 1700000070000)).toBe(true);
    });
  });

  describe('isHopBudgetExhausted', () => {
    it('returns false for hopCount 0', () => {
      const incident = makeIncident({ hopCount: 0 });
      expect(isHopBudgetExhausted(incident)).toBe(false);
    });

    it('returns false for hopCount 2', () => {
      const incident = makeIncident({ hopCount: 2 });
      expect(isHopBudgetExhausted(incident)).toBe(false);
    });

    it('returns true for hopCount 3 (default max)', () => {
      const incident = makeIncident({ hopCount: 3 });
      expect(isHopBudgetExhausted(incident)).toBe(true);
      expect(isHopBudgetExhausted(incident, MAX_HOP_COUNT)).toBe(true);
    });

    it('returns true for hopCount 5', () => {
      const incident = makeIncident({ hopCount: 5 });
      expect(isHopBudgetExhausted(incident)).toBe(true);
    });

    it('respects custom maxHops', () => {
      const incident = makeIncident({ hopCount: 2 });
      expect(isHopBudgetExhausted(incident, 2)).toBe(true);
      expect(isHopBudgetExhausted(incident, 3)).toBe(false);
      expect(isHopBudgetExhausted(incident, 1)).toBe(true);
    });
  });

  describe('canForward', () => {
    it('returns true for valid forwardable incident', () => {
      const now = 1000000;
      const incident = makeIncident({
        hopCount: 0,
        ttl: now + 60000,
        status: 'stored',
      });
      expect(canForward(incident, now)).toBe(true);
    });

    it('returns false for expired incident', () => {
      const now = 1000000;
      const incident = makeIncident({
        hopCount: 0,
        ttl: now - 1000,
        status: 'stored',
      });
      expect(canForward(incident, now)).toBe(false);
    });

    it('returns false for hop budget exhausted incident', () => {
      const now = 1000000;
      const incident = makeIncident({
        hopCount: MAX_HOP_COUNT,
        ttl: now + 60000,
        status: 'stored',
      });
      expect(canForward(incident, now)).toBe(false);
    });

    it("returns false for status 'resolved'", () => {
      const now = 1000000;
      const incident = makeIncident({
        hopCount: 0,
        ttl: now + 60000,
        status: 'resolved',
      });
      expect(canForward(incident, now)).toBe(false);
    });

    it("returns false for status 'expired'", () => {
      const now = 1000000;
      const incident = makeIncident({
        hopCount: 0,
        ttl: now + 60000,
        status: 'expired',
      });
      expect(canForward(incident, now)).toBe(false);
    });

    it('returns true for other valid forwardable statuses', () => {
      const now = 1000000;
      const statuses = ['reported', 'stored', 'queued', 'relayed', 'synced', 'verified', 'assigned'] as const;
      for (const status of statuses) {
        const incident = makeIncident({
          hopCount: 1,
          ttl: now + 60000,
          status,
        });
        expect(canForward(incident, now)).toBe(true);
      }
    });

    it('uses current Date.now() when now parameter is omitted', () => {
      const incident = makeIncident({
        hopCount: 0,
        ttl: Date.now() + 60000,
        status: 'stored',
      });
      expect(canForward(incident)).toBe(true);
    });
  });

  describe('incrementHop', () => {
    it('returns new object with hopCount + 1', () => {
      const original = makeIncident({ hopCount: 1 });
      const incremented = incrementHop(original);

      expect(incremented.hopCount).toBe(2);
      expect(incremented.incidentId).toBe(original.incidentId);
      expect(incremented.originDeviceId).toBe(original.originDeviceId);
      expect(incremented.type).toBe(original.type);
      expect(incremented.priority).toBe(original.priority);
      expect(incremented.latitude).toBe(original.latitude);
      expect(incremented.longitude).toBe(original.longitude);
      expect(incremented.status).toBe(original.status);
      expect(incremented.ttl).toBe(original.ttl);
      expect(incremented.version).toBe(original.version);
    });

    it('does not mutate original', () => {
      const original = makeIncident({ hopCount: 1 });
      const originalSnapshot = { ...original };

      const incremented = incrementHop(original);

      expect(original.hopCount).toBe(1);
      expect(original).toEqual(originalSnapshot);
      expect(incremented).not.toBe(original);
    });
  });

  describe('remainingTTL', () => {
    it('returns positive value for future TTL', () => {
      const now = 1000000;
      const duration = 50000;
      const incident = makeIncident({ ttl: now + duration });

      expect(remainingTTL(incident, now)).toBe(duration);
    });

    it('returns 0 for past TTL', () => {
      const now = 1000000;
      const incident = makeIncident({ ttl: now - 50000 });

      expect(remainingTTL(incident, now)).toBe(0);
    });

    it('returns 0 for TTL exactly at now', () => {
      const now = 1000000;
      const incident = makeIncident({ ttl: now });

      expect(remainingTTL(incident, now)).toBe(0);
    });

    it('uses current Date.now() when now parameter is omitted', () => {
      const incident = makeIncident({ ttl: Date.now() + 10000 });
      const remaining = remainingTTL(incident);
      expect(remaining).toBeGreaterThan(0);
      expect(remaining).toBeLessThanOrEqual(10000);
    });
  });
});
