/**
 * NEXUS — Real Android Nearby Connections Controller
 * (Phase 6 — Step 5B.5)
 * 
 * Manages the pure TypeScript state machine and lifecycle for Google Nearby Connections:
 * - Preflight diagnostics (Google Play Services, Bluetooth, permissions, browser mode)
 * - Simultaneous Advertising + Discovery under 'nexus-mesh-v1'
 * - Real endpointFound / endpointLost node lifecycle and deduplication
 * - Connection initiation, result confirmation, and disconnection state
 * - Event subscription with clean unsubscription
 */

import {
  getNativeMeshBridge,
  type INativeMeshBridge,
  type NativePeerEndpoint,
  type NativeConnectionStatus,
  type NativeBridgeStatus,
} from '../../../networking/nativeBridge';
import { DEFAULT_NEXUS_SERVICE_ID } from '../../../networking/nativeTransportProvider';
import { NativeTransport } from '../../../networking/nativeTransport';
import type { RelayEngine, PeerHandshakeState } from '../../../networking/relayEngine';
import type { MultiTransportManager } from '../../../networking/multiTransportManager';

export type NearbyPreflightState =
  | 'IDLE'
  | 'CHECKING'
  | 'READY'
  | 'PERMISSIONS_MISSING'
  | 'BLUETOOTH_UNSUPPORTED'
  | 'PLAY_SERVICES_UNAVAILABLE'
  | 'BROWSER_UNSUPPORTED'
  | 'ERROR';

export type NearbyNodeStatus =
  | 'DISCOVERED'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'DISCONNECTED';

export interface NearbyNode {
  endpointId: string;
  endpointName: string;
  serviceId: string;
  status: NearbyNodeStatus;
  connectionError?: string;
  discoveredAt: number;
  lastSeenAt: number;
  connectedAt?: number;
  handshakeState?: PeerHandshakeState;
  relayedCount?: number;
}

export interface NearbyMeshControllerOptions {
  localDeviceId: string;
  serviceId?: string;
  bridge?: INativeMeshBridge | null;
  relayEngine?: RelayEngine;
  multiTransportManager?: MultiTransportManager;
  autoConnect?: boolean;
  onToast?: (message: string) => void;
  onStateChange?: () => void;
}

export class NearbyMeshController {
  private localDeviceId: string;
  private serviceId: string;
  private bridge: INativeMeshBridge | null;
  private relayEngine?: RelayEngine;
  private multiTransportManager?: MultiTransportManager;
  private autoConnect: boolean;
  private onToast?: (message: string) => void;
  private listeners: Set<() => void> = new Set();
  private bridgeUnsubscribe?: () => void;
  private relayEngineUnsubscribe?: () => void;

  public isScanning = false;
  public isStarting = false;
  public isStopping = false;
  public advertising = false;
  public discovery = false;
  public isNativeAvailable = false;

  public preflightState: NearbyPreflightState = 'IDLE';
  public missingPermissions: string[] = [];
  public errorMessage: string | null = null;

  public nodes: NearbyNode[] = [];
  private connectionTimeouts = new Map<string, any>();
  private activeTransports = new Map<string, NativeTransport>();
  private pendingConnections = new Set<string>();
  private outgoingConnectQueue: string[] = [];
  private isOutgoingHandshakeInProgress = false;
  private transportReadyHandlers: Array<(transport: NativeTransport) => void> = [];

  private setConnectionTimeout(endpointId: string): void {
    this.clearConnectionTimeout(endpointId);
    const timer = setTimeout(() => {
      this.connectionTimeouts.delete(endpointId);
      this.pendingConnections.delete(endpointId);
      if (this.isOutgoingHandshakeInProgress) {
        this.isOutgoingHandshakeInProgress = false;
        this.processOutgoingConnectQueue();
      }
      const target = this.nodes.find((n) => n.endpointId === endpointId);
      if (target && target.status === 'CONNECTING') {
        const timeoutMsg = 'Connection attempt timed out (20s)';
        console.warn(`[NearbyMeshController] Connection timeout for ${endpointId} (${target.endpointName})`);
        this.nodes = this.nodes.map((n) =>
          n.endpointId === endpointId
            ? { ...n, status: 'DISCONNECTED', connectionError: timeoutMsg }
            : n
        );
        this.onToast?.(`Connection to ${target.endpointName} timed out (20s)`);
        this.notify();
      }
    }, 20000);
    this.connectionTimeouts.set(endpointId, timer);
  }

  private clearConnectionTimeout(endpointId: string): void {
    const timer = this.connectionTimeouts.get(endpointId);
    if (timer) {
      clearTimeout(timer);
      this.connectionTimeouts.delete(endpointId);
    }
  }

  private clearAllConnectionTimeouts(): void {
    for (const timer of this.connectionTimeouts.values()) {
      clearTimeout(timer);
    }
    this.connectionTimeouts.clear();
  }

  constructor(options: NearbyMeshControllerOptions) {
    this.localDeviceId = options.localDeviceId;
    this.serviceId = options.serviceId || DEFAULT_NEXUS_SERVICE_ID;
    this.bridge = options.bridge !== undefined ? options.bridge : getNativeMeshBridge();
    this.relayEngine = options.relayEngine;
    this.multiTransportManager = options.multiTransportManager;
    this.autoConnect = options.autoConnect ?? false;
    this.onToast = options.onToast;

    if (options.onStateChange) {
      this.listeners.add(options.onStateChange);
    }

    if (this.relayEngine) {
      this.relayEngineUnsubscribe = this.relayEngine.subscribeStatus(() => {
        this.syncNodeStatesWithRelayEngine();
      });
    }

    this.attachBridgeListeners();
  }

  public setOnToast(onToast?: (message: string) => void): void {
    this.onToast = onToast;
  }

  public updateLocalDeviceId(newId: string): void {
    if (this.localDeviceId === newId) return;
    this.localDeviceId = newId;
  }

  public setRelayEngine(relayEngine: RelayEngine): void {
    if (this.relayEngineUnsubscribe) {
      this.relayEngineUnsubscribe();
    }
    this.relayEngine = relayEngine;
    this.relayEngineUnsubscribe = this.relayEngine.subscribeStatus(() => {
      this.syncNodeStatesWithRelayEngine();
    });
  }

  public setMultiTransportManager(manager: MultiTransportManager): void {
    this.multiTransportManager = manager;
  }

  public onTransportReady(handler: (transport: NativeTransport) => void): () => void {
    this.transportReadyHandlers.push(handler);
    return () => {
      const idx = this.transportReadyHandlers.indexOf(handler);
      if (idx !== -1) {
        this.transportReadyHandlers.splice(idx, 1);
      }
    };
  }

  public getActiveTransports(): NativeTransport[] {
    return Array.from(this.activeTransports.values());
  }

  public getActiveTransport(endpointId: string): NativeTransport | undefined {
    return this.activeTransports.get(endpointId);
  }

  private syncNodeStatesWithRelayEngine(): void {
    if (!this.relayEngine) return;
    let changed = false;
    this.nodes = this.nodes.map((node) => {
      if (node.status !== 'CONNECTED') return node;
      const peerId = node.endpointName || node.endpointId;
      const session = this.relayEngine!.getPeerSession(peerId);
      if (session) {
        if (node.handshakeState !== session.state || node.relayedCount !== session.relayedCount) {
          changed = true;
          return {
            ...node,
            handshakeState: session.state,
            relayedCount: session.relayedCount,
          };
        }
      }
      return node;
    });
    if (changed) {
      this.notify();
    }
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (_) {}
    }
  }

  public getConnectedNodes(): NearbyNode[] {
    return this.nodes.filter((n) => n.status === 'CONNECTED');
  }

  public getDiscoveredCount(): number {
    return this.nodes.filter((n) => n.status !== 'DISCONNECTED').length;
  }

  public getConnectedCount(): number {
    return this.getConnectedNodes().length;
  }

  public setBridge(bridge: INativeMeshBridge | null): void {
    this.detachBridgeListeners();
    this.bridge = bridge;
    this.attachBridgeListeners();
    this.checkPrerequisites().catch(() => {});
  }

  // ─── 1. PRE-FLIGHT CHECK ──────────────────────────────────────────────────

  public async checkPrerequisites(): Promise<{ ready: boolean; state: NearbyPreflightState }> {
    this.preflightState = 'CHECKING';
    this.errorMessage = null;
    this.notify();

    if (!this.bridge) {
      this.preflightState = 'BROWSER_UNSUPPORTED';
      this.isNativeAvailable = false;
      this.errorMessage =
        'Native Nearby Connections is unavailable in standard web browsers. WebRTC & WebSocket mesh fallback active.';
      this.notify();
      return { ready: false, state: 'BROWSER_UNSUPPORTED' };
    }

    try {
      let statusInfo: NativeBridgeStatus;
      if (typeof this.bridge.checkStatus === 'function') {
        statusInfo = await this.bridge.checkStatus();
      } else {
        const avail = this.bridge.isAvailable();
        statusInfo = { available: avail, status: avail ? 'ready' : 'unknown' };
      }

      if (statusInfo.status === 'browser_environment') {
        this.preflightState = 'BROWSER_UNSUPPORTED';
        this.isNativeAvailable = false;
        this.errorMessage =
          'Native Nearby Connections requires Android APK. WebRTC & WebSocket mesh fallback active.';
        this.notify();
        return { ready: false, state: 'BROWSER_UNSUPPORTED' };
      }

      if (statusInfo.status === 'permissions_missing') {
        this.preflightState = 'PERMISSIONS_MISSING';
        this.isNativeAvailable = false;
        this.missingPermissions = statusInfo.missingPermissions
          ? statusInfo.missingPermissions.split(',').map((s) => s.trim())
          : ['Nearby Devices'];
        this.errorMessage = 'Required Android Nearby runtime permissions have not been granted.';
        this.notify();
        return { ready: false, state: 'PERMISSIONS_MISSING' };
      }

      if (statusInfo.status === 'bluetooth_unsupported') {
        this.preflightState = 'BLUETOOTH_UNSUPPORTED';
        this.isNativeAvailable = false;
        this.errorMessage = 'Bluetooth radio hardware is unsupported or disabled on this device.';
        this.notify();
        return { ready: false, state: 'BLUETOOTH_UNSUPPORTED' };
      }

      if (statusInfo.status === 'google_play_services_unavailable') {
        this.preflightState = 'PLAY_SERVICES_UNAVAILABLE';
        this.isNativeAvailable = false;
        this.errorMessage = 'Google Play Services Nearby Connections API is unavailable or requires updating.';
        this.notify();
        return { ready: false, state: 'PLAY_SERVICES_UNAVAILABLE' };
      }

      if (statusInfo.available === true || statusInfo.status === 'ready' || statusInfo.status === 'active') {
        this.preflightState = 'READY';
        this.isNativeAvailable = true;
        this.missingPermissions = [];
        this.errorMessage = null;
        this.notify();
        return { ready: true, state: 'READY' };
      }

      this.preflightState = 'ERROR';
      this.isNativeAvailable = false;
      this.errorMessage = statusInfo.status ? `Nearby unavailable: ${statusInfo.status}` : 'Nearby bridge initialization failed';
      this.notify();
      return { ready: false, state: 'ERROR' };
    } catch (err: any) {
      this.preflightState = 'ERROR';
      this.isNativeAvailable = false;
      this.errorMessage = err?.message || 'Pre-flight check failed';
      this.notify();
      return { ready: false, state: 'ERROR' };
    }
  }

  // ─── 2. BRIDGE LISTENERS ──────────────────────────────────────────────────

  private evaluateAutoConnect(endpoint: NativePeerEndpoint): void {
    if (!this.autoConnect) return;

    const peerDeviceId = endpoint.endpointName;
    // Safeguard 2: If remote stable NEXUS device ID cannot be determined reliably, do NOT guess using endpointId
    if (!peerDeviceId || typeof peerDeviceId !== 'string' || peerDeviceId.trim().length === 0) {
      console.log(
        `[NearbyMeshController] Endpoint ${endpoint.endpointId} has no stable device ID in endpointName. Deferring auto-connect.`
      );
      return;
    }

    if (peerDeviceId === this.localDeviceId) {
      return;
    }

    // If node is already connected or connecting, ignore
    const existing = this.nodes.find(
      (n) => n.endpointId === endpoint.endpointId || (n.endpointName && n.endpointName === peerDeviceId)
    );
    if (existing && (existing.status === 'CONNECTED' || existing.status === 'CONNECTING')) {
      return;
    }

    // If already in pending connections or in outgoing queue, ignore
    if (this.pendingConnections.has(endpoint.endpointId) || this.outgoingConnectQueue.includes(endpoint.endpointId)) {
      return;
    }

    // Deterministic tie-breaker: Compare stable NEXUS device IDs independently per peer pair
    const isInitiator = this.localDeviceId.localeCompare(peerDeviceId) < 0;
    if (isInitiator) {
      console.log(
        `[NearbyMeshController] Deterministic initiator for ${peerDeviceId} (local: ${this.localDeviceId} < remote: ${peerDeviceId}).`
      );
      if (this.isOutgoingHandshakeInProgress) {
        console.log(
          `[NearbyMeshController] Outgoing handshake in progress. Enqueueing ${endpoint.endpointId} (${peerDeviceId}) for serialized connect.`
        );
        this.outgoingConnectQueue.push(endpoint.endpointId);
      } else {
        this.executeOutgoingConnect(endpoint.endpointId);
      }
    } else {
      console.log(
        `[NearbyMeshController] Deterministic receiver for ${peerDeviceId} (local: ${this.localDeviceId} >= remote: ${peerDeviceId}). Awaiting incoming connection...`
      );
    }
  }

  private executeOutgoingConnect(endpointId: string): void {
    this.isOutgoingHandshakeInProgress = true;
    this.connect(endpointId).catch((err) => {
      console.warn(`[NearbyMeshController] Auto-connect to ${endpointId} failed:`, err);
      this.isOutgoingHandshakeInProgress = false;
      this.processOutgoingConnectQueue();
    });
  }

  private processOutgoingConnectQueue(): void {
    if (this.isOutgoingHandshakeInProgress) return;

    while (this.outgoingConnectQueue.length > 0) {
      const nextId = this.outgoingConnectQueue.shift()!;
      const target = this.nodes.find((n) => n.endpointId === nextId);
      // Skip if already connected or connecting (e.g. accepted via incoming connection)
      if (target && (target.status === 'CONNECTED' || target.status === 'CONNECTING')) {
        continue;
      }
      if (this.pendingConnections.has(nextId)) {
        continue;
      }

      this.executeOutgoingConnect(nextId);
      break;
    }
  }

  private attachBridgeListeners(): void {
    if (!this.bridge) return;

    const callbacks = {
      onEndpointFound: (endpoint: NativePeerEndpoint) => {
        if (endpoint.serviceId && endpoint.serviceId !== this.serviceId) return;
        const peerName = endpoint.endpointName || endpoint.endpointId;
        if (peerName === this.localDeviceId) return;

        const existingIdx = this.nodes.findIndex((n) => n.endpointId === endpoint.endpointId);
        if (existingIdx !== -1) {
          this.nodes[existingIdx] = {
            ...this.nodes[existingIdx],
            endpointName: endpoint.endpointName || this.nodes[existingIdx].endpointName,
            lastSeenAt: Date.now(),
            status: this.nodes[existingIdx].status === 'DISCONNECTED' ? 'DISCOVERED' : this.nodes[existingIdx].status,
          };
        } else {
          const newNode: NearbyNode = {
            endpointId: endpoint.endpointId,
            endpointName: endpoint.endpointName || endpoint.endpointId,
            serviceId: endpoint.serviceId || this.serviceId,
            status: 'DISCOVERED',
            discoveredAt: Date.now(),
            lastSeenAt: Date.now(),
          };
          this.nodes.push(newNode);
          this.onToast?.(`Nearby node detected: ${newNode.endpointName}`);
        }
        this.notify();

        // Evaluate deterministic auto-connect
        this.evaluateAutoConnect(endpoint);
      },

      onEndpointLost: (endpointId: string) => {
        const target = this.nodes.find((n) => n.endpointId === endpointId);
        if (!target) return;

        if (target.status === 'DISCOVERED' || target.status === 'CONNECTING') {
          this.onToast?.(`Nearby node departed: ${target.endpointName}`);
          this.nodes = this.nodes.filter((n) => n.endpointId !== endpointId);
        } else {
          this.nodes = this.nodes.map((n) =>
            n.endpointId === endpointId
              ? { ...n, status: 'DISCONNECTED', connectionError: 'Radio signal lost' }
              : n
          );
        }
        this.notify();
      },

      onConnectionInitiated: (endpoint: NativePeerEndpoint) => {
        console.log(
          `[NearbyMeshController] onConnectionInitiated: endpointId=${endpoint.endpointId}, endpointName=${endpoint.endpointName}, serviceId=${endpoint.serviceId}`
        );
        if (endpoint.serviceId && endpoint.serviceId !== this.serviceId) return;
        if (endpoint.endpointName === this.localDeviceId) return;

        // If this endpoint was queued for outgoing connection, remove it since incoming connection arrived
        const qIdx = this.outgoingConnectQueue.indexOf(endpoint.endpointId);
        if (qIdx !== -1) {
          this.outgoingConnectQueue.splice(qIdx, 1);
        }

        this.pendingConnections.add(endpoint.endpointId);

        // Check if we already have this endpoint by ID or by matching name
        const existing = this.nodes.find(
          (n) =>
            n.endpointId === endpoint.endpointId ||
            (endpoint.endpointName && n.endpointName === endpoint.endpointName)
        );

        if (existing) {
          const prevId = existing.endpointId;
          this.nodes = this.nodes.map((n) =>
            n.endpointId === prevId
              ? {
                  ...n,
                  endpointId: endpoint.endpointId,
                  endpointName: endpoint.endpointName || n.endpointName,
                  status: 'CONNECTING',
                  connectionError: undefined,
                }
              : n
          );
          if (prevId !== endpoint.endpointId) {
            this.clearConnectionTimeout(prevId);
            this.pendingConnections.delete(prevId);
          }
        } else {
          this.nodes.push({
            endpointId: endpoint.endpointId,
            endpointName: endpoint.endpointName || endpoint.endpointId,
            serviceId: endpoint.serviceId || this.serviceId,
            status: 'CONNECTING',
            discoveredAt: Date.now(),
            lastSeenAt: Date.now(),
          });
        }
        this.setConnectionTimeout(endpoint.endpointId);
        this.notify();
      },

      onConnectionResult: (
        endpointId: string,
        status: NativeConnectionStatus,
        message?: string,
        statusCode?: number,
        statusDescription?: string
      ) => {
        console.log(
          `[NearbyMeshController] onConnectionResult: endpointId=${endpointId}, status=${status}, statusCode=${statusCode} (${statusDescription}), message=${message}`
        );
        this.clearConnectionTimeout(endpointId);
        this.pendingConnections.delete(endpointId);

        // Free outgoing handshake lock and process next queued endpoint if any
        this.isOutgoingHandshakeInProgress = false;
        this.processOutgoingConnectQueue();

        if (status === 'CONNECTED') {
          this.nodes = this.nodes.map((n) => {
            if (n.endpointId !== endpointId) return n;
            this.onToast?.(`Connected to ${n.endpointName} via Nearby P2P`);
            return {
              ...n,
              status: 'CONNECTED',
              connectionError: undefined,
              connectedAt: Date.now(),
            };
          });

          // Create and register NativeTransport
          if (!this.activeTransports.has(endpointId) && this.bridge) {
            const target = this.nodes.find((n) => n.endpointId === endpointId);
            const peerId = target && target.endpointName ? target.endpointName : endpointId;
            const transport = new NativeTransport(this.bridge, endpointId, peerId, {
              initiallyOpen: true,
            });
            this.activeTransports.set(endpointId, transport);

            transport.onClose((reason) => {
              this.activeTransports.delete(endpointId);
              this.pendingConnections.delete(endpointId);
              this.syncNodeStatesWithRelayEngine();
              console.log(
                `[NearbyMeshController] NativeTransport closed for ${endpointId}: ${reason || 'normal'}`
              );
            });

            // Register with RelayEngine (triggers HELLO automatically)
            if (this.relayEngine) {
              this.relayEngine.registerTransport(transport);
            }
            // Register with MultiTransportManager
            if (this.multiTransportManager) {
              this.multiTransportManager.registerTransport(transport);
            }

            for (const handler of Array.from(this.transportReadyHandlers)) {
              try {
                handler(transport);
              } catch (err) {
                console.error('[NearbyMeshController] Error in transportReady handler:', err);
              }
            }
          }

          this.syncNodeStatesWithRelayEngine();
          this.notify();
        } else {
          // Status is REJECTED, ERROR, or DISCONNECTED
          const existingTransport = this.activeTransports.get(endpointId);
          if (existingTransport) {
            existingTransport.close(message || status);
            this.activeTransports.delete(endpointId);
          }

          const err =
            message ||
            (status === 'REJECTED'
              ? statusDescription
                ? `Connection rejected: ${statusDescription}`
                : 'Connection rejected'
              : 'Connection failed');

          this.nodes = this.nodes.map((n) => {
            if (n.endpointId !== endpointId) return n;
            this.onToast?.(`Connection to ${n.endpointName} failed: ${err}`);
            return {
              ...n,
              status: 'DISCONNECTED',
              connectionError: err,
            };
          });
          this.syncNodeStatesWithRelayEngine();
          this.notify();
        }
      },

      onDisconnected: (endpointId: string, reason?: string) => {
        console.log(`[NearbyMeshController] onDisconnected: endpointId=${endpointId}, reason=${reason}`);
        this.clearConnectionTimeout(endpointId);
        this.pendingConnections.delete(endpointId);

        const qIdx = this.outgoingConnectQueue.indexOf(endpointId);
        if (qIdx !== -1) {
          this.outgoingConnectQueue.splice(qIdx, 1);
        }
        this.processOutgoingConnectQueue();

        const existingTransport = this.activeTransports.get(endpointId);
        if (existingTransport) {
          existingTransport.close(reason || 'Remote radio closed');
          this.activeTransports.delete(endpointId);
        }

        this.nodes = this.nodes.map((n) => {
          if (n.endpointId !== endpointId) return n;
          this.onToast?.(`${n.endpointName} disconnected: ${reason || 'Remote radio closed'}`);
          return {
            ...n,
            status: 'DISCONNECTED',
            connectionError: reason || 'Disconnected',
          };
        });
        this.syncNodeStatesWithRelayEngine();
        this.notify();
      },
    };

    if (typeof this.bridge.addEndpointListener === 'function') {
      this.bridgeUnsubscribe = this.bridge.addEndpointListener(callbacks);
    } else {
      this.bridge.onEndpointFound = callbacks.onEndpointFound;
      this.bridge.onEndpointLost = callbacks.onEndpointLost;
      this.bridge.onConnectionInitiated = callbacks.onConnectionInitiated;
      this.bridge.onConnectionResult = callbacks.onConnectionResult;
      this.bridge.onDisconnected = callbacks.onDisconnected;
      this.bridgeUnsubscribe = () => {
        if (this.bridge) {
          this.bridge.onEndpointFound = undefined;
          this.bridge.onEndpointLost = undefined;
          this.bridge.onConnectionInitiated = undefined;
          this.bridge.onConnectionResult = undefined;
          this.bridge.onDisconnected = undefined;
        }
      };
    }
  }

  private detachBridgeListeners(): void {
    if (this.bridgeUnsubscribe) {
      this.bridgeUnsubscribe();
      this.bridgeUnsubscribe = undefined;
    }
  }

  // ─── 3. ACTIONS ───────────────────────────────────────────────────────────

  public async startScan(): Promise<boolean> {
    if (this.isScanning || this.isStarting) return false;
    this.isStarting = true;
    this.errorMessage = null;
    this.notify();

    const pre = await this.checkPrerequisites();
    if (!pre.ready) {
      this.isStarting = false;
      this.onToast?.(this.errorMessage || 'Cannot start Nearby scan: prerequisites not met');
      this.notify();
      return false;
    }

    if (!this.bridge) {
      this.isStarting = false;
      this.notify();
      return false;
    }

    // 1. Initiate Advertising
    let advSuccess = false;
    let advError: string | null = null;
    try {
      advSuccess = (await this.bridge.startAdvertising(this.localDeviceId, this.serviceId)) === true;
      if (!advSuccess) {
        advError =
          (this.bridge as any).lastAdvertisingError ||
          (typeof (this.bridge as any).getLastError === 'function' ? (this.bridge as any).getLastError() : null) ||
          (this.bridge as any).lastError ||
          null;
      }
    } catch (err: any) {
      advSuccess = false;
      advError = err?.message || String(err);
    }
    this.advertising = advSuccess;

    // 2. Initiate Discovery
    let discSuccess = false;
    let discError: string | null = null;
    try {
      discSuccess = (await this.bridge.startDiscovery(this.serviceId)) === true;
      if (!discSuccess) {
        discError =
          (this.bridge as any).lastDiscoveryError ||
          (typeof (this.bridge as any).getLastError === 'function' ? (this.bridge as any).getLastError() : null) ||
          (this.bridge as any).lastError ||
          null;
      }
    } catch (err: any) {
      discSuccess = false;
      discError = err?.message || String(err);
    }
    this.discovery = discSuccess;

    // 3. Evaluate State Consistency

    // Condition A: Both operations failed
    if (!advSuccess && !discSuccess) {
      this.isScanning = false;
      this.isStarting = false;

      const failureParts: string[] = [];
      if (advError) failureParts.push(`Advertising failed: ${advError}`);
      else failureParts.push('Advertising failed');

      if (discError) failureParts.push(`Discovery failed: ${discError}`);
      else failureParts.push('Discovery failed');

      this.errorMessage = `Failed to start Nearby radio: ${failureParts.join('; ')}`;
      this.onToast?.(this.errorMessage);
      this.notify();
      return false;
    }

    // Condition B: Both operations succeeded
    if (advSuccess && discSuccess) {
      this.isScanning = true;
      this.isStarting = false;
      this.errorMessage = null;
      this.onToast?.('Nearby scanning started (Broadcasting & Discovering)');
      this.notify();
      return true;
    }

    // Condition C: Partial Success (one succeeded, one failed)
    this.isScanning = true;
    this.isStarting = false;

    if (advSuccess && !discSuccess) {
      const detail = discError ? `Discovery failed: ${discError}` : 'Discovery failed';
      this.errorMessage = `Nearby partially active (Broadcasting only): ${detail}`;
      this.onToast?.(this.errorMessage);
    } else {
      // !advSuccess && discSuccess
      const detail = advError ? `Advertising failed: ${advError}` : 'Advertising failed';
      this.errorMessage = `Nearby partially active (Discovering only): ${detail}`;
      this.onToast?.(this.errorMessage);
    }

    this.notify();
    return true;
  }

  public async stopScan(): Promise<void> {
    if (!this.isScanning || this.isStopping) return;
    this.isStopping = true;
    this.notify();

    if (this.bridge) {
      try {
        await this.bridge.stopDiscovery();
      } catch (_) {}
      try {
        await this.bridge.stopAdvertising();
      } catch (_) {}
    }

    this.discovery = false;
    this.advertising = false;
    this.isScanning = false;
    this.isStopping = false;
    this.onToast?.('Nearby scanning stopped');
    this.notify();
  }

  public async connect(endpointId: string): Promise<void> {
    if (!this.bridge) return;

    const target = this.nodes.find((n) => n.endpointId === endpointId);
    if (target && (target.status === 'CONNECTING' || target.status === 'CONNECTED')) {
      console.log(
        `[NearbyMeshController] Skipping redundant connect to ${endpointId} (current status: ${target.status})`
      );
      return;
    }

    if (this.pendingConnections.has(endpointId)) {
      console.log(`[NearbyMeshController] Connection already pending for ${endpointId}`);
      return;
    }

    this.pendingConnections.add(endpointId);
    this.nodes = this.nodes.map((n) =>
      n.endpointId === endpointId
        ? { ...n, status: 'CONNECTING', connectionError: undefined }
        : n
    );
    this.setConnectionTimeout(endpointId);
    this.notify();

    try {
      await this.bridge.connect(endpointId, this.localDeviceId);
    } catch (err: any) {
      this.pendingConnections.delete(endpointId);
      this.clearConnectionTimeout(endpointId);
      this.nodes = this.nodes.map((n) =>
        n.endpointId === endpointId
          ? { ...n, status: 'DISCONNECTED', connectionError: err?.message || 'Connection request failed' }
          : n
      );
      this.onToast?.(`Failed to initiate connection: ${err?.message}`);
      this.notify();
      this.isOutgoingHandshakeInProgress = false;
      this.processOutgoingConnectQueue();
    }
  }

  public async disconnect(endpointId: string): Promise<void> {
    this.pendingConnections.delete(endpointId);
    this.clearConnectionTimeout(endpointId);
    const qIdx = this.outgoingConnectQueue.indexOf(endpointId);
    if (qIdx !== -1) {
      this.outgoingConnectQueue.splice(qIdx, 1);
    }
    this.processOutgoingConnectQueue();

    const transport = this.activeTransports.get(endpointId);
    if (transport) {
      transport.close('User disconnected');
      this.activeTransports.delete(endpointId);
    }

    if (this.bridge) {
      try {
        await this.bridge.disconnect(endpointId);
      } catch (_) {}
    }

    this.nodes = this.nodes.map((n) =>
      n.endpointId === endpointId
        ? { ...n, status: 'DISCONNECTED' }
        : n
    );
    this.syncNodeStatesWithRelayEngine();
    this.notify();
  }

  public async requestPermissions(): Promise<boolean> {
    if (!this.bridge) return false;

    try {
      if (typeof (this.bridge as any).requestPermissions === 'function') {
        await (this.bridge as any).requestPermissions();
      } else {
        await this.bridge.startAdvertising(this.localDeviceId, this.serviceId);
      }
      const check = await this.checkPrerequisites();
      return check.ready;
    } catch (err: any) {
      this.onToast?.(`Permission request failed: ${err?.message}`);
      return false;
    }
  }

  public destroy(): void {
    if (this.relayEngineUnsubscribe) {
      this.relayEngineUnsubscribe();
      this.relayEngineUnsubscribe = undefined;
    }
    this.clearAllConnectionTimeouts();
    this.pendingConnections.clear();
    this.outgoingConnectQueue = [];
    this.isOutgoingHandshakeInProgress = false;

    for (const transport of Array.from(this.activeTransports.values())) {
      try {
        transport.close('NearbyMeshController destroyed');
      } catch (_) {}
    }
    this.activeTransports.clear();
    this.transportReadyHandlers = [];

    this.detachBridgeListeners();
    this.listeners.clear();
    if (this.bridge && this.isScanning) {
      this.bridge.stopDiscovery().catch(() => {});
      this.bridge.stopAdvertising().catch(() => {});
    }
  }
}
