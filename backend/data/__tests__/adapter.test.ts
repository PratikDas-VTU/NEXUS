import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { OfflineStorageAdapter } from '../adapter';
import { NexusDatabase } from '../db';
import type { Incident } from '../types';

describe('IOfflineStorageAdapter Integration Boundary Tests', () => {
  let testDb: NexusDatabase;
  let adapter: OfflineStorageAdapter;

  const validIncident: Incident = {
    incidentId: '550e8400-e29b-41d4-a716-446655440001',
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

  beforeEach(() => {
    testDb = new NexusDatabase('TestAdapter_' + Math.random().toString(36).slice(2));
    adapter = new OfflineStorageAdapter(testDb);
  });

  afterEach(async () => {
    await testDb.delete();
  });

  // 1. getManifest()
  it('1. getManifest() returns manifest of stored active incidents', async () => {
    await testDb.incidents.put(validIncident);
    const manifest = await adapter.getManifest();
    expect(manifest.length).toBe(1);
    expect(manifest[0]).toEqual({
      incidentId: validIncident.incidentId,
      version: 1,
    });
  });

  // 2. getPendingOutbox()
  it('2. getPendingOutbox() returns pending outbox incidents ordered by priority', async () => {
    const p3Incident: Incident = {
      ...validIncident,
      incidentId: '550e8400-e29b-41d4-a716-446655440002',
      priority: 'P3',
      type: 'safety',
    };
    await testDb.incidents.put(validIncident);
    await testDb.incidents.put(p3Incident);

    await testDb.outbox.put({
      incidentId: p3Incident.incidentId,
      status: 'pending_relay',
      priority: 'P3',
      timestamp: Date.now() - 100,
      retryCount: 0,
    });
    await testDb.outbox.put({
      incidentId: validIncident.incidentId,
      status: 'pending_relay',
      priority: 'P0',
      timestamp: Date.now(),
      retryCount: 0,
    });

    const pending = await adapter.getPendingOutbox();
    expect(pending.length).toBe(2);
    // P0 must be before P3
    expect(pending[0].priority).toBe('P0');
    expect(pending[1].priority).toBe('P3');
  });

  // 3. ingest new incident
  it('3. ingestRelayedIncident() stores valid new peer incident', async () => {
    const result = await adapter.ingestRelayedIncident(validIncident);
    expect(result.accepted).toBe(true);
    expect(result.result).toBe('NEW');

    const stored = await testDb.incidents.get(validIncident.incidentId);
    expect(stored).toBeDefined();
    expect(stored?.incidentId).toBe(validIncident.incidentId);
  });

  // 4. duplicate same-version incident
  it('4. ingestRelayedIncident() ignores duplicate same-version incident', async () => {
    await adapter.ingestRelayedIncident(validIncident);
    const result = await adapter.ingestRelayedIncident(validIncident);
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe('STALE_OR_DUPLICATE');
    expect(result.result).toBe('DUPLICATE');
  });

  // 5. newer version
  it('5. ingestRelayedIncident() accepts and updates newer version', async () => {
    await adapter.ingestRelayedIncident(validIncident);
    const newerIncident = { ...validIncident, version: 2, peopleAffected: 5 };
    const result = await adapter.ingestRelayedIncident(newerIncident);
    expect(result.accepted).toBe(true);
    expect(result.result).toBe('UPDATE');

    const stored = await testDb.incidents.get(validIncident.incidentId);
    expect(stored?.version).toBe(2);
    expect(stored?.peopleAffected).toBe(5);
  });

  // 6. stale version
  it('6. ingestRelayedIncident() rejects stale version', async () => {
    await adapter.ingestRelayedIncident({ ...validIncident, version: 3 });
    const staleIncident = { ...validIncident, version: 2 };
    const result = await adapter.ingestRelayedIncident(staleIncident);
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe('STALE_OR_DUPLICATE');
    expect(result.result).toBe('STALE');
  });

  // 7. markRelayed()
  it('7. markRelayed() updates outbox and incident state to relayed', async () => {
    await testDb.incidents.put(validIncident);
    await testDb.outbox.put({
      incidentId: validIncident.incidentId,
      status: 'pending_relay',
      priority: validIncident.priority,
      timestamp: validIncident.timestamp,
      retryCount: 0,
    });

    await adapter.markRelayed(validIncident.incidentId, 'peer-xyz');

    const updatedOutbox = await testDb.outbox.get(validIncident.incidentId);
    expect(updatedOutbox?.status).toBe('pending_sync');
    expect(updatedOutbox?.relayedToPeerId).toBe('peer-xyz');

    const updatedIncident = await testDb.incidents.get(validIncident.incidentId);
    expect(updatedIncident?.status).toBe('relayed');
  });

  // 8. hasIncident()
  it('8. hasIncident() checks presence and version correctly', async () => {
    await testDb.incidents.put({ ...validIncident, version: 2 });

    expect(await adapter.hasIncident(validIncident.incidentId)).toBe(true);
    expect(await adapter.hasIncident(validIncident.incidentId, 1)).toBe(true);
    expect(await adapter.hasIncident(validIncident.incidentId, 2)).toBe(true);
    expect(await adapter.hasIncident(validIncident.incidentId, 3)).toBe(false);
    expect(await adapter.hasIncident('non-existent-uuid')).toBe(false);
  });

  // 9. getIncidentsByIds()
  it('9. getIncidentsByIds() retrieves requested incidents by ID array', async () => {
    const inc2 = { ...validIncident, incidentId: '550e8400-e29b-41d4-a716-446655440003' };
    await testDb.incidents.put(validIncident);
    await testDb.incidents.put(inc2);

    const found = await adapter.getIncidentsByIds([
      validIncident.incidentId,
      inc2.incidentId,
      '550e8400-e29b-41d4-a716-446655440999',
    ]);
    expect(found.length).toBe(2);
    expect(found.map((i) => i.incidentId)).toContain(validIncident.incidentId);
    expect(found.map((i) => i.incidentId)).toContain(inc2.incidentId);
  });

  // 10. expired incident excluded
  it('10. expired incident is excluded from getManifest() and getPendingOutbox()', async () => {
    const expiredIncident: Incident = {
      ...validIncident,
      incidentId: '550e8400-e29b-41d4-a716-446655440004',
      ttl: Date.now() - 5000,
    };
    await testDb.incidents.put(expiredIncident);
    await testDb.outbox.put({
      incidentId: expiredIncident.incidentId,
      status: 'pending_relay',
      priority: expiredIncident.priority,
      timestamp: expiredIncident.timestamp,
      retryCount: 0,
    });

    const manifest = await adapter.getManifest();
    expect(manifest.find((m) => m.incidentId === expiredIncident.incidentId)).toBeUndefined();

    const pending = await adapter.getPendingOutbox();
    expect(pending.find((i) => i.incidentId === expiredIncident.incidentId)).toBeUndefined();
  });

  // 11. exhausted hop budget excluded
  it('11. exhausted hop budget incident is excluded from getPendingOutbox()', async () => {
    const exhaustedIncident: Incident = {
      ...validIncident,
      incidentId: '550e8400-e29b-41d4-a716-446655440005',
      hopCount: 3, // MAX_HOP_COUNT is 3
    };
    await testDb.incidents.put(exhaustedIncident);
    await testDb.outbox.put({
      incidentId: exhaustedIncident.incidentId,
      status: 'pending_relay',
      priority: exhaustedIncident.priority,
      timestamp: exhaustedIncident.timestamp,
      retryCount: 0,
    });

    const pending = await adapter.getPendingOutbox();
    expect(pending.find((i) => i.incidentId === exhaustedIncident.incidentId)).toBeUndefined();
  });
});
