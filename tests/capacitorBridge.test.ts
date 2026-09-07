/**
 * NEXUS — Offline-First Emergency & Community Network
 * Phase 6 — Step 5A: Capacitor Android Container Foundation Tests
 * 
 * Verifies:
 * 1. CapacitorNativeMeshBridge satisfies INativeMeshBridge contract.
 * 2. In Step 5A foundation scaffold, isAvailable() accurately returns false.
 * 3. Browser safety: getNativeMeshBridge() returns null and does not throw in web mode.
 * 4. Safe fallback for sendPayload when radio hardware is unavailable.
 * 5. Event forwarding from Capacitor plugin listeners to bridge callbacks.
 * 6. Explicit registration via setNativeMeshBridge continues to take precedence.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CapacitorNativeMeshBridge,
  type NexusNativePluginInterface,
} from '../networking/capacitorBridge';
import {
  getNativeMeshBridge,
  setNativeMeshBridge,
  isNativeMeshAvailable,
} from '../networking/nativeBridge';
import type { NativePeerEndpoint } from '../networking/nativeBridge';

function createMockCapacitorPlugin(isAvailableFlag = false): NexusNativePluginInterface & {
  listeners: Map<string, Array<Function>>;
  triggerListener: (event: string, data: any) => void;
} {
  const listeners = new Map<string, Array<Function>>();

  return {
    listeners,
    isAvailable: vi.fn(async () => ({
      available: isAvailableFlag,
      status: isAvailableFlag ? 'active' : 'foundation_scaffold_ready',
      platform: 'android',
    })),
    startAdvertising: vi.fn(async () => {}),
    stopAdvertising: vi.fn(async () => {}),
    startDiscovery: vi.fn(async () => {}),
    stopDiscovery: vi.fn(async () => {}),
    connect: vi.fn(async () => {}),
    sendPayload: vi.fn(async () => {}),
    disconnect: vi.fn(async () => {}),
    disconnectAll: vi.fn(async () => {}),
    addListener: vi.fn(async (eventName: string, listenerFunc: Function) => {
      let list = listeners.get(eventName);
      if (!list) {
        list = [];
        listeners.set(eventName, list);
      }
      list.push(listenerFunc);
      return {
        remove: async () => {
          const idx = list!.indexOf(listenerFunc);
          if (idx !== -1) list!.splice(idx, 1);
        },
      };
    }),
    removeAllListeners: vi.fn(async () => {
      listeners.clear();
    }),
    triggerListener: (event: string, data: any) => {
      const list = listeners.get(event);
      if (list) {
        list.forEach((fn) => fn(data));
      }
    },
  };
}

describe('Phase 6 — Step 5A: Capacitor Android Container Foundation', () => {
  beforeEach(() => {
    setNativeMeshBridge(null);
  });

  it('CapacitorNativeMeshBridge satisfies INativeMeshBridge contract with isAvailable=false in Step 5A scaffold', () => {
    const mockPlugin = createMockCapacitorPlugin(false);
    const bridge = new CapacitorNativeMeshBridge(mockPlugin);

    // Must NOT falsely claim radio availability in foundation scaffold
    expect(bridge.isAvailable()).toBe(false);
  });

  it('probeAvailability accurately reflects plugin status', async () => {
    const mockPlugin = createMockCapacitorPlugin(false);
    const bridge = new CapacitorNativeMeshBridge(mockPlugin);

    const available = await bridge.probeAvailability();
    expect(available).toBe(false);
    expect(bridge.isAvailable()).toBe(false);

    // If native driver reports true in future Step 5B
    mockPlugin.isAvailable = vi.fn(async () => ({ available: true, status: 'active', platform: 'android' }));
    const nowAvailable = await bridge.probeAvailability();
    expect(nowAvailable).toBe(true);
    expect(bridge.isAvailable()).toBe(true);
  });

  it('rejects payload transmission when radio hardware is unavailable', async () => {
    const mockPlugin = createMockCapacitorPlugin(false);
    const bridge = new CapacitorNativeMeshBridge(mockPlugin);

    await expect(bridge.sendPayload('ep-1', '{"test":true}')).rejects.toThrow(
      /Native radio hardware not available/
    );
  });

  it('forwards plugin events to INativeMeshBridge callbacks', () => {
    const mockPlugin = createMockCapacitorPlugin(false);
    const bridge = new CapacitorNativeMeshBridge(mockPlugin);

    let discoveredEndpoint: NativePeerEndpoint | null = null;
    bridge.onEndpointFound = (ep) => {
      discoveredEndpoint = ep;
    };

    let lostEndpointId = '';
    bridge.onEndpointLost = (id) => {
      lostEndpointId = id;
    };

    let connectionResult: { id: string; status: string } | null = null;
    bridge.onConnectionResult = (id, status) => {
      connectionResult = { id, status };
    };

    let receivedPayload: { id: string; payload: string } | null = null;
    bridge.onPayloadReceived = (id, payload) => {
      receivedPayload = { id, payload };
    };

    let disconnectedPeer: { id: string; reason?: string } | null = null;
    bridge.onDisconnected = (id, reason) => {
      disconnectedPeer = { id, reason };
    };

    // Trigger events from mock plugin
    mockPlugin.triggerListener('endpointFound', {
      endpointId: 'ep-native-1',
      endpointName: 'NEXUS-PHONE-1',
      serviceId: 'nexus-mesh-v1',
    });
    expect(discoveredEndpoint).toEqual({
      endpointId: 'ep-native-1',
      endpointName: 'NEXUS-PHONE-1',
      serviceId: 'nexus-mesh-v1',
    });

    mockPlugin.triggerListener('endpointLost', { endpointId: 'ep-native-1' });
    expect(lostEndpointId).toBe('ep-native-1');

    mockPlugin.triggerListener('connectionResult', {
      endpointId: 'ep-native-1',
      status: 'CONNECTED',
    });
    expect(connectionResult).toEqual({ id: 'ep-native-1', status: 'CONNECTED' });

    mockPlugin.triggerListener('payloadReceived', {
      endpointId: 'ep-native-1',
      payload: '{"type":"HELLO"}',
    });
    expect(receivedPayload).toEqual({ id: 'ep-native-1', payload: '{"type":"HELLO"}' });

    mockPlugin.triggerListener('disconnected', {
      endpointId: 'ep-native-1',
      reason: 'Out of range',
    });
    expect(disconnectedPeer).toEqual({ id: 'ep-native-1', reason: 'Out of range' });
  });

  it('safely falls back to null in browser environments where Capacitor plugin is absent', () => {
    // In Node / browser vitest environment, Capacitor.isPluginAvailable('NexusNative') returns false
    const bridge = getNativeMeshBridge();
    expect(bridge).toBeNull();
    expect(isNativeMeshAvailable()).toBe(false);
  });

  it('custom bridge registered via setNativeMeshBridge continues to take highest priority', () => {
    const mockCustomBridge = {
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

    setNativeMeshBridge(mockCustomBridge);
    expect(getNativeMeshBridge()).toBe(mockCustomBridge);
    expect(isNativeMeshAvailable()).toBe(true);

    setNativeMeshBridge(null);
    expect(getNativeMeshBridge()).toBeNull();
  });

  describe('Phase 6 — Step 5B.3: Real Nearby Connections Bridge Contracts', () => {
    it('accurately handles granular availability states (permissions_missing, ready)', async () => {
      const mockPlugin = createMockCapacitorPlugin(false);
      const bridge = new CapacitorNativeMeshBridge(mockPlugin);

      // Scenario 1: Permissions missing
      mockPlugin.isAvailable = vi.fn(async () => ({
        available: false,
        status: 'permissions_missing',
        platform: 'android',
      }));
      expect(await bridge.probeAvailability()).toBe(false);
      expect(bridge.isAvailable()).toBe(false);

      // Scenario 2: Google Play Services or Bluetooth hardware unavailable
      mockPlugin.isAvailable = vi.fn(async () => ({
        available: false,
        status: 'google_play_services_unavailable',
        platform: 'android',
      }));
      expect(await bridge.probeAvailability()).toBe(false);
      expect(bridge.isAvailable()).toBe(false);

      // Scenario 3: Radio and permissions fully operational
      mockPlugin.isAvailable = vi.fn(async () => ({
        available: true,
        status: 'ready',
        platform: 'android',
      }));
      expect(await bridge.probeAvailability()).toBe(true);
      expect(bridge.isAvailable()).toBe(true);
    });

    it('transmits payload to plugin when bridge is operational', async () => {
      const mockPlugin = createMockCapacitorPlugin(true);
      const bridge = new CapacitorNativeMeshBridge(mockPlugin);
      await bridge.probeAvailability();

      await bridge.sendPayload('ep-remote-1', '{"type":"HELLO","sender":"PEER_A"}');
      expect(mockPlugin.sendPayload).toHaveBeenCalledWith({
        endpointId: 'ep-remote-1',
        payload: '{"type":"HELLO","sender":"PEER_A"}',
      });
    });

    it('propagates rejection when native plugin rejects oversized payload', async () => {
      const mockPlugin = createMockCapacitorPlugin(true);
      mockPlugin.sendPayload = vi.fn(async () => {
        throw new Error('Payload size (35000 bytes) exceeds Nearby Connections limit (32768 bytes)');
      });

      const bridge = new CapacitorNativeMeshBridge(mockPlugin);
      await bridge.probeAvailability();

      await expect(
        bridge.sendPayload('ep-remote-1', 'X'.repeat(35000))
      ).rejects.toThrow(/exceeds Nearby Connections limit/);
    });

    it('forwards connectionInitiated events with authenticationToken', () => {
      const mockPlugin = createMockCapacitorPlugin(true);
      const bridge = new CapacitorNativeMeshBridge(mockPlugin);

      let initiatedEndpoint: NativePeerEndpoint | null = null;
      bridge.onConnectionInitiated = (ep) => {
        initiatedEndpoint = ep;
      };

      mockPlugin.triggerListener('connectionInitiated', {
        endpointId: 'ep-node-2',
        endpointName: 'NEXUS-PIXEL-7',
        serviceId: 'nexus-mesh-v1',
        authenticationToken: '1234',
      });

      expect(initiatedEndpoint).toEqual({
        endpointId: 'ep-node-2',
        endpointName: 'NEXUS-PIXEL-7',
        serviceId: 'nexus-mesh-v1',
        authenticationToken: '1234',
      });
    });

    it('delegates disconnect and disconnectAll calls to native plugin', async () => {
      const mockPlugin = createMockCapacitorPlugin(true);
      const bridge = new CapacitorNativeMeshBridge(mockPlugin);

      await bridge.disconnect('ep-node-2');
      expect(mockPlugin.disconnect).toHaveBeenCalledWith({ endpointId: 'ep-node-2' });

      await bridge.disconnectAll();
      expect(mockPlugin.disconnectAll).toHaveBeenCalled();
    });
  });
});
