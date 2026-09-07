import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  type INativeMeshBridge,
  type NativePeerEndpoint,
  NoopNativeMeshBridge,
  getNativeMeshBridge,
  setNativeMeshBridge,
  isNativeMeshAvailable,
} from '../networking/nativeBridge';
import { CapacitorNativeMeshBridge } from '../networking/capacitorBridge';

describe('Phase 6 — Step 1: Native Mesh Bridge Contract Tests', () => {
  beforeEach(() => {
    // Reset any registered bridge before each test
    setNativeMeshBridge(null);
  });

  it('provides safe browser fallback when no native bridge is present', () => {
    expect(getNativeMeshBridge()).toBeNull();
    expect(isNativeMeshAvailable()).toBe(false);
  });

  it('satisfies INativeMeshBridge with NoopNativeMeshBridge without throwing', async () => {
    const noop: INativeMeshBridge = new NoopNativeMeshBridge();

    expect(noop.isAvailable()).toBe(false);
    expect(await noop.startAdvertising('DEV-TEST', 'nexus-mesh-v1')).toBe(false);
    expect(await noop.startDiscovery('nexus-mesh-v1')).toBe(false);

    // Lifecycle methods resolve safely
    await expect(noop.stopAdvertising()).resolves.toBeUndefined();
    await expect(noop.stopDiscovery()).resolves.toBeUndefined();
    await expect(noop.connect('endpoint-123')).resolves.toBeUndefined();
    await expect(noop.disconnect('endpoint-123')).resolves.toBeUndefined();
    await expect(noop.disconnectAll()).resolves.toBeUndefined();

    // Sending payload on noop throws a clear informative error
    await expect(noop.sendPayload('endpoint-123', '{}')).rejects.toThrow(
      /Native mesh hardware not available/
    );
  });

  it('allows registering and detecting an active native bridge implementation', () => {
    const mockBridge: INativeMeshBridge = {
      isAvailable: () => true,
      startAdvertising: async () => true,
      stopAdvertising: async () => {},
      startDiscovery: async () => true,
      stopDiscovery: async () => {},
      connect: async () => {},
      sendPayload: async () => {},
      disconnect: async () => {},
      disconnectAll: async () => {},
    };

    setNativeMeshBridge(mockBridge);

    expect(getNativeMeshBridge()).toBe(mockBridge);
    expect(isNativeMeshAvailable()).toBe(true);

    // Resetting reverts cleanly
    setNativeMeshBridge(null);
    expect(getNativeMeshBridge()).toBeNull();
    expect(isNativeMeshAvailable()).toBe(false);
  });

  it('supports full event callback registration on the bridge contract', () => {
    const mockBridge: INativeMeshBridge = {
      isAvailable: () => true,
      startAdvertising: async () => true,
      stopAdvertising: async () => {},
      startDiscovery: async () => true,
      stopDiscovery: async () => {},
      connect: async () => {},
      sendPayload: async () => {},
      disconnect: async () => {},
      disconnectAll: async () => {},
    };

    let discoveredEndpoint: NativePeerEndpoint | null = null;
    let receivedPayload = '';
    let connectionStatus = '';

    mockBridge.onEndpointFound = (endpoint) => {
      discoveredEndpoint = endpoint;
    };
    mockBridge.onPayloadReceived = (_endpointId, payload) => {
      receivedPayload = payload;
    };
    mockBridge.onConnectionResult = (_endpointId, status) => {
      connectionStatus = status;
    };

    // Simulate native dispatching events
    mockBridge.onEndpointFound({
      endpointId: 'ep-abc',
      endpointName: 'NEXUS-NODE-2',
      serviceId: 'nexus-mesh-v1',
    });

    mockBridge.onPayloadReceived('ep-abc', '{"type":"HELLO"}');
    mockBridge.onConnectionResult('ep-abc', 'CONNECTED');

    expect(discoveredEndpoint).toEqual({
      endpointId: 'ep-abc',
      endpointName: 'NEXUS-NODE-2',
      serviceId: 'nexus-mesh-v1',
    });
    expect(receivedPayload).toBe('{"type":"HELLO"}');
    expect(connectionStatus).toBe('CONNECTED');
  });

  it('preserves native error messages and logs when startAdvertising or startDiscovery rejects', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const mockPlugin: any = {
      isAvailable: vi.fn(async () => ({ available: true, status: 'ready', platform: 'android' })),
      startAdvertising: vi.fn(async () => {
        throw new Error('8036: STATUS_BLUETOOTH_DISABLED');
      }),
      startDiscovery: vi.fn(async () => {
        throw new Error('8037: STATUS_LOCATION_DISABLED');
      }),
      stopAdvertising: vi.fn(async () => {}),
      stopDiscovery: vi.fn(async () => {}),
      connect: vi.fn(async () => {}),
      sendPayload: vi.fn(async () => {}),
      disconnect: vi.fn(async () => {}),
      disconnectAll: vi.fn(async () => {}),
      addListener: vi.fn(async () => ({ remove: async () => {} })),
      removeAllListeners: vi.fn(async () => {}),
    };

    const bridge = new CapacitorNativeMeshBridge(mockPlugin);
    await bridge.probeAvailability();
    expect(bridge.isAvailable()).toBe(true);

    const advRes = await bridge.startAdvertising('NODE-A', 'nexus-mesh-v1');
    expect(advRes).toBe(false);
    expect(bridge.lastAdvertisingError).toBe('8036: STATUS_BLUETOOTH_DISABLED');
    expect(bridge.getLastError()).toBe('8036: STATUS_BLUETOOTH_DISABLED');
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[CapacitorNativeMeshBridge] startAdvertising failed: 8036: STATUS_BLUETOOTH_DISABLED')
    );

    const discRes = await bridge.startDiscovery('nexus-mesh-v1');
    expect(discRes).toBe(false);
    expect(bridge.lastDiscoveryError).toBe('8037: STATUS_LOCATION_DISABLED');
    expect(bridge.getLastError()).toBe('8037: STATUS_LOCATION_DISABLED');
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[CapacitorNativeMeshBridge] startDiscovery failed: 8037: STATUS_LOCATION_DISABLED')
    );

    errorSpy.mockRestore();
  });
});
