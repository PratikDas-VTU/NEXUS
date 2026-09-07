import { describe, it, expect } from 'vitest';
import { suggestPriority, comparePriority, sortByPriority, getPriorityOrder } from '../priority';
import type { Incident } from '../types';

function makeIncident(overrides: Partial<Incident> = {}): Incident {
  return {
    incidentId: '550e8400-e29b-41d4-a716-446655440000',
    originDeviceId: 'device-001',
    type: 'medical',
    priority: 'P0',
    latitude: 22.5726,
    longitude: 88.3639,
    timestamp: Date.now(),
    status: 'stored',
    peopleAffected: 1,
    version: 1,
    hopCount: 0,
    ttl: Date.now() + 86400000,
    ...overrides,
  };
}

describe('Priority Engine', () => {
  describe('suggestPriority', () => {
    it('suggests P0 for medical incidents', () => {
      expect(suggestPriority('medical')).toBe('P0');
    });

    it('suggests P0 for trapped incidents', () => {
      expect(suggestPriority('trapped')).toBe('P0');
    });

    it('suggests P0 for missing incidents', () => {
      expect(suggestPriority('missing')).toBe('P0');
    });

    it('suggests P2 for resource incidents', () => {
      expect(suggestPriority('resource')).toBe('P2');
    });

    it('suggests P2 for shelter incidents', () => {
      expect(suggestPriority('shelter')).toBe('P2');
    });

    it('suggests P3 for safety incidents', () => {
      expect(suggestPriority('safety')).toBe('P3');
    });
  });

  describe('comparePriority', () => {
    it('returns negative when comparing P0 vs P3 (P0 is higher)', () => {
      expect(comparePriority('P0', 'P3')).toBeLessThan(0);
    });

    it('returns positive when comparing P3 vs P0', () => {
      expect(comparePriority('P3', 'P0')).toBeGreaterThan(0);
    });

    it('returns 0 when comparing P1 vs P1', () => {
      expect(comparePriority('P1', 'P1')).toBe(0);
    });
  });

  describe('getPriorityOrder', () => {
    it('returns 0 for P0 and 3 for P3', () => {
      expect(getPriorityOrder('P0')).toBe(0);
      expect(getPriorityOrder('P3')).toBe(3);
    });

    it('returns correct numeric orders for P1 and P2', () => {
      expect(getPriorityOrder('P1')).toBe(1);
      expect(getPriorityOrder('P2')).toBe(2);
    });
  });

  describe('sortByPriority', () => {
    it('orders P0 before P3', () => {
      const incidentP3 = makeIncident({
        incidentId: 'incident-p3',
        priority: 'P3',
        timestamp: 1000,
      });
      const incidentP0 = makeIncident({
        incidentId: 'incident-p0',
        priority: 'P0',
        timestamp: 1000,
      });

      const result = sortByPriority([incidentP3, incidentP0]);

      expect(result).toHaveLength(2);
      expect(result[0].incidentId).toBe('incident-p0');
      expect(result[1].incidentId).toBe('incident-p3');
    });

    it('orders newer timestamp first when incidents have the same priority', () => {
      const baseTime = 1700000000000;
      const olderIncident = makeIncident({
        incidentId: 'older',
        priority: 'P1',
        timestamp: baseTime,
      });
      const newerIncident = makeIncident({
        incidentId: 'newer',
        priority: 'P1',
        timestamp: baseTime + 10000,
      });

      const result = sortByPriority([olderIncident, newerIncident]);

      expect(result).toHaveLength(2);
      expect(result[0].incidentId).toBe('newer');
      expect(result[1].incidentId).toBe('older');
    });

    it('orders lower remaining TTL first when incidents have the same priority and timestamp', () => {
      const baseTime = 1700000000000;
      const longerTtlIncident = makeIncident({
        incidentId: 'longer-ttl',
        priority: 'P2',
        timestamp: baseTime,
        ttl: baseTime + 50000,
      });
      const shorterTtlIncident = makeIncident({
        incidentId: 'shorter-ttl',
        priority: 'P2',
        timestamp: baseTime,
        ttl: baseTime + 10000,
      });

      const result = sortByPriority([longerTtlIncident, shorterTtlIncident]);

      expect(result).toHaveLength(2);
      expect(result[0].incidentId).toBe('shorter-ttl');
      expect(result[1].incidentId).toBe('longer-ttl');
    });

    it('does not mutate original array', () => {
      const incidentP3 = makeIncident({
        incidentId: 'p3',
        priority: 'P3',
      });
      const incidentP0 = makeIncident({
        incidentId: 'p0',
        priority: 'P0',
      });

      const original = [incidentP3, incidentP0];
      const originalCopy = [...original];

      const sorted = sortByPriority(original);

      expect(original).toEqual(originalCopy);
      expect(original[0].incidentId).toBe('p3');
      expect(original[1].incidentId).toBe('p0');
      expect(sorted).not.toBe(original);
    });

    it('returns empty array when given an empty array', () => {
      const result = sortByPriority([]);
      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
    });

    it('sorts complex combinations respecting priority, timestamp, and TTL hierarchy', () => {
      const t0 = 1700000000000;
      const inc1 = makeIncident({ incidentId: 'p1-t0-ttl20', priority: 'P1', timestamp: t0, ttl: t0 + 20 });
      const inc2 = makeIncident({ incidentId: 'p0-t0-ttl50', priority: 'P0', timestamp: t0, ttl: t0 + 50 });
      const inc3 = makeIncident({ incidentId: 'p0-t1-ttl10', priority: 'P0', timestamp: t0 + 100, ttl: t0 + 10 });
      const inc4 = makeIncident({ incidentId: 'p1-t0-ttl10', priority: 'P1', timestamp: t0, ttl: t0 + 10 });
      const inc5 = makeIncident({ incidentId: 'p3-t2-ttl5', priority: 'P3', timestamp: t0 + 200, ttl: t0 + 5 });

      const sorted = sortByPriority([inc1, inc2, inc3, inc4, inc5]);
      const ids = sorted.map((inc) => inc.incidentId);

      // Priority 1st: P0s come first. Between inc3 (t0+100) and inc2 (t0), inc3 is newer.
      // Next P1s: Both have t0. Between inc4 (ttl10) and inc1 (ttl20), inc4 has lower remaining TTL.
      // Next P3: inc5.
      expect(ids).toEqual([
        'p0-t1-ttl10',
        'p0-t0-ttl50',
        'p1-t0-ttl10',
        'p1-t0-ttl20',
        'p3-t2-ttl5',
      ]);
    });
  });
});
