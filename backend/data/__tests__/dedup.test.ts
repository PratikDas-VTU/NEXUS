import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { checkDuplicate, applyIncoming } from '../dedup';
import { NexusDatabase } from '../db';
import type { Incident } from '../types';

describe('dedup engine', () => {
  let testDb: NexusDatabase;
  beforeEach(async () => {
    testDb = new NexusDatabase('TestDedup_' + Math.random().toString(36).slice(2));
  });

  afterEach(async () => {
    await testDb.delete();
  });

  const validIncident: Incident = {
    incidentId: '550e8400-e29b-41d4-a716-446655440000',
    originDeviceId: 'device-001',
    type: 'medical',
    priority: 'P0',
    latitude: 22.5726,
    longitude: 88.3639,
    timestamp: Date.now(),
    status: 'stored',
    peopleAffected: 3,
    version: 1,
    hopCount: 0,
    ttl: Date.now() + 86400000,
  };

  describe('checkDuplicate', () => {
    it('Returns "NEW" for unknown incidentId', async () => {
      const result = await checkDuplicate(validIncident, testDb);
      expect(result).toBe('NEW');
    });

    it('Returns "UPDATE" when incoming version > local version', async () => {
      await testDb.incidents.put(validIncident);
      const incoming = { ...validIncident, version: 2 };
      const result = await checkDuplicate(incoming, testDb);
      expect(result).toBe('UPDATE');
    });

    it('Returns "DUPLICATE" when same version', async () => {
      await testDb.incidents.put(validIncident);
      const result = await checkDuplicate(validIncident, testDb);
      expect(result).toBe('DUPLICATE');
    });

    it('Returns "STALE" when incoming version < local version', async () => {
      await testDb.incidents.put({ ...validIncident, version: 2 });
      const incoming = { ...validIncident, version: 1 };
      const result = await checkDuplicate(incoming, testDb);
      expect(result).toBe('STALE');
    });
  });

  describe('applyIncoming', () => {
    it('Accepts and stores a valid new incident', async () => {
      await applyIncoming(validIncident, testDb);
      const stored = await testDb.incidents.get(validIncident.incidentId);
      expect(stored).toEqual(validIncident);
    });

    it('Accepts and overwrites with newer version', async () => {
      await testDb.incidents.put(validIncident);
      const incoming = { ...validIncident, version: 2 };
      await applyIncoming(incoming, testDb);
      const stored = await testDb.incidents.get(validIncident.incidentId);
      expect(stored?.version).toBe(2);
    });

    it('Rejects duplicate (same version)', async () => {
      await testDb.incidents.put(validIncident);
      const result = await applyIncoming(validIncident, testDb);
      expect(result.accepted).toBe(false);
      expect(result.reason).toBe('STALE_OR_DUPLICATE');
      expect(result.result).toBe('DUPLICATE');
    });

    it('Rejects stale (older version)', async () => {
      await testDb.incidents.put({ ...validIncident, version: 2 });
      const incoming = { ...validIncident, version: 1 };
      const result = await applyIncoming(incoming, testDb);
      expect(result.accepted).toBe(false);
      expect(result.reason).toBe('STALE_OR_DUPLICATE');
      expect(result.result).toBe('STALE');
    });

    it('Rejects malformed schema (missing fields)', async () => {
      const malformed: any = { ...validIncident };
      delete malformed.type;
      const result = await applyIncoming(malformed, testDb);
      expect(result.accepted).toBe(false);
      expect(result.reason).toBe('MALFORMED_SCHEMA');
    });

    it('Rejects expired TTL incident', async () => {
      const expired = { ...validIncident, ttl: Date.now() - 1000 };
      const result = await applyIncoming(expired, testDb);
      expect(result.accepted).toBe(false);
      expect(result.reason).toBe('EXPIRED_TTL');
    });

    it('Rejects hop budget exhausted incident (hopCount >= 3)', async () => {
      const exhausted = { ...validIncident, hopCount: 3 };
      const result = await applyIncoming(exhausted, testDb);
      expect(result.accepted).toBe(false);
      expect(result.reason).toBe('HOP_BUDGET_EXHAUSTED');
    });
  });
});
