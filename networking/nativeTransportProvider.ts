/**
 * NEXUS — Offline-First Emergency & Community Network
 * Native Transport Provider (Phase 6 — Step 3)
 * 
 * Implements the INexusTransportProvider contract for direct, infrastructure-less
 * phone-to-phone communication via native radio (e.g. Google Nearby Connections P2P_CLUSTER).
 * 
 * Boundary Architecture:
 *   RelayEngine (Store-Carry-Forward)
 *       ↓
 *   MultiTransportManager (Health & Priority: 80)
 *       ↓
 *   NativeTransportProvider (This Class)
 *       ↓
 *   NativeTransport (Single Peer Contract)
 *       ↓
 *   INativeMeshBridge (Native Android / Nearby Connections)
 * 
 * Responsibilities:
 * - Coordinates radio advertising (startAdvertising) and discovery (startDiscovery).
 * - Filters discovered endpoints by NEXUS service ID ('nexus-mesh-v1').
 * - Initiates and accepts direct peer connections via bridge.connect().
 * - Manages the lifecycle of NativeTransport instances for connected endpoints.
 * - Emits onTransportReady(transport) when a native connection is confirmed.
 * - Ensures multiple endpoints can coexist independently without crosstalk.
 * - Provides graceful no-op behavior when running in standard web browsers.
 */

import type { NexusTransport, TransportType } from '../shared/interfaces.ts';
import type { INexusTransportProvider } from './transportProvider.ts';
import {
  type INativeMeshBridge,
  type NativePeerEndpoint,
  type NativeConnectionStatus,
  getNativeMeshBridge,
} from './nativeBridge.ts';
import { NativeTransport } from './nativeTransport.ts';

export const DEFAULT_NEXUS_SERVICE_ID = 'nexus-mesh-v1';
export const DEFAULT_NATIVE_PRIORITY = 80;

export interface NativeTransportProviderOptions {
  bridge?: INativeMeshBridge | null;
  localDeviceId?: string;
  serviceId?: string;
  priority?: number;
  onLog?: (level: 'info' | 'warn' | 'error', message: string) => void;
  onStateChange?: () => void;
  onPeerDiscovered?: (peerId: string) => void;
  onPeerLost?: (peerId: string) => void;
}

export class NativeTransportProvider implements INexusTransportProvider {
  public readonly id = 'nearby';
  public readonly name = 'Native Nearby Connections';
  public readonly transportType: TransportType = 'nearby';
  public readonly priority: number;

  private bridge: INativeMeshBridge | null = null;
  private localDeviceId: string;
  private serviceId: string;
  private isRunning = false;

  // Endpoint and connection maps
  private endpoints = new Map<string, NativePeerEndpoint>();
  private pendingConnections = new Set<string>();
  private activeTransports = new Map<string, NativeTransport>();
  private endpointToPeerId = new Map<string, string>();
  private peerIdToEndpointId = new Map<string, string>();

  // Event handlers
  private transportReadyHandlers: Array<(transport: NexusTransport) => void> = [];
  private peerDiscoveredHandlers: Array<(peerId: string) => void> = [];
  private peerLostHandlers: Array<(peerId: string) => void> = [];
  private onLog?: (level: 'info' | 'warn' | 'error', message: string) => void;
  private onStateChange?: () => void;

  constructor(options?: NativeTransportProviderOptions) {
    this.bridge = options?.bridge ?? getNativeMeshBridge();
    this.localDeviceId = options?.localDeviceId || '';
    this.serviceId = options?.serviceId || DEFAULT_NEXUS_SERVICE_ID;
    this.priority = options?.priority ?? DEFAULT_NATIVE_PRIORITY;
    this.onLog = options?.onLog;
    this.onStateChange = options?.onStateChange;
  }

  public isSupported(): boolean {
    if (!this.bridge) {
      this.bridge = getNativeMeshBridge();
    }
    return this.bridge !== null && this.bridge.isAvailable();
  }

  public setLocalDeviceId(deviceId: string): void {
    this.localDeviceId = deviceId;
  }

  public setBridge(bridge: INativeMeshBridge | null): void {
    if (this.isRunning) {
      this.detachBridgeListeners();
    }
    this.bridge = bridge;
    if (this.isRunning && this.bridge) {
      this.attachBridgeListeners();
    }
  }

  // ─── INexusTransportProvider LIFECYCLE ────────────────────────────────────

  public async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    if (!this.isSupported()) {
      this.log('info', 'Native mesh hardware not available in this environment. Running in dormant mode.');
      this.onStateChange?.();
      return;
    }

    this.attachBridgeListeners();

    try {
      this.log('info', `Starting native radio advertising for ${this.localDeviceId} on ${this.serviceId}`);
      await this.bridge!.startAdvertising(this.localDeviceId, this.serviceId);
    } catch (err: any) {
      this.log('warn', `Failed to start native radio advertising: ${err?.message}`);
    }

    try {
      this.log('info', `Starting native radio discovery on ${this.serviceId}`);
      await this.bridge!.startDiscovery(this.serviceId);
    } catch (err: any) {
      this.log('warn', `Failed to start native radio discovery: ${err?.message}`);
    }

    this.onStateChange?.();
  }

  public async stop(): Promise<void> {
    if (!this.isRunning && this.activeTransports.size === 0) return;
    this.isRunning = false;

    this.detachBridgeListeners();

    if (this.bridge && this.bridge.isAvailable()) {
      try {
        await this.bridge.stopDiscovery();
      } catch (_) {}
      try {
        await this.bridge.stopAdvertising();
      } catch (_) {}
      try {
        await this.bridge.disconnectAll();
      } catch (_) {}
    }

    // Close and clean all active transports
    for (const transport of Array.from(this.activeTransports.values())) {
      try {
        transport.close('NativeTransportProvider stopped');
      } catch (_) {}
    }

    this.activeTransports.clear();
    this.pendingConnections.clear();
    this.endpoints.clear();
    this.endpointToPeerId.clear();
    this.peerIdToEndpointId.clear();

    this.log('info', 'NativeTransportProvider stopped cleanly.');
    this.onStateChange?.();
  }

  // ─── EVENT REGISTRATION ───────────────────────────────────────────────────

  public onTransportReady(handler: (transport: NexusTransport) => void): void {
    this.transportReadyHandlers.push(handler);
  }

  public onPeerDiscovered(handler: (peerId: string) => void): void {
    this.peerDiscoveredHandlers.push(handler);
  }

  public onPeerLost(handler: (peerId: string) => void): void {
    this.peerLostHandlers.push(handler);
  }

  // ─── QUERY & INSPECTION ───────────────────────────────────────────────────

  public getActiveTransports(): NativeTransport[] {
    return Array.from(this.activeTransports.values());
  }

  public getActiveEndpointIds(): string[] {
    return Array.from(this.activeTransports.keys());
  }

  public getActivePeerIds(): string[] {
    return Array.from(this.peerIdToEndpointId.keys());
  }

  public getTransport(endpointIdOrPeerId: string): NativeTransport | undefined {
    let transport = this.activeTransports.get(endpointIdOrPeerId);
    if (!transport) {
      const epId = this.peerIdToEndpointId.get(endpointIdOrPeerId);
      if (epId) {
        transport = this.activeTransports.get(epId);
      }
    }
    return transport;
  }

  public isEndpointConnected(endpointId: string): boolean {
    const transport = this.activeTransports.get(endpointId);
    return transport !== undefined && transport.isOpen();
  }

  // ─── DISCOVERY & CONNECTION STATE MACHINE ─────────────────────────────────

  private attachBridgeListeners(): void {
    if (!this.bridge) return;

    this.bridge.onEndpointFound = (endpoint) => {
      this.handleEndpointFound(endpoint);
    };

    this.bridge.onEndpointLost = (endpointId) => {
      this.handleEndpointLost(endpointId);
    };

    this.bridge.onConnectionInitiated = (endpoint) => {
      this.handleConnectionInitiated(endpoint);
    };

    const prevConnectionResult = this.bridge.onConnectionResult;
    this.bridge.onConnectionResult = (endpointId, status, message) => {
      prevConnectionResult?.(endpointId, status, message);
      this.handleConnectionResult(endpointId, status, message);
    };

    const prevDisconnected = this.bridge.onDisconnected;
    this.bridge.onDisconnected = (endpointId, reason) => {
      prevDisconnected?.(endpointId, reason);
      this.handleDisconnected(endpointId, reason);
    };
  }

  private detachBridgeListeners(): void {
    if (!this.bridge) return;
    this.bridge.onEndpointFound = undefined;
    this.bridge.onEndpointLost = undefined;
    this.bridge.onConnectionInitiated = undefined;
  }

  private async handleEndpointFound(endpoint: NativePeerEndpoint): Promise<void> {
    if (!this.isRunning) return;

    // Verify service namespace
    if (endpoint.serviceId && endpoint.serviceId !== this.serviceId) {
      this.log('info', `Ignoring endpoint ${endpoint.endpointId} with unrelated service: ${endpoint.serviceId}`);
      return;
    }

    // Determine remote peer ID
    const peerId = endpoint.endpointName ? endpoint.endpointName : endpoint.endpointId;
    if (peerId === this.localDeviceId) {
      this.log('info', `Ignoring self-discovered endpoint: ${endpoint.endpointId}`);
      return;
    }

    // Prevent duplicate connection attempts if already active or pending
    if (this.activeTransports.has(endpoint.endpointId)) {
      this.log('info', `Endpoint ${endpoint.endpointId} already has an active transport. Skipping duplicate discovery.`);
      return;
    }

    if (this.pendingConnections.has(endpoint.endpointId)) {
      this.log('info', `Connection already pending for endpoint ${endpoint.endpointId}. Skipping duplicate attempt.`);
      return;
    }

    this.endpoints.set(endpoint.endpointId, endpoint);
    this.endpointToPeerId.set(endpoint.endpointId, peerId);
    this.peerIdToEndpointId.set(peerId, endpoint.endpointId);

    this.emitPeerDiscovered(peerId);

    // Initiate native radio connection
    this.pendingConnections.add(endpoint.endpointId);
    this.log('info', `Initiating native connection to ${peerId} (${endpoint.endpointId})...`);

    try {
      await this.bridge!.connect(endpoint.endpointId);
    } catch (err: any) {
      this.pendingConnections.delete(endpoint.endpointId);
      this.log('warn', `Failed to initiate connection to ${endpoint.endpointId}: ${err?.message}`);
    }
  }

  private async handleConnectionInitiated(endpoint: NativePeerEndpoint): Promise<void> {
    if (!this.isRunning) return;
    if (endpoint.serviceId && endpoint.serviceId !== this.serviceId) return;

    const peerId = endpoint.endpointName ? endpoint.endpointName : endpoint.endpointId;
    if (peerId === this.localDeviceId) return;

    this.endpoints.set(endpoint.endpointId, endpoint);
    this.endpointToPeerId.set(endpoint.endpointId, peerId);
    this.peerIdToEndpointId.set(peerId, endpoint.endpointId);

    // Confirm / accept incoming connection if not already active
    if (!this.activeTransports.has(endpoint.endpointId) && !this.pendingConnections.has(endpoint.endpointId)) {
      this.pendingConnections.add(endpoint.endpointId);
      this.log('info', `Accepting incoming native connection from ${peerId} (${endpoint.endpointId})...`);
      try {
        await this.bridge!.connect(endpoint.endpointId);
      } catch (err: any) {
        this.pendingConnections.delete(endpoint.endpointId);
        this.log('warn', `Failed to accept connection from ${endpoint.endpointId}: ${err?.message}`);
      }
    }
  }

  private handleConnectionResult(
    endpointId: string,
    status: NativeConnectionStatus,
    message?: string
  ): void {
    this.pendingConnections.delete(endpointId);

    if (status === 'CONNECTED') {
      // Guard against duplicate transports for the same active connection
      if (this.activeTransports.has(endpointId)) {
        return;
      }

      const peerId = this.endpointToPeerId.get(endpointId) || endpointId;
      this.log('info', `✔ Native connection ESTABLISHED with ${peerId} (${endpointId})`);

      const transport = new NativeTransport(this.bridge!, endpointId, peerId, {
        initiallyOpen: true,
      });

      this.activeTransports.set(endpointId, transport);

      transport.onClose((reason) => {
        this.handleTransportClosed(endpointId, reason);
      });

      this.emitTransportReady(transport);
      this.onStateChange?.();
    } else if (status === 'REJECTED' || status === 'ERROR' || status === 'DISCONNECTED') {
      this.log('warn', `Native connection ${status} for ${endpointId}: ${message || 'no details'}`);
      if (this.activeTransports.has(endpointId)) {
        this.handleTransportClosed(endpointId, message || status);
      }
    }
  }

  private handleEndpointLost(endpointId: string): void {
    const peerId = this.endpointToPeerId.get(endpointId) || endpointId;
    this.log('info', `Native endpoint lost: ${peerId} (${endpointId})`);

    // If transport is not open or closed, clean up references
    const transport = this.activeTransports.get(endpointId);
    if (!transport || !transport.isOpen()) {
      this.handleTransportClosed(endpointId, 'Endpoint lost from scan');
    } else {
      // Endpoint is no longer advertising, but active connection is still open
      this.endpoints.delete(endpointId);
    }
  }

  private handleDisconnected(endpointId: string, reason?: string): void {
    this.handleTransportClosed(endpointId, reason || 'Native host reported disconnect');
  }

  private handleTransportClosed(endpointId: string, reason?: string): void {
    const peerId = this.endpointToPeerId.get(endpointId);
    const transport = this.activeTransports.get(endpointId);
    const endpoint = this.endpoints.get(endpointId);
    const isPending = this.pendingConnections.has(endpointId);

    // Guard against duplicate / redundant close calls
    if (!peerId && !transport && !endpoint && !isPending) {
      return;
    }

    const resolvedPeerId = peerId || endpointId;
    this.log('info', `Native transport closed for ${resolvedPeerId} (${endpointId}): ${reason || 'normal'}`);

    this.activeTransports.delete(endpointId);
    this.pendingConnections.delete(endpointId);
    this.endpointToPeerId.delete(endpointId);
    if (peerId) {
      this.peerIdToEndpointId.delete(peerId);
    }
    this.endpoints.delete(endpointId);

    this.emitPeerLost(resolvedPeerId);
    this.onStateChange?.();
  }

  // ─── EVENT EMISSION HELPERS ───────────────────────────────────────────────

  private emitTransportReady(transport: NexusTransport): void {
    for (const handler of Array.from(this.transportReadyHandlers)) {
      try {
        handler(transport);
      } catch (err) {
        console.error('[NativeTransportProvider] Error in onTransportReady handler:', err);
      }
    }
  }

  private emitPeerDiscovered(peerId: string): void {
    for (const handler of Array.from(this.peerDiscoveredHandlers)) {
      try {
        handler(peerId);
      } catch (err) {
        console.error('[NativeTransportProvider] Error in onPeerDiscovered handler:', err);
      }
    }
  }

  private emitPeerLost(peerId: string): void {
    for (const handler of Array.from(this.peerLostHandlers)) {
      try {
        handler(peerId);
      } catch (err) {
        console.error('[NativeTransportProvider] Error in onPeerLost handler:', err);
      }
    }
  }

  private log(level: 'info' | 'warn' | 'error', message: string): void {
    if (this.onLog) {
      this.onLog(level, message);
    }
  }
}
