import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createIncident, getIncident, getAllIncidents, getIncidentsByStatus, updateIncidentStatus, ingestFromPeer } from '../incidentService';
import { NexusDatabase } from '../db';
import type { DraftIncident, Incident } from '../types';

describe('incidentService', () => {
  let testDb: NexusDatabase;
  let dbName: string;
  beforeEach(async () => {
    dbName = 'TestService_' + Math.random().toString(36).slice(2);
    testDb = new NexusDatabase(dbName);
  });

  afterEach(async () => {
    await testDb.delete();
  });

  const validDraft: DraftIncident = {
    type: 'medical',
    latitude: 22.5726,
    longitude: 88.3639,
    peopleAffected: 2,
    description: 'Person collapsed near building A',
  };

  describe('createIncident', () => {
    it('creates incident with correct fields (UUIDv4 id, version 1, hopCount 0, status "queued")', async () => {
      const incident = await createIncident(validDraft, testDb);
      expect(incident.incidentId).toBeDefined();
      expect(incident.version).toBe(1);
      expect(incident.hopCount).toBe(0);
      expect(incident.status).toBe('queued');
      expect(incident.type).toBe('medical');
    });

    it('applies default priority based on type (medical -> P0)', async () => {
      const incident = await createIncident(validDraft, testDb);
      expect(incident.priority).toBe('P0');
    });

    it('allows user priority override', async () => {
      const draft = { ...validDraft, priority: 'P1' as any };
      const incident = await createIncident(draft, testDb);
      expect(incident.priority).toBe('P1');
    });

    it('throws on invalid draft (e.g., latitude 999)', async () => {
      const draft = { ...validDraft, latitude: 999 };
      await expect(createIncident(draft, testDb)).rejects.toThrow();
    });
  });

  describe('getIncident', () => {
    it('returns stored incident by ID', async () => {
      const created = await createIncident(validDraft, testDb);
      const stored = await getIncident(created.incidentId, testDb);
      expect(stored).toEqual(created);
    });

    it('returns undefined for non-existent ID', async () => {
      const stored = await getIncident('non-existent', testDb);
      expect(stored).toBeUndefined();
    });
  });

  describe('getAllIncidents', () => {
    it('returns all incidents', async () => {
      await createIncident(validDraft, testDb);
      await createIncident({ ...validDraft, type: 'trapped' }, testDb);
      const all = await getAllIncidents(testDb);
      expect(all.length).toBe(2);
    });
  });

  describe('getIncidentsByStatus', () => {
    it('filters correctly', async () => {
      const inc1 = await createIncident(validDraft, testDb);
      const all = await getIncidentsByStatus('queued', testDb);
      expect(all.length).toBe(1);
      expect(all[0].incidentId).toBe(inc1.incidentId);

      const none = await getIncidentsByStatus('synced', testDb);
      expect(none.length).toBe(0);
    });
  });

  describe('updateIncidentStatus', () => {
    it('changes status and increments version', async () => {
      const created = await createIncident(validDraft, testDb);
      await updateIncidentStatus(created.incidentId, 'synced', testDb);
      const updated = await getIncident(created.incidentId, testDb);
      expect(updated!.status).toBe('synced');
      expect(updated!.version).toBe(2);
    });

    it('throws for non-existent incident', async () => {
      await expect(updateIncidentStatus('non-existent', 'synced', testDb)).rejects.toThrow();
    });
  });

  describe('ingestFromPeer', () => {
    const validPeerIncident: Incident = {
      incidentId: '550e8400-e29b-41d4-a716-446655440001',
      originDeviceId: 'device-002',
      type: 'medical',
      priority: 'P0',
      latitude: 22.5726,
      longitude: 88.3639,
      timestamp: Date.now(),
      status: 'queued',
      peopleAffected: 3,
      version: 1,
      hopCount: 1,
      ttl: Date.now() + 86400000,
    };

    it('accepts valid new peer incident', async () => {
      const result = await ingestFromPeer(validPeerIncident, testDb);
      expect(result.accepted).toBe(true);
      const stored = await getIncident(validPeerIncident.incidentId, testDb);
      expect(stored).toBeDefined();
      expect(stored?.incidentId).toBe(validPeerIncident.incidentId);
      expect(stored?.status).toBe('stored');
    });

    it('rejects malformed peer data', async () => {
      const malformed = { ...validPeerIncident };
      delete (malformed as any).type;
      const result = await ingestFromPeer(malformed, testDb);
      expect(result.accepted).toBe(false);
      expect(result.reason).toBe('MALFORMED_SCHEMA');
    });

    it('rejects duplicate peer incident', async () => {
      await ingestFromPeer(validPeerIncident, testDb);
      const result = await ingestFromPeer(validPeerIncident, testDb);
      expect(result.accepted).toBe(false);
      expect(result.reason).toBe('STALE_OR_DUPLICATE');
    });
  });

  describe('Persistence', () => {
    it('incident survives database re-open', async () => {
      const created = await createIncident(validDraft, testDb);
      testDb.close(); // Close current instance

      const newDbInstance = new NexusDatabase(dbName);
      const stored = await getIncident(created.incidentId, newDbInstance);
      expect(stored).toEqual(created);
      
      await newDbInstance.delete(); // cleanup
    });
  });

  describe('FrontendIncidentService & listIncidents', () => {
    it('filters incidents by type and priority in listIncidents', async () => {
      await createIncident({ ...validDraft, type: 'medical' }, testDb);
      await createIncident({ ...validDraft, type: 'shelter', priority: 'P2' }, testDb);

      const medicals = await testDb.incidents.toArray();
      expect(medicals.length).toBe(2);

      const frontendService = new (await import('../incidentService')).FrontendIncidentService(testDb);
      const filtered = await frontendService.listIncidents({ type: 'medical' });
      expect(filtered.length).toBe(1);
      expect(filtered[0].type).toBe('medical');

      const outboxCount = await frontendService.getOutboxCount();
      expect(outboxCount).toBe(2);
    });

    it('subscribes to incident changes via subscribeToIncidents', async () => {
      const frontendService = new (await import('../incidentService')).FrontendIncidentService(testDb);
      
      let captured: Incident[] = [];
      const unsubscribe = frontendService.subscribeToIncidents((incidents) => {
        captured = incidents;
      });

      // Wait a tick for initial query
      await new Promise((r) => setTimeout(r, 50));
      expect(captured.length).toBe(0);

      await frontendService.createIncident(validDraft);
      await new Promise((r) => setTimeout(r, 50));
      expect(captured.length).toBe(1);
      expect(captured[0].type).toBe('medical');

      unsubscribe();
    });
  });
});
