/**
 * NEXUS — Real Nearby Connections UI Workflow & Lifecycle Tests
 * (Phase 6 — Step 5B.5)
 * 
 * Verifies the 12 required contract & lifecycle conditions for Nearby UI:
 * 1. native bridge unavailable (browser mode / null bridge)
 * 2. native bridge available (ready state)
 * 3. permissions missing state (identifies missing runtime permissions)
 * 4. scan starts (initiates advertising + discovery simultaneously under 'nexus-mesh-v1')
 * 5. scan stops (ceases discovery and advertising)
 * 6. endpointFound adds real node
 * 7. endpointLost removes discovered node
 * 8. connectionInitiated changes state to CONNECTING
 * 9. connectionResult CONNECTED changes state to CONNECTED
 * 10. connectionResult failure changes state to DISCONNECTED with error
 * 11. disconnected changes state to DISCONNECTED with reason
 * 12. duplicate endpointFound does not duplicate node in list
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  NearbyMeshController,
} from '../frontend/src/services/nearbyMeshController';
import type {
  INativeMeshBridge,
  NativePeerEndpoint,
  NativeConnectionStatus,
  NativeBridgeStatus,
  EndpointListenerCallbacks,
} from '../networking/nativeBridge';

function createMockBridge(initialAvailable = true, initialStatus: string = 'ready'): INativeMeshBridge & {
  callbacks: EndpointListenerCallbacks;
  triggerFound: (ep: NativePeerEndpoint) => void;
  triggerLost: (id: string) => void;
  triggerInitiated: (ep: NativePeerEndpoint) => void;
  triggerResult: (id: string, status: NativeConnectionStatus, msg?: string) => void;
  triggerDisconnected: (id: string, reason?: string) => void;
} {
  let isAvailableFlag = initialAvailable;
  let currentStatus = initialStatus;
  let missingPerms = '';
  const callbacks: EndpointListenerCallbacks = {};

  return {
    callbacks,
    isAvailable: vi.fn(() => isAvailableFlag),
    checkStatus: vi.fn(async (): Promise<NativeBridgeStatus> => ({
      available: isAvailableFlag,
      status: currentStatus,
      platform: 'android',
      missingPermissions: missingPerms,
    })),
    addEndpointListener: vi.fn((cbs: EndpointListenerCallbacks) => {
      Object.assign(callbacks, cbs);
      return () => {
        Object.keys(callbacks).forEach((key) => delete (callbacks as any)[key]);
      };
    }),
    startAdvertising: vi.fn(async () => true),
    stopAdvertising: vi.fn(async () => {}),
    startDiscovery: vi.fn(async () => true),
    stopDiscovery: vi.fn(async () => {}),
    connect: vi.fn(async () => {}),
    sendPayload: vi.fn(async () => {}),
    disconnect: vi.fn(async () => {}),
    disconnectAll: vi.fn(async () => {}),

    triggerFound(ep: NativePeerEndpoint) {
      callbacks.onEndpointFound?.(ep);
    },
    triggerLost(id: string) {
      callbacks.onEndpointLost?.(id);
    },
    triggerInitiated(ep: NativePeerEndpoint) {
      callbacks.onConnectionInitiated?.(ep);
    },
    triggerResult(id: string, status: NativeConnectionStatus, msg?: string) {
      callbacks.onConnectionResult?.(id, status, msg);
    },
    triggerDisconnected(id: string, reason?: string) {
      callbacks.onDisconnected?.(id, reason);
    },
  };
}

describe('NearbyMeshController (Phase 6 — Step 5B.5 UI Workflow)', () => {
  let mockBridge: ReturnType<typeof createMockBridge>;
  const localId = 'node-self-123';

  beforeEach(() => {
    mockBridge = createMockBridge(true, 'ready');
  });

  it('1. handles native bridge unavailable (browser environment fallback)', async () => {
    const controller = new NearbyMeshController({
      localDeviceId: localId,
      bridge: null,
    });

    const res = await controller.checkPrerequisites();
    expect(res.ready).toBe(false);
    expect(res.state).toBe('BROWSER_UNSUPPORTED');
    expect(controller.isNativeAvailable).toBe(false);
    expect(controller.errorMessage).toContain('WebRTC & WebSocket');
  });

  it('2. handles native bridge available (ready state)', async () => {
    const controller = new NearbyMeshController({
      localDeviceId: localId,
      bridge: mockBridge,
    });

    const res = await controller.checkPrerequisites();
    expect(res.ready).toBe(true);
    expect(res.state).toBe('READY');
    expect(controller.isNativeAvailable).toBe(true);
    expect(controller.errorMessage).toBeNull();
  });

  it('3. detects and reports permissions missing state accurately', async () => {
    mockBridge.checkStatus = vi.fn(async () => ({
      available: false,
      status: 'permissions_missing',
      missingPermissions: 'android.permission.BLUETOOTH_SCAN, android.permission.NEARBY_WIFI_DEVICES',
      platform: 'android',
    }));

    const controller = new NearbyMeshController({
      localDeviceId: localId,
      bridge: mockBridge,
    });

    const res = await controller.checkPrerequisites();
    expect(res.ready).toBe(false);
    expect(res.state).toBe('PERMISSIONS_MISSING');
    expect(controller.isNativeAvailable).toBe(false);
    expect(controller.missingPermissions).toContain('android.permission.BLUETOOTH_SCAN');
    expect(controller.missingPermissions).toContain('android.permission.NEARBY_WIFI_DEVICES');
  });

  it('4. scan starts initiates advertising + discovery together under nexus-mesh-v1', async () => {
    const controller = new NearbyMeshController({
      localDeviceId: localId,
      bridge: mockBridge,
    });

    const success = await controller.startScan();
    expect(success).toBe(true);
    expect(controller.isScanning).toBe(true);
    expect(controller.advertising).toBe(true);
    expect(controller.discovery).toBe(true);

    expect(mockBridge.startAdvertising).toHaveBeenCalledWith(localId, 'nexus-mesh-v1');
    expect(mockBridge.startDiscovery).toHaveBeenCalledWith('nexus-mesh-v1');
  });

  it('5. scan stops halts discovery and advertising cleanly', async () => {
    const controller = new NearbyMeshController({
      localDeviceId: localId,
      bridge: mockBridge,
    });

    await controller.startScan();
    expect(controller.isScanning).toBe(true);

    await controller.stopScan();
    expect(controller.isScanning).toBe(false);
    expect(controller.advertising).toBe(false);
    expect(controller.discovery).toBe(false);

    expect(mockBridge.stopDiscovery).toHaveBeenCalled();
    expect(mockBridge.stopAdvertising).toHaveBeenCalled();
  });

  it('6. endpointFound adds real nearby node to the active list', async () => {
    const controller = new NearbyMeshController({
      localDeviceId: localId,
      bridge: mockBridge,
    });
    await controller.startScan();

    mockBridge.triggerFound({
      endpointId: 'ep-phone-b',
      endpointName: 'Phone-B-Pixel',
      serviceId: 'nexus-mesh-v1',
    });

    expect(controller.nodes.length).toBe(1);
    expect(controller.nodes[0]).toMatchObject({
      endpointId: 'ep-phone-b',
      endpointName: 'Phone-B-Pixel',
      serviceId: 'nexus-mesh-v1',
      status: 'DISCOVERED',
    });
    expect(controller.getDiscoveredCount()).toBe(1);
  });

  it('7. endpointLost removes discovered node from field list', async () => {
    const controller = new NearbyMeshController({
      localDeviceId: localId,
      bridge: mockBridge,
    });
    await controller.startScan();

    mockBridge.triggerFound({
      endpointId: 'ep-phone-b',
      endpointName: 'Phone-B-Pixel',
      serviceId: 'nexus-mesh-v1',
    });
    expect(controller.nodes.length).toBe(1);

    mockBridge.triggerLost('ep-phone-b');
    expect(controller.nodes.length).toBe(0);
    expect(controller.getDiscoveredCount()).toBe(0);
  });

  it('8. connectionInitiated updates node status to CONNECTING', async () => {
    const controller = new NearbyMeshController({
      localDeviceId: localId,
      bridge: mockBridge,
    });
    await controller.startScan();

    mockBridge.triggerFound({
      endpointId: 'ep-phone-b',
      endpointName: 'Phone-B-Pixel',
      serviceId: 'nexus-mesh-v1',
    });
    expect(controller.nodes[0].status).toBe('DISCOVERED');

    mockBridge.triggerInitiated({
      endpointId: 'ep-phone-b',
      endpointName: 'Phone-B-Pixel',
      serviceId: 'nexus-mesh-v1',
    });

    expect(controller.nodes[0].status).toBe('CONNECTING');
  });

  it('9. connectionResult CONNECTED changes status to CONNECTED', async () => {
    const controller = new NearbyMeshController({
      localDeviceId: localId,
      bridge: mockBridge,
    });
    await controller.startScan();

    mockBridge.triggerFound({
      endpointId: 'ep-phone-b',
      endpointName: 'Phone-B-Pixel',
      serviceId: 'nexus-mesh-v1',
    });

    mockBridge.triggerResult('ep-phone-b', 'CONNECTED', 'Nearby connection active');

    expect(controller.nodes[0].status).toBe('CONNECTED');
    expect(controller.nodes[0].connectionError).toBeUndefined();
    expect(controller.getConnectedCount()).toBe(1);
  });

  it('10. connectionResult failure changes status to DISCONNECTED with error reason', async () => {
    const controller = new NearbyMeshController({
      localDeviceId: localId,
      bridge: mockBridge,
    });
    await controller.startScan();

    mockBridge.triggerFound({
      endpointId: 'ep-phone-b',
      endpointName: 'Phone-B-Pixel',
      serviceId: 'nexus-mesh-v1',
    });

    mockBridge.triggerResult('ep-phone-b', 'REJECTED', 'Remote user declined connection');

    expect(controller.nodes[0].status).toBe('DISCONNECTED');
    expect(controller.nodes[0].connectionError).toBe('Remote user declined connection');
    expect(controller.getConnectedCount()).toBe(0);
  });

  it('11. disconnected updates status to DISCONNECTED with radio reason', async () => {
    const controller = new NearbyMeshController({
      localDeviceId: localId,
      bridge: mockBridge,
    });
    await controller.startScan();

    mockBridge.triggerFound({
      endpointId: 'ep-phone-b',
      endpointName: 'Phone-B-Pixel',
      serviceId: 'nexus-mesh-v1',
    });
    mockBridge.triggerResult('ep-phone-b', 'CONNECTED');
    expect(controller.nodes[0].status).toBe('CONNECTED');

    mockBridge.triggerDisconnected('ep-phone-b', 'Radio link out of range');

    expect(controller.nodes[0].status).toBe('DISCONNECTED');
    expect(controller.nodes[0].connectionError).toBe('Radio link out of range');
    expect(controller.getConnectedCount()).toBe(0);
  });

  it('12. duplicate endpointFound does not duplicate node in list', async () => {
    const controller = new NearbyMeshController({
      localDeviceId: localId,
      bridge: mockBridge,
    });
    await controller.startScan();

    mockBridge.triggerFound({
      endpointId: 'ep-phone-b',
      endpointName: 'Phone-B-Pixel',
      serviceId: 'nexus-mesh-v1',
    });
    mockBridge.triggerFound({
      endpointId: 'ep-phone-b',
      endpointName: 'Phone-B-Pixel-Updated',
      serviceId: 'nexus-mesh-v1',
    });

    expect(controller.nodes.length).toBe(1);
    expect(controller.nodes[0].endpointName).toBe('Phone-B-Pixel-Updated');
  });

  it('13. ignores self-discovered endpoints', async () => {
    const controller = new NearbyMeshController({
      localDeviceId: localId,
      bridge: mockBridge,
    });
    await controller.startScan();

    mockBridge.triggerFound({
      endpointId: 'ep-self',
      endpointName: localId,
      serviceId: 'nexus-mesh-v1',
    });

    expect(controller.nodes.length).toBe(0);
  });

  it('14. ignores endpoints from unrelated services', async () => {
    const controller = new NearbyMeshController({
      localDeviceId: localId,
      bridge: mockBridge,
    });
    await controller.startScan();

    mockBridge.triggerFound({
      endpointId: 'ep-other',
      endpointName: 'Other-App',
      serviceId: 'other-service-id',
    });

    expect(controller.nodes.length).toBe(0);
  });

  it('15. connects and disconnects endpoint via native bridge', async () => {
    const controller = new NearbyMeshController({
      localDeviceId: localId,
      bridge: mockBridge,
    });
    await controller.startScan();

    mockBridge.triggerFound({
      endpointId: 'ep-phone-b',
      endpointName: 'Phone-B',
      serviceId: 'nexus-mesh-v1',
    });

    await controller.connect('ep-phone-b');
    expect(mockBridge.connect).toHaveBeenCalledWith('ep-phone-b');
    expect(controller.nodes[0].status).toBe('CONNECTING');

    await controller.disconnect('ep-phone-b');
    expect(mockBridge.disconnect).toHaveBeenCalledWith('ep-phone-b');
    expect(controller.nodes[0].status).toBe('DISCONNECTED');
  });

  it('16. repeated scan start calls are prevented', async () => {
    const controller = new NearbyMeshController({
      localDeviceId: localId,
      bridge: mockBridge,
    });

    const first = await controller.startScan();
    expect(first).toBe(true);

    const second = await controller.startScan();
    expect(second).toBe(false);

    expect(mockBridge.startAdvertising).toHaveBeenCalledTimes(1);
    expect(mockBridge.startDiscovery).toHaveBeenCalledTimes(1);
  });

  it('17. both operations failing keeps isScanning=false and records native errors', async () => {
    (mockBridge as any).lastAdvertisingError = '8036: STATUS_BLUETOOTH_DISABLED';
    (mockBridge as any).lastDiscoveryError = '8037: STATUS_LOCATION_DISABLED';
    mockBridge.startAdvertising = vi.fn(async () => false);
    mockBridge.startDiscovery = vi.fn(async () => false);

    let toastMsg = '';
    const controller = new NearbyMeshController({
      localDeviceId: localId,
      bridge: mockBridge,
      onToast: (msg) => { toastMsg = msg; },
    });

    const result = await controller.startScan();
    expect(result).toBe(false);
    expect(controller.isScanning).toBe(false);
    expect(controller.advertising).toBe(false);
    expect(controller.discovery).toBe(false);
    expect(controller.errorMessage).toContain('8036: STATUS_BLUETOOTH_DISABLED');
    expect(controller.errorMessage).toContain('8037: STATUS_LOCATION_DISABLED');
    expect(toastMsg).toBe(controller.errorMessage);
  });

  it('18. advertising failure with discovery succeeding accurately represents partial state', async () => {
    (mockBridge as any).lastAdvertisingError = '8036: STATUS_BLUETOOTH_DISABLED';
    mockBridge.startAdvertising = vi.fn(async () => false);
    mockBridge.startDiscovery = vi.fn(async () => true);

    let toastMsg = '';
    const controller = new NearbyMeshController({
      localDeviceId: localId,
      bridge: mockBridge,
      onToast: (msg) => { toastMsg = msg; },
    });

    const result = await controller.startScan();
    expect(result).toBe(true);
    expect(controller.isScanning).toBe(true);
    expect(controller.advertising).toBe(false);
    expect(controller.discovery).toBe(true);
    expect(controller.errorMessage).toContain('Nearby partially active (Discovering only)');
    expect(controller.errorMessage).toContain('8036: STATUS_BLUETOOTH_DISABLED');
    expect(toastMsg).toContain('Nearby partially active');
  });

  it('19. discovery failure with advertising succeeding accurately represents partial state', async () => {
    (mockBridge as any).lastDiscoveryError = '8037: STATUS_LOCATION_DISABLED';
    mockBridge.startAdvertising = vi.fn(async () => true);
    mockBridge.startDiscovery = vi.fn(async () => false);

    let toastMsg = '';
    const controller = new NearbyMeshController({
      localDeviceId: localId,
      bridge: mockBridge,
      onToast: (msg) => { toastMsg = msg; },
    });

    const result = await controller.startScan();
    expect(result).toBe(true);
    expect(controller.isScanning).toBe(true);
    expect(controller.advertising).toBe(true);
    expect(controller.discovery).toBe(false);
    expect(controller.errorMessage).toContain('Nearby partially active (Broadcasting only)');
    expect(controller.errorMessage).toContain('8037: STATUS_LOCATION_DISABLED');
    expect(toastMsg).toContain('Nearby partially active');
  });

  it('20. native error is preserved and not silently discarded when bridge throws', async () => {
    mockBridge.startAdvertising = vi.fn(async () => {
      throw new Error('SecurityException: Need android.permission.BLUETOOTH_SCAN');
    });
    mockBridge.startDiscovery = vi.fn(async () => {
      throw new Error('SecurityException: Need android.permission.ACCESS_FINE_LOCATION');
    });

    const controller = new NearbyMeshController({
      localDeviceId: localId,
      bridge: mockBridge,
    });

    const result = await controller.startScan();
    expect(result).toBe(false);
    expect(controller.isScanning).toBe(false);
    expect(controller.advertising).toBe(false);
    expect(controller.discovery).toBe(false);
    expect(controller.errorMessage).toContain('SecurityException: Need android.permission.BLUETOOTH_SCAN');
    expect(controller.errorMessage).toContain('SecurityException: Need android.permission.ACCESS_FINE_LOCATION');
  });

  it('21. success state occurs only after both native operations succeed', async () => {
    mockBridge.startAdvertising = vi.fn(async () => true);
    mockBridge.startDiscovery = vi.fn(async () => true);

    let toastMsg = '';
    const controller = new NearbyMeshController({
      localDeviceId: localId,
      bridge: mockBridge,
      onToast: (msg) => { toastMsg = msg; },
    });

    const result = await controller.startScan();
    expect(result).toBe(true);
    expect(controller.isScanning).toBe(true);
    expect(controller.advertising).toBe(true);
    expect(controller.discovery).toBe(true);
    expect(controller.errorMessage).toBeNull();
    expect(toastMsg).toBe('Nearby scanning started (Broadcasting & Discovering)');
  });

  it('22. browser fallback remains completely safe and never throws on startScan', async () => {
    let toastMsg = '';
    const controller = new NearbyMeshController({
      localDeviceId: localId,
      bridge: null,
      onToast: (msg) => { toastMsg = msg; },
    });

    const result = await controller.startScan();
    expect(result).toBe(false);
    expect(controller.isScanning).toBe(false);
    expect(controller.advertising).toBe(false);
    expect(controller.discovery).toBe(false);
    expect(controller.preflightState).toBe('BROWSER_UNSUPPORTED');
    expect(toastMsg).toContain('WebRTC & WebSocket');
  });
});
