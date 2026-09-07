import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDeviceId, resetDeviceId } from '../deviceId';
import { NexusDatabase } from '../db';

describe('deviceId', () => {
  let testDb: NexusDatabase;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  beforeEach(async () => {
    testDb = new NexusDatabase('TestDevice_' + Math.random().toString(36).slice(2));
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  afterEach(async () => {
    await testDb.delete();
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  it('getDeviceId: generates a UUID on first call', async () => {
    const deviceId = await getDeviceId(testDb);
    expect(deviceId).toBeDefined();
    expect(deviceId).toMatch(uuidRegex);
  });

  it('getDeviceId: returns same ID on subsequent calls', async () => {
    const firstCallId = await getDeviceId(testDb);
    const secondCallId = await getDeviceId(testDb);
    const thirdCallId = await getDeviceId(testDb);

    expect(secondCallId).toBe(firstCallId);
    expect(thirdCallId).toBe(firstCallId);
  });

  it('getDeviceId: persists to Dexie device table', async () => {
    const deviceId = await getDeviceId(testDb);

    const record = await testDb.device.get('local');
    expect(record).toBeDefined();
    expect(record?.id).toBe('local');
    expect(record?.deviceId).toBe(deviceId);
    expect(record?.createdAt).toBeTypeOf('number');
  });

  it('resetDeviceId: generates a new different ID', async () => {
    const initialId = await getDeviceId(testDb);
    const newId = await resetDeviceId(testDb);

    expect(newId).not.toBe(initialId);
    expect(newId).toMatch(uuidRegex);

    const record = await testDb.device.get('local');
    expect(record?.deviceId).toBe(newId);
  });

  it('getDeviceId after reset: returns the new ID', async () => {
    const originalId = await getDeviceId(testDb);
    const resetId = await resetDeviceId(testDb);
    const idAfterReset = await getDeviceId(testDb);

    expect(idAfterReset).toBe(resetId);
    expect(idAfterReset).not.toBe(originalId);
  });
});
