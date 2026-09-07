/**
 * NEXUS — Offline-First Emergency & Community Network
 * Native Nearby Transport (Phase 6 — Step 2)
 * 
 * Implements the NexusTransport contract for a SINGLE connected native peer endpoint
 * over the INativeMeshBridge (e.g. Google Nearby Connections P2P_CLUSTER).
 * 
 * Responsibilities:
 * - Serializes RelayMessage to JSON and dispatches via bridge.sendPayload().
 * - Filters incoming payloads from bridge.onPayloadReceived for this specific endpointId.
 * - Parses incoming JSON safely into RelayMessage and forwards to onMessage handlers.
 * - Accurately tracks connection state via bridge.onConnectionResult and bridge.onDisconnected.
 * - Notifies onClose handlers exactly once upon disconnection.
 * - Calls bridge.disconnect(endpointId) on close() without affecting other native peers.
 */

import type { NexusTransport, TransportType } from '../shared/interfaces.ts';
import type { RelayMessage } from '../shared/protocol.ts';
import type { INativeMeshBridge, NativeConnectionStatus } from './nativeBridge.ts';

export interface NativeTransportOptions {
  initiallyOpen?: boolean;
  metadata?: {
    mtu?: number;
    estimatedBandwidth?: 'low' | 'medium' | 'high';
    isDirectP2P?: boolean;
  };
}

interface BridgeListenerBundle {
  payloadListeners: Set<(endpointId: string, payload: string) => void>;
  connectionListeners: Set<(endpointId: string, status: NativeConnectionStatus, message?: string) => void>;
  disconnectListeners: Set<(endpointId: string, reason?: string) => void>;
}

/**
 * WeakMap associating bridge instances with their multicast listener registries.
 * Ensures multiple NativeTransport instances on the same bridge do not overwrite
 * each other's callbacks or leak references.
 */
const bridgeRegistries = new WeakMap<INativeMeshBridge, BridgeListenerBundle>();

function getOrCreateBridgeRegistry(bridge: INativeMeshBridge): BridgeListenerBundle {
  let registry = bridgeRegistries.get(bridge);
  if (!registry) {
    registry = {
      payloadListeners: new Set(),
      connectionListeners: new Set(),
      disconnectListeners: new Set(),
    };
    bridgeRegistries.set(bridge, registry);

    // Chain onto bridge's existing single callback properties
    const existingPayload = bridge.onPayloadReceived;
    bridge.onPayloadReceived = (endpointId: string, payload: string) => {
      existingPayload?.(endpointId, payload);
      for (const listener of Array.from(registry!.payloadListeners)) {
        try {
          listener(endpointId, payload);
        } catch (err) {
          console.error('[NativeTransport] Error in bridge payload dispatch:', err);
        }
      }
    };

    const existingConnection = bridge.onConnectionResult;
    bridge.onConnectionResult = (endpointId: string, status: NativeConnectionStatus, message?: string) => {
      existingConnection?.(endpointId, status, message);
      for (const listener of Array.from(registry!.connectionListeners)) {
        try {
          listener(endpointId, status, message);
        } catch (err) {
          console.error('[NativeTransport] Error in bridge connection result dispatch:', err);
        }
      }
    };

    const existingDisconnect = bridge.onDisconnected;
    bridge.onDisconnected = (endpointId: string, reason?: string) => {
      existingDisconnect?.(endpointId, reason);
      for (const listener of Array.from(registry!.disconnectListeners)) {
        try {
          listener(endpointId, reason);
        } catch (err) {
          console.error('[NativeTransport] Error in bridge disconnect dispatch:', err);
        }
      }
    };
  }
  return registry;
}

export class NativeTransport implements NexusTransport {
  public readonly transportType: TransportType = 'nearby';
  public readonly remotePeerId: string;
  public readonly endpointId: string;

  public readonly metadata: {
    mtu?: number;
    estimatedBandwidth?: 'low' | 'medium' | 'high';
    isDirectP2P?: boolean;
  };

  private bridge: INativeMeshBridge;
  private isOpenState = false;
  private hasClosed = false;

  private messageHandlers = new Set<(message: RelayMessage) => void>();
  private closeHandlers = new Set<(reason?: string) => void>();

  // Bound listener references for clean unbinding
  private boundPayloadListener: (endpointId: string, payload: string) => void;
  private boundConnectionListener: (endpointId: string, status: NativeConnectionStatus, message?: string) => void;
  private boundDisconnectListener: (endpointId: string, reason?: string) => void;

  constructor(
    bridge: INativeMeshBridge,
    endpointId: string,
    remotePeerId: string,
    options?: NativeTransportOptions
  ) {
    this.bridge = bridge;
    this.endpointId = endpointId;
    this.remotePeerId = remotePeerId;
    this.isOpenState = options?.initiallyOpen ?? false;

    this.metadata = {
      mtu: 65536,
      estimatedBandwidth: 'high',
      isDirectP2P: true,
      ...(options?.metadata || {}),
    };

    const registry = getOrCreateBridgeRegistry(this.bridge);

    // 1. Incoming payload listener
    this.boundPayloadListener = (epId: string, payload: string) => {
      if (epId !== this.endpointId) return;
      this.handleIncomingPayload(payload);
    };
    registry.payloadListeners.add(this.boundPayloadListener);

    // 2. Connection result listener
    this.boundConnectionListener = (epId: string, status: NativeConnectionStatus, message?: string) => {
      if (epId !== this.endpointId) return;
      if (status === 'CONNECTED') {
        this.isOpenState = true;
        this.hasClosed = false;
      } else if (status === 'REJECTED' || status === 'ERROR' || status === 'DISCONNECTED') {
        this.handleClose(message || `Connection status: ${status}`);
      }
    };
    registry.connectionListeners.add(this.boundConnectionListener);

    // 3. Native disconnection listener
    this.boundDisconnectListener = (epId: string, reason?: string) => {
      if (epId !== this.endpointId) return;
      this.handleClose(reason || 'Native endpoint disconnected');
    };
    registry.disconnectListeners.add(this.boundDisconnectListener);
  }

  public isOpen(): boolean {
    return this.isOpenState && !this.hasClosed;
  }

  /**
   * Serializes the existing RelayMessage to JSON and transmits through the native bridge.
   */
  public async send(message: RelayMessage): Promise<void> {
    if (!this.isOpen()) {
      throw new Error(`[NativeTransport] Cannot send on closed transport to ${this.remotePeerId} (${this.endpointId})`);
    }

    const serialized = JSON.stringify(message);
    await this.bridge.sendPayload(this.endpointId, serialized);
  }

  public onMessage(handler: (message: RelayMessage) => void): void {
    this.messageHandlers.add(handler);
  }

  public onClose(handler: (reason?: string) => void): void {
    this.closeHandlers.add(handler);
  }

  /**
   * Closes the transport locally and requests disconnection on the native bridge.
   * Does not affect other active native peer transports.
   */
  public close(reason?: string): void {
    if (this.hasClosed && !this.isOpenState) return;

    this.isOpenState = false;

    try {
      this.bridge.disconnect(this.endpointId).catch((err) => {
        console.warn(`[NativeTransport] Error invoking bridge disconnect for ${this.endpointId}:`, err);
      });
    } catch (_) {}

    this.handleClose(reason || 'Closed locally');
    this.detachFromBridge();
  }

  private handleIncomingPayload(payload: string): void {
    let parsed: RelayMessage;
    try {
      parsed = JSON.parse(payload);
    } catch (err: any) {
      console.warn(`[NativeTransport] Malformed payload received from ${this.endpointId}: ${err?.message}`);
      return;
    }

    if (!parsed || typeof parsed !== 'object' || typeof parsed.type !== 'string') {
      console.warn(`[NativeTransport] Invalid RelayMessage structure from ${this.endpointId}`);
      return;
    }

    for (const handler of Array.from(this.messageHandlers)) {
      try {
        handler(parsed);
      } catch (err) {
        console.error(`[NativeTransport] Error in onMessage handler for ${this.remotePeerId}:`, err);
      }
    }
  }

  private handleClose(reason?: string): void {
    if (this.hasClosed) return;
    this.hasClosed = true;
    this.isOpenState = false;

    for (const handler of Array.from(this.closeHandlers)) {
      try {
        handler(reason);
      } catch (err) {
        console.error(`[NativeTransport] Error in onClose handler for ${this.remotePeerId}:`, err);
      }
    }
  }

  private detachFromBridge(): void {
    const registry = bridgeRegistries.get(this.bridge);
    if (registry) {
      registry.payloadListeners.delete(this.boundPayloadListener);
      registry.connectionListeners.delete(this.boundConnectionListener);
      registry.disconnectListeners.delete(this.boundDisconnectListener);
    }
  }
}
