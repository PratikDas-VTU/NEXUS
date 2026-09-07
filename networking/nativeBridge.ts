/**
 * NEXUS — Offline-First Emergency & Community Network
 * Native Mesh Bridge Contract (Phase 6 — Step 1)
 * 
 * Defines the strict, minimal boundary between the TypeScript application layer
 * and the native mobile host (e.g. Android Google Nearby Connections, BLE, Wi-Fi Direct).
 * 
 * Boundary Architecture:
 *   RelayEngine
 *       ↓
 *   MultiTransportManager
 *       ↓
 *   NativeTransportProvider (Future Step 4)
 *       ↓
 *   NativeTransport (Future Step 3)
 *       ↓
 *   INativeMeshBridge (This Contract)
 *       ↓
 *   Native Mobile Host (e.g. Android Kotlin / Nearby Connections)
 * 
 * In standard web browsers, this bridge gracefully resolves to unavailable/null,
 * allowing WebRTC and WebSocket transports to continue operating with zero disruption.
 */

export interface NativePeerEndpoint {
  /** Unique identifier assigned to the remote endpoint by the native radio layer */
  endpointId: string;
  /** Human-readable node/device name or localDeviceId broadcast by the remote peer */
  endpointName: string;
  /** Service identifier matching the NEXUS mesh network (e.g. 'nexus-mesh-v1') */
  serviceId: string;
  /** Optional verification/pairing token provided by native radio negotiation */
  authenticationToken?: string;
  /** Optional raw metadata passed by the native radio layer */
  rawEndpointInfo?: string;
}

export type NativeConnectionStatus =
  | 'INITIATED'
  | 'CONNECTED'
  | 'REJECTED'
  | 'ERROR'
  | 'DISCONNECTED';

export interface NativeBridgeStatus {
  available: boolean;
  status?: string;
  platform?: string;
  missingPermissions?: string;
  googlePlayServicesCode?: number;
}

export interface EndpointListenerCallbacks {
  onEndpointFound?: (endpoint: NativePeerEndpoint) => void;
  onEndpointLost?: (endpointId: string) => void;
  onConnectionInitiated?: (endpoint: NativePeerEndpoint) => void;
  onConnectionResult?: (
    endpointId: string,
    status: NativeConnectionStatus,
    message?: string
  ) => void;
  onPayloadReceived?: (endpointId: string, payload: string) => void;
  onDisconnected?: (endpointId: string, reason?: string) => void;
}

/**
 * Interface that the native platform host (Android Kotlin / Nearby Connections)
 * or a mock simulator must fulfill to bridge with the NEXUS transport layer.
 */
export interface INativeMeshBridge {
  /**
   * Returns true if native mesh hardware/APIs are available and operational on this device.
   * Returns false in standard web browsers or unsupported hardware.
   */
  isAvailable(): boolean;

  /**
   * Performs an asynchronous diagnostic probe of native availability, permissions, and radios.
   */
  checkStatus?(): Promise<NativeBridgeStatus>;

  /**
   * Most recent native radio error/rejection message, if any.
   */
  lastError?: string | null;

  /**
   * Retrieves the most recent native radio error/rejection message.
   */
  getLastError?(): string | null;

  /**
   * Registers callbacks for native endpoint and connection events.
   * Returns an unsubscribe function.
   */
  addEndpointListener?(callbacks: EndpointListenerCallbacks): () => void;

  /**
   * Starts native radio advertising to allow nearby NEXUS nodes to discover this device.
   * @param deviceName Local node identifier / name to broadcast
   * @param serviceId Network protocol namespace (e.g. 'nexus-mesh-v1')
   */
  startAdvertising(deviceName: string, serviceId: string): Promise<boolean>;

  /**
   * Stops broadcasting presence over native radio.
   */
  stopAdvertising(): Promise<void>;

  /**
   * Starts scanning for nearby NEXUS nodes over native radio.
   * @param serviceId Network protocol namespace to scan for
   */
  startDiscovery(serviceId: string): Promise<boolean>;

  /**
   * Stops scanning for nearby nodes.
   */
  stopDiscovery(): Promise<void>;

  /**
   * Requests or accepts a connection to a discovered endpoint.
   * @param endpointId Target endpoint identifier
   */
  connect(endpointId: string): Promise<void>;

  /**
   * Transmits a serialized payload string (e.g. RelayMessage JSON) to a connected endpoint.
   * @param endpointId Destination endpoint identifier
   * @param payload UTF-8 string payload
   */
  sendPayload(endpointId: string, payload: string): Promise<void>;

  /**
   * Disconnects a specific connected endpoint.
   * @param endpointId Target endpoint identifier
   */
  disconnect(endpointId: string): Promise<void>;

  /**
   * Disconnects all connected endpoints and ceases native radio activity.
   */
  disconnectAll(): Promise<void>;

  // ─── CALLBACKS DISPATCHED FROM NATIVE HOST TO TYPESCRIPT ─────────────────

  /** Fired when a nearby peer endpoint is discovered over native radio */
  onEndpointFound?: (endpoint: NativePeerEndpoint) => void;

  /** Fired when a previously discovered peer endpoint is lost / out of range */
  onEndpointLost?: (endpointId: string) => void;

  /** Fired when a connection is initiated from or to a remote endpoint */
  onConnectionInitiated?: (endpoint: NativePeerEndpoint) => void;

  /** Fired when a connection request succeeds, fails, or is rejected */
  onConnectionResult?: (
    endpointId: string,
    status: NativeConnectionStatus,
    message?: string
  ) => void;

  /** Fired when an incoming payload string is received from a connected endpoint */
  onPayloadReceived?: (endpointId: string, payload: string) => void;

  /** Fired when an endpoint is disconnected */
  onDisconnected?: (endpointId: string, reason?: string) => void;
}

/**
 * Fallback implementation returned when no native bridge is present.
 * Guarantees that browser environments never throw unexpected null/undefined errors.
 */
export class NoopNativeMeshBridge implements INativeMeshBridge {
  public isAvailable(): boolean {
    return false;
  }

  public async checkStatus(): Promise<NativeBridgeStatus> {
    return { available: false, status: 'browser_environment', platform: 'web' };
  }

  public lastError: string | null = null;

  public getLastError(): string | null {
    return this.lastError;
  }

  public addEndpointListener(_callbacks: EndpointListenerCallbacks): () => void {
    return () => {};
  }

  public async startAdvertising(_deviceName: string, _serviceId: string): Promise<boolean> {
    return false;
  }

  public async stopAdvertising(): Promise<void> {}

  public async startDiscovery(_serviceId: string): Promise<boolean> {
    return false;
  }

  public async stopDiscovery(): Promise<void> {}

  public async connect(_endpointId: string): Promise<void> {}

  public async sendPayload(_endpointId: string, _payload: string): Promise<void> {
    throw new Error('[NoopNativeMeshBridge] Native mesh hardware not available in this environment');
  }

  public async disconnect(_endpointId: string): Promise<void> {}

  public async disconnectAll(): Promise<void> {}
}

import { Capacitor } from '@capacitor/core';
import { CapacitorNativeMeshBridge } from './capacitorBridge.ts';

let customBridgeInstance: INativeMeshBridge | null = null;
let capacitorBridgeInstance: CapacitorNativeMeshBridge | null = null;

/**
 * Explicitly registers an active INativeMeshBridge implementation
 * (used by native container plugins or mock test harnesses).
 */
export function setNativeMeshBridge(bridge: INativeMeshBridge | null): void {
  customBridgeInstance = bridge;
}

/**
 * Detects and retrieves the active native mesh bridge:
 * 1. Returns explicitly registered custom bridge if set (e.g. mock in tests).
 * 2. Returns window.NexusNativeBridge if injected by Android WebView / host.
 * 3. Returns Capacitor bridge if running in native Capacitor container with NexusNative plugin.
 * 4. Returns null if running in standard web browser without native integration.
 */
export function getNativeMeshBridge(): INativeMeshBridge | null {
  if (customBridgeInstance) {
    return customBridgeInstance;
  }

  if (typeof window !== 'undefined' && (window as any).NexusNativeBridge) {
    const injected = (window as any).NexusNativeBridge as INativeMeshBridge;
    if (typeof injected.isAvailable === 'function' && injected.isAvailable()) {
      return injected;
    }
  }

  if (typeof globalThis !== 'undefined' && (globalThis as any).NexusNativeBridge) {
    const injected = (globalThis as any).NexusNativeBridge as INativeMeshBridge;
    if (typeof injected.isAvailable === 'function' && injected.isAvailable()) {
      return injected;
    }
  }

  // 3. Capacitor native container bridge detection
  try {
    if (
      typeof Capacitor !== 'undefined' &&
      typeof Capacitor.isPluginAvailable === 'function' &&
      Capacitor.isPluginAvailable('NexusNative')
    ) {
      if (!capacitorBridgeInstance) {
        capacitorBridgeInstance = new CapacitorNativeMeshBridge();
      }
      return capacitorBridgeInstance;
    }
  } catch {
    // Non-Capacitor environment; safely fallback to null
  }

  return null;
}

/**
 * Convenience helper to query whether native mesh capabilities are present and active.
 * Safe to call anywhere in browser code (returns false cleanly without throwing).
 */
export function isNativeMeshAvailable(): boolean {
  const bridge = getNativeMeshBridge();
  return bridge !== null && bridge.isAvailable();
}
