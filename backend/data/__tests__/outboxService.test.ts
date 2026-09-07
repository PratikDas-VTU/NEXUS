import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  addToOutbox,
  getPendingRelayItems,
  getPendingSyncItems,
  markRelayed,
  markSynced,
  removeExpiredFromOutbox,
  getOutboxCount,
} from '../outboxService';
import { NexusDatabase } from '../db';
import type { Incident, OutboxItem } from '../types';

describe('outboxService', () => {
  let testDb: NexusDatabase;

  beforeEach(async () => {
    testDb = new NexusDatabase('TestOutbox_' + Math.random().toString(36).slice(2));
  });

  afterEach(async () => {
    await testDb.delete();
  });

  const createMockIncident = (overrides: Partial<Incident> = {}): Incident => {
    const now = Date.now();
    return {
      incidentId: '550e8400-e29b-41d4-a716-446655440001',
      originDeviceId: 'device-001',
      type: 'medical',
      priority: 'P0',
      latitude: 22.5726,
      longitude: 88.3639,
      timestamp: now,
      status: 'queued',
      peopleAffected: 2,
      version: 1,
      hopCount: 0,
      ttl: now + 86400000,
      ...overrides,
    };
  };

  it('addToOutbox: creates an outbox entry with pending_relay status', async () => {
    const incidentId = '550e8400-e29b-41d4-a716-446655440001';
    const timestamp = Date.now();

    await addToOutbox(incidentId, 'P1', timestamp, testDb);

    const item = await testDb.outbox.get(incidentId);
    expect(item).toBeDefined();
    expect(item).toEqual({
      incidentId,
      status: 'pending_relay',
      priority: 'P1',
      timestamp,
      retryCount: 0,
    } satisfies OutboxItem);
  });

  it('addToOutbox: does not create duplicate entry for same incidentId', async () => {
    const incidentId = '550e8400-e29b-41d4-a716-446655440001';
    const timestamp1 = 1000;
    const timestamp2 = 2000;

    await addToOutbox(incidentId, 'P1', timestamp1, testDb);
    // Attempt duplicate add with different priority/timestamp
    await addToOutbox(incidentId, 'P0', timestamp2, testDb);

    const items = await testDb.outbox.toArray();
    expect(items).toHaveLength(1);
    expect(items[0].incidentId).toBe(incidentId);
    expect(items[0].priority).toBe('P1');
    expect(items[0].timestamp).toBe(timestamp1);
  });

  it('getPendingRelayItems: returns items sorted by priority (P0 before P3)', async () => {
    const p3Incident = createMockIncident({
      incidentId: '550e8400-e29b-41d4-a716-446655440001',
      priority: 'P3',
      timestamp: 1000,
    });
    const p0Incident = createMockIncident({
      incidentId: '550e8400-e29b-41d4-a716-446655440002',
      priority: 'P0',
      timestamp: 1000,
    });
    const p1Incident = createMockIncident({
      incidentId: '550e8400-e29b-41d4-a716-446655440003',
      priority: 'P1',
      timestamp: 1000,
    });
    const p2Incident = createMockIncident({
      incidentId: '550e8400-e29b-41d4-a716-446655440004',
      priority: 'P2',
      timestamp: 1000,
    });

    await testDb.incidents.bulkPut([p3Incident, p0Incident, p1Incident, p2Incident]);

    // Add in mixed order
    await addToOutbox(p3Incident.incidentId, p3Incident.priority, p3Incident.timestamp, testDb);
    await addToOutbox(p2Incident.incidentId, p2Incident.priority, p2Incident.timestamp, testDb);
    await addToOutbox(p0Incident.incidentId, p0Incident.priority, p0Incident.timestamp, testDb);
    await addToOutbox(p1Incident.incidentId, p1Incident.priority, p1Incident.timestamp, testDb);

    const pending = await getPendingRelayItems(testDb);
    expect(pending).toHaveLength(4);
    expect(pending.map((item) => item.priority)).toEqual(['P0', 'P1', 'P2', 'P3']);
    expect(pending.map((item) => item.incidentId)).toEqual([
      p0Incident.incidentId,
      p1Incident.incidentId,
      p2Incident.incidentId,
      p3Incident.incidentId,
    ]);
  });

  it('getPendingRelayItems: excludes expired incidents (need to add incident to DB with past TTL)', async () => {
    const now = Date.now();
    const expiredIncident = createMockIncident({
      incidentId: '550e8400-e29b-41d4-a716-446655440001',
      priority: 'P0',
      timestamp: now - 100000,
      ttl: now - 1000, // Past TTL
    });
    const activeIncident = createMockIncident({
      incidentId: '550e8400-e29b-41d4-a716-446655440002',
      priority: 'P1',
      timestamp: now,
      ttl: now + 86400000, // Future TTL
    });

    await testDb.incidents.bulkPut([expiredIncident, activeIncident]);
    await addToOutbox(expiredIncident.incidentId, expiredIncident.priority, expiredIncident.timestamp, testDb);
    await addToOutbox(activeIncident.incidentId, activeIncident.priority, activeIncident.timestamp, testDb);

    const pending = await getPendingRelayItems(testDb);
    expect(pending).toHaveLength(1);
    expect(pending[0].incidentId).toBe(activeIncident.incidentId);
    expect(pending[0].priority).toBe('P1');
  });

  it('getPendingRelayItems: returns empty array when no pending items', async () => {
    const emptyResult = await getPendingRelayItems(testDb);
    expect(emptyResult).toEqual([]);

    // Also verify when items exist in outbox but none have pending_relay status
    const incident = createMockIncident({ incidentId: '550e8400-e29b-41d4-a716-446655440001' });
    await testDb.incidents.put(incident);
    await testDb.outbox.put({
      incidentId: incident.incidentId,
      status: 'synced',
      priority: 'P0',
      timestamp: Date.now(),
      retryCount: 0,
    });

    const resultAfterSync = await getPendingRelayItems(testDb);
    expect(resultAfterSync).toEqual([]);
  });

  it('getPendingSyncItems: returns items pending cloud synchronization', async () => {
    const incidentId1 = '550e8400-e29b-41d4-a716-446655440001';
    const incidentId2 = '550e8400-e29b-41d4-a716-446655440002';

    await testDb.outbox.bulkPut([
      {
        incidentId: incidentId1,
        status: 'pending_sync',
        priority: 'P0',
        timestamp: 1000,
        retryCount: 0,
      },
      {
        incidentId: incidentId2,
        status: 'pending_relay',
        priority: 'P1',
        timestamp: 2000,
        retryCount: 0,
      },
    ]);

    const syncItems = await getPendingSyncItems(testDb);
    expect(syncItems).toHaveLength(1);
    expect(syncItems[0].incidentId).toBe(incidentId1);
    expect(syncItems[0].status).toBe('pending_sync');
  });

  it('markRelayed: updates status to pending_sync and sets peerId', async () => {
    const incidentId = '550e8400-e29b-41d4-a716-446655440001';
    const peerId = 'peer-device-xyz-987';

    await addToOutbox(incidentId, 'P0', Date.now(), testDb);

    await markRelayed(incidentId, peerId, testDb);

    const item = await testDb.outbox.get(incidentId);
    expect(item).toBeDefined();
    expect(item?.status).toBe('pending_sync');
    expect(item?.relayedToPeerId).toBe(peerId);
    expect(item?.completedAt).toBeTypeOf('number');
  });

  it('markRelayed: also updates the incident status to \'relayed\'', async () => {
    const incidentId = '550e8400-e29b-41d4-a716-446655440001';
    const incident = createMockIncident({ incidentId, status: 'queued' });
    await testDb.incidents.put(incident);
    await addToOutbox(incidentId, incident.priority, incident.timestamp, testDb);

    await markRelayed(incidentId, 'peer-001', testDb);

    const updatedIncident = await testDb.incidents.get(incidentId);
    expect(updatedIncident).toBeDefined();
    expect(updatedIncident?.status).toBe('relayed');
  });

  it('markSynced: updates outbox status to synced', async () => {
    const incidentId = '550e8400-e29b-41d4-a716-446655440001';
    await addToOutbox(incidentId, 'P0', Date.now(), testDb);
    await markRelayed(incidentId, 'peer-001', testDb);

    await markSynced(incidentId, testDb);

    const item = await testDb.outbox.get(incidentId);
    expect(item).toBeDefined();
    expect(item?.status).toBe('synced');
    expect(item?.completedAt).toBeTypeOf('number');
  });

  it('markSynced: also updates incident status to \'synced\'', async () => {
    const incidentId = '550e8400-e29b-41d4-a716-446655440001';
    const incident = createMockIncident({ incidentId, status: 'relayed' });
    await testDb.incidents.put(incident);
    await addToOutbox(incidentId, incident.priority, incident.timestamp, testDb);

    await markSynced(incidentId, testDb);

    const updatedIncident = await testDb.incidents.get(incidentId);
    expect(updatedIncident).toBeDefined();
    expect(updatedIncident?.status).toBe('synced');
  });

  it('removeExpiredFromOutbox: removes outbox entries for expired incidents', async () => {
    const now = Date.now();
    const expiredIncident = createMockIncident({
      incidentId: '550e8400-e29b-41d4-a716-446655440001',
      ttl: now - 5000, // expired
    });
    const validIncident = createMockIncident({
      incidentId: '550e8400-e29b-41d4-a716-446655440002',
      ttl: now + 86400000, // valid
    });

    await testDb.incidents.bulkPut([expiredIncident, validIncident]);
    await addToOutbox(expiredIncident.incidentId, expiredIncident.priority, expiredIncident.timestamp, testDb);
    await addToOutbox(validIncident.incidentId, validIncident.priority, validIncident.timestamp, testDb);

    const removedCount = await removeExpiredFromOutbox(testDb);
    expect(removedCount).toBe(1);

    const expiredOutbox = await testDb.outbox.get(expiredIncident.incidentId);
    expect(expiredOutbox).toBeUndefined();

    const validOutbox = await testDb.outbox.get(validIncident.incidentId);
    expect(validOutbox).toBeDefined();
    expect(validOutbox?.incidentId).toBe(validIncident.incidentId);
  });

  it('removeExpiredFromOutbox: marks expired incidents with \'expired\' status', async () => {
    const now = Date.now();
    const expiredIncident = createMockIncident({
      incidentId: '550e8400-e29b-41d4-a716-446655440001',
      status: 'queued',
      ttl: now - 10000,
    });

    await testDb.incidents.put(expiredIncident);
    await addToOutbox(expiredIncident.incidentId, expiredIncident.priority, expiredIncident.timestamp, testDb);

    const removedCount = await removeExpiredFromOutbox(testDb);
    expect(removedCount).toBe(1);

    const incidentInDb = await testDb.incidents.get(expiredIncident.incidentId);
    expect(incidentInDb).toBeDefined();
    expect(incidentInDb?.status).toBe('expired');
  });

  it('getOutboxCount: returns correct count of pending items', async () => {
    const initialCount = await getOutboxCount(testDb);
    expect(initialCount).toBe(0);

    // Add pending_relay item
    await testDb.outbox.put({
      incidentId: '550e8400-e29b-41d4-a716-446655440001',
      status: 'pending_relay',
      priority: 'P0',
      timestamp: 1000,
      retryCount: 0,
    });

    // Add pending_sync item
    await testDb.outbox.put({
      incidentId: '550e8400-e29b-41d4-a716-446655440002',
      status: 'pending_sync',
      priority: 'P1',
      timestamp: 2000,
      retryCount: 0,
    });

    // Add synced item (should NOT be counted in pending)
    await testDb.outbox.put({
      incidentId: '550e8400-e29b-41d4-a716-446655440003',
      status: 'synced',
      priority: 'P2',
      timestamp: 3000,
      retryCount: 0,
    });

    const pendingCount = await getOutboxCount(testDb);
    expect(pendingCount).toBe(2);
  });
});
