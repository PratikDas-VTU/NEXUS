/**
 * NEXUS — Offline-First Emergency & Community Network
 * Multi-Transport Connection Manager (Phase 4 & Phase 5)
 * 
 * Manages multiple simultaneous communication paths to the same peer:
 * - Tracks active transports per remote peer (WebRTC, WebSocket, future BLE/Wi-Fi Direct)
 * - Tracks transport health (consecutive send failures/successes, timestamps, latencies)
 * - Selects the preferred OPEN + HEALTHY transport based on deterministic priority
 * - Automatically retries send over alternate healthy transport if preferred fails (no packet flooding)
 * - Emits a unified ManagedPeerTransport (NexusTransport) for RelayEngine
 * - Allows multiple paths to coexist without premature shutdown
 */

import type { NexusTransport, TransportType } from '../shared/interfaces.ts';
import type { RelayMessage } from '../shared/protocol.ts';

export type KnownTransportType =
  | 'webrtc'
  | 'websocket'
  | 'ble'
  | 'wifi-direct'
  | 'wifi-aware'
  | 'nearby';

export const DEFAULT_TRANSPORT_PRIORITIES: Record<KnownTransportType, number> = {
  'webrtc': 100,
  'wifi-direct': 80,
  'wifi-aware': 70,
  'nearby': 60,
  'websocket': 50,
  'ble': 30,
};

export const MAX_CONSECUTIVE_FAILURES = 3;

export interface TransportHealth {
  transportType: TransportType;
  isOpen: boolean;
  isHealthy: boolean;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  lastSuccessAt?: number;
  lastFailureAt?: number;
  lastFailureReason?: string;
  lastSendDurationMs?: number;
}

export interface MultiTransportManagerOptions {
  priorities?: Partial<Record<string, number>>;
  getPriority?: (transport: NexusTransport) => number;
  maxConsecutiveFailures?: number;
  onLog?: (level: 'info' | 'warn' | 'error', message: string) => void;
  onPreferredTransportChange?: (remotePeerId: string, preferred?: NexusTransport) => void;
  onHealthChange?: (remotePeerId: string, transportType: TransportType, health: TransportHealth) => void;
}

export class ManagedPeerTransport implements NexusTransport {
  constructor(
    private manager: MultiTransportManager,
    public readonly remotePeerId: string
  ) {}

  public get transportType(): TransportType {
    const preferred = this.manager.getPreferredTransport(this.remotePeerId);
    return preferred ? preferred.transportType : 'webrtc';
  }

  public isOpen(): boolean {
    const preferred = this.manager.getPreferredTransport(this.remotePeerId);
    return preferred !== undefined && preferred.isOpen();
  }

  public async send(message: RelayMessage): Promise<void> {
    return this.manager.send(this.remotePeerId, message);
  }

  public onMessage(handler: (message: RelayMessage) => void): void {
    this.manager.registerPeerMessageHandler(this.remotePeerId, handler);
  }

  public onClose(handler: (reason?: string) => void): void {
    this.manager.registerPeerCloseHandler(this.remotePeerId, handler);
  }

  public close(): void {
    this.manager.removeTransport(this.remotePeerId);
  }
}

export class MultiTransportManager {
  // peerId -> Map<TransportType, NexusTransport>
  private peerTransports = new Map<string, Map<TransportType, NexusTransport>>();
  // peerId -> Map<TransportType, TransportHealth>
  private peerTransportHealth = new Map<string, Map<TransportType, TransportHealth>>();
  // peerId -> ManagedPeerTransport
  private managedPeerTransports = new Map<string, ManagedPeerTransport>();
  // peerId -> Set<messageHandler>
  private messageHandlers = new Map<string, Set<(message: RelayMessage) => void>>();
  // peerId -> Set<closeHandler>
  private closeHandlers = new Map<string, Set<(reason?: string) => void>>();

  private priorities: Record<string, number>;
  private maxConsecutiveFailures: number;
  private customGetPriority?: (transport: NexusTransport) => number;
  private onLog?: (level: 'info' | 'warn' | 'error', message: string) => void;
  private onPreferredTransportChange?: (remotePeerId: string, preferred?: NexusTransport) => void;
  private onHealthChange?: (remotePeerId: string, transportType: TransportType, health: TransportHealth) => void;

  constructor(options?: MultiTransportManagerOptions) {
    this.priorities = {
      ...DEFAULT_TRANSPORT_PRIORITIES,
      ...(options?.priorities || {}),
    };
    this.maxConsecutiveFailures = options?.maxConsecutiveFailures ?? MAX_CONSECUTIVE_FAILURES;
    this.customGetPriority = options?.getPriority;
    this.onLog = options?.onLog;
    this.onPreferredTransportChange = options?.onPreferredTransportChange;
    this.onHealthChange = options?.onHealthChange;
  }

  public getPriority(transport: NexusTransport): number {
    if (this.customGetPriority) {
      return this.customGetPriority(transport);
    }
    if ((transport as any).priority !== undefined && typeof (transport as any).priority === 'number') {
      return (transport as any).priority;
    }
    return this.priorities[transport.transportType] ?? 10;
  }

  /**
   * Registers a transport for a remote peer.
   * Multiple transports of different types can be registered simultaneously.
   * Initializes or resets health tracking for the connection.
   */
  public registerTransport(transport: NexusTransport): void {
    const peerId = transport.remotePeerId;
    let transportMap = this.peerTransports.get(peerId);
    if (!transportMap) {
      transportMap = new Map<TransportType, NexusTransport>();
      this.peerTransports.set(peerId, transportMap);
    }

    const previousPreferred = this.getPreferredTransport(peerId);
    transportMap.set(transport.transportType, transport);

    // Initialize or reset health state for this transport
    let healthMap = this.peerTransportHealth.get(peerId);
    if (!healthMap) {
      healthMap = new Map<TransportType, TransportHealth>();
      this.peerTransportHealth.set(peerId, healthMap);
    }

    const health: TransportHealth = {
      transportType: transport.transportType,
      isOpen: transport.isOpen(),
      isHealthy: true,
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
    };
    healthMap.set(transport.transportType, health);

    // Forward incoming messages to registered handlers for this peer
    transport.onMessage((msg: RelayMessage) => {
      this.handleIncomingMessage(peerId, msg);
    });

    // Handle closure of this specific transport
    transport.onClose((reason?: string) => {
      this.handleTransportClosed(peerId, transport.transportType, reason);
    });

    const newPreferred = this.getPreferredTransport(peerId);
    if (newPreferred?.transportType !== previousPreferred?.transportType) {
      this.onPreferredTransportChange?.(peerId, newPreferred);
    }

    this.log('info', `Registered ${transport.transportType} transport for peer ${peerId}. Open: ${transport.isOpen()}`);
  }

  /**
   * Removes transport(s) for a peer.
   * If transportType is provided, removes only that transport.
   * If transportType is omitted, removes all transports for that peer.
   */
  public removeTransport(remotePeerId: string, transportType?: TransportType): void {
    const transportMap = this.peerTransports.get(remotePeerId);
    const healthMap = this.peerTransportHealth.get(remotePeerId);
    if (!transportMap) return;

    if (transportType) {
      const transport = transportMap.get(transportType);
      if (transport) {
        try {
          transport.close();
        } catch (_) {}
        transportMap.delete(transportType);
      }
      if (healthMap) {
        healthMap.delete(transportType);
      }
    } else {
      for (const transport of transportMap.values()) {
        try {
          transport.close();
        } catch (_) {}
      }
      transportMap.clear();
      if (healthMap) {
        healthMap.clear();
      }
    }

    if (transportMap.size === 0) {
      this.peerTransports.delete(remotePeerId);
      this.peerTransportHealth.delete(remotePeerId);
      this.notifyPeerClosed(remotePeerId, 'All transports removed');
    } else {
      // Check if preferred transport changed
      const preferred = this.getPreferredTransport(remotePeerId);
      this.onPreferredTransportChange?.(remotePeerId, preferred);
    }
  }

  /**
   * Returns all transports registered for a peer.
   */
  public getTransports(remotePeerId: string): NexusTransport[] {
    const transportMap = this.peerTransports.get(remotePeerId);
    if (!transportMap) return [];
    return Array.from(transportMap.values());
  }

  /**
   * Returns the health record for a specific transport of a peer.
   */
  public getHealth(remotePeerId: string, transportType: TransportType): TransportHealth | undefined {
    const healthMap = this.peerTransportHealth.get(remotePeerId);
    return healthMap ? healthMap.get(transportType) : undefined;
  }

  /**
   * Returns health records for all registered transports of a peer.
   */
  public getAllHealth(remotePeerId: string): Record<string, TransportHealth> {
    const healthMap = this.peerTransportHealth.get(remotePeerId);
    if (!healthMap) return {};
    const result: Record<string, TransportHealth> = {};
    for (const [type, health] of healthMap) {
      result[type] = { ...health };
    }
    return result;
  }

  /**
   * Checks whether a specific transport is considered healthy.
   */
  public isHealthy(remotePeerId: string, transportType: TransportType): boolean {
    const health = this.getHealth(remotePeerId, transportType);
    if (!health) return true; // Default to healthy if not yet recorded
    return health.isHealthy;
  }

  /**
   * Records a successful send on a transport.
   * Clears consecutive failures and marks the transport as healthy.
   */
  public recordSendSuccess(remotePeerId: string, transportType: TransportType, durationMs?: number): void {
    let healthMap = this.peerTransportHealth.get(remotePeerId);
    if (!healthMap) {
      healthMap = new Map<TransportType, TransportHealth>();
      this.peerTransportHealth.set(remotePeerId, healthMap);
    }

    let health = healthMap.get(transportType);
    if (!health) {
      health = {
        transportType,
        isOpen: true,
        isHealthy: true,
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
      };
      healthMap.set(transportType, health);
    }

    const wasUnhealthy = !health.isHealthy;
    health.consecutiveFailures = 0;
    health.consecutiveSuccesses++;
    health.isHealthy = true;
    health.lastSuccessAt = Date.now();
    if (durationMs !== undefined) {
      health.lastSendDurationMs = durationMs;
    }

    this.onHealthChange?.(remotePeerId, transportType, { ...health });

    if (wasUnhealthy) {
      this.log('info', `Transport ${transportType} for ${remotePeerId} recovered and is now HEALTHY.`);
      const newPreferred = this.getPreferredTransport(remotePeerId);
      this.onPreferredTransportChange?.(remotePeerId, newPreferred);
    }
  }

  /**
   * Records a failed send attempt on a transport.
   * Increments consecutive failures and marks the transport unhealthy
   * if the failure threshold is met.
   */
  public recordSendFailure(remotePeerId: string, transportType: TransportType, error: any): void {
    let healthMap = this.peerTransportHealth.get(remotePeerId);
    if (!healthMap) {
      healthMap = new Map<TransportType, TransportHealth>();
      this.peerTransportHealth.set(remotePeerId, healthMap);
    }

    let health = healthMap.get(transportType);
    if (!health) {
      health = {
        transportType,
        isOpen: true,
        isHealthy: true,
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
      };
      healthMap.set(transportType, health);
    }

    health.consecutiveFailures++;
    health.consecutiveSuccesses = 0;
    health.lastFailureAt = Date.now();
    health.lastFailureReason = error?.message || String(error);

    const previouslyHealthy = health.isHealthy;
    if (health.consecutiveFailures >= this.maxConsecutiveFailures) {
      health.isHealthy = false;
    }

    this.onHealthChange?.(remotePeerId, transportType, { ...health });

    if (previouslyHealthy && !health.isHealthy) {
      this.log('warn', `Transport ${transportType} for ${remotePeerId} marked UNHEALTHY (${health.consecutiveFailures} consecutive failures).`);
      const newPreferred = this.getPreferredTransport(remotePeerId);
      this.onPreferredTransportChange?.(remotePeerId, newPreferred);
    }
  }

  /**
   * Resets health state for transport(s) of a peer, marking them healthy again.
   */
  public resetHealth(remotePeerId: string, transportType?: TransportType): void {
    const healthMap = this.peerTransportHealth.get(remotePeerId);
    if (!healthMap) return;

    if (transportType) {
      const health = healthMap.get(transportType);
      if (health) {
        health.consecutiveFailures = 0;
        health.isHealthy = true;
        this.onHealthChange?.(remotePeerId, transportType, { ...health });
      }
    } else {
      for (const [type, health] of healthMap) {
        health.consecutiveFailures = 0;
        health.isHealthy = true;
        this.onHealthChange?.(remotePeerId, type, { ...health });
      }
    }

    const preferred = this.getPreferredTransport(remotePeerId);
    this.onPreferredTransportChange?.(remotePeerId, preferred);
  }

  /**
   * Explicitly marks a transport healthy (recovery hook).
   */
  public markTransportHealthy(remotePeerId: string, transportType: TransportType): void {
    this.resetHealth(remotePeerId, transportType);
  }

  /**
   * Returns the preferred OPEN and HEALTHY transport for a peer based on priority.
   * Deterministic tie-breaking if priorities are identical.
   * If all open transports are unhealthy, returns undefined to signal health exhaustion.
   */
  public getPreferredTransport(remotePeerId: string): NexusTransport | undefined {
    const transports = this.getTransports(remotePeerId);
    // 1. Must be open
    const openTransports = transports.filter((t) => t.isOpen());
    if (openTransports.length === 0) return undefined;

    // 2. Filter for healthy transports
    const healthyTransports = openTransports.filter((t) => this.isHealthy(remotePeerId, t.transportType));
    if (healthyTransports.length === 0) return undefined;

    // 3. Sort by priority descending with deterministic tie-breaker
    healthyTransports.sort((a, b) => {
      const priorityDiff = this.getPriority(b) - this.getPriority(a);
      if (priorityDiff !== 0) return priorityDiff;
      return a.transportType.localeCompare(b.transportType);
    });

    return healthyTransports[0];
  }

  /**
   * Checks whether a transport of the specified type exists for the peer.
   */
  public hasTransport(remotePeerId: string, transportType: TransportType): boolean {
    const transportMap = this.peerTransports.get(remotePeerId);
    return transportMap ? transportMap.has(transportType) : false;
  }

  /**
   * Returns available transport types for a peer, optionally filtering for open only.
   */
  public getAvailableTransportTypes(remotePeerId: string, openOnly = false): TransportType[] {
    const transports = this.getTransports(remotePeerId);
    const filtered = openOnly ? transports.filter((t) => t.isOpen()) : transports;
    return filtered.map((t) => t.transportType);
  }

  /**
   * Returns or creates a unified ManagedPeerTransport (NexusTransport) for RelayEngine.
   */
  public getPeerTransport(remotePeerId: string): NexusTransport {
    let managed = this.managedPeerTransports.get(remotePeerId);
    if (!managed) {
      managed = new ManagedPeerTransport(this, remotePeerId);
      this.managedPeerTransports.set(remotePeerId, managed);
    }
    return managed;
  }

  /**
   * Sends a message to a peer over the SINGLE preferred open, healthy transport.
   * 
   * Automatic Fallback & Path Switching (Phase 5):
   * If sending through the preferred transport fails, records the failure and
   * retries the SAME message through the next preferred healthy transport.
   * 
   * Strict Safety:
   * Does NOT send through multiple healthy transports simultaneously (no packet flooding).
   * Only retries after the primary send attempt fails.
   */
  public async send(remotePeerId: string, message: RelayMessage): Promise<void> {
    const preferred = this.getPreferredTransport(remotePeerId);
    if (!preferred || !preferred.isOpen()) {
      throw new Error(`[MultiTransportManager] No open healthy transport available for peer ${remotePeerId}`);
    }

    const startTime = Date.now();
    try {
      await preferred.send(message);
      this.recordSendSuccess(remotePeerId, preferred.transportType, Date.now() - startTime);
      return;
    } catch (primaryError: any) {
      this.recordSendFailure(remotePeerId, preferred.transportType, primaryError);
      this.log(
        'warn',
        `Send failed on preferred ${preferred.transportType} for ${remotePeerId}: ${primaryError?.message}. Evaluating fallback retry.`
      );

      // Automatic Fallback Retry: Find another healthy open transport
      const fallbackCandidates = this.getTransports(remotePeerId)
        .filter(
          (t) =>
            t.transportType !== preferred.transportType &&
            t.isOpen() &&
            this.isHealthy(remotePeerId, t.transportType)
        )
        .sort((a, b) => {
          const priorityDiff = this.getPriority(b) - this.getPriority(a);
          if (priorityDiff !== 0) return priorityDiff;
          return a.transportType.localeCompare(b.transportType);
        });

      if (fallbackCandidates.length > 0) {
        const fallbackTransport = fallbackCandidates[0];
        this.log(
          'info',
          `Retrying send to ${remotePeerId} via fallback transport: ${fallbackTransport.transportType}`
        );

        const fallbackStartTime = Date.now();
        try {
          await fallbackTransport.send(message);
          this.recordSendSuccess(remotePeerId, fallbackTransport.transportType, Date.now() - fallbackStartTime);
          return;
        } catch (fallbackError: any) {
          this.recordSendFailure(remotePeerId, fallbackTransport.transportType, fallbackError);
          throw fallbackError;
        }
      }

      // No fallback transport available; re-throw primary error
      throw primaryError;
    }
  }

  public registerPeerMessageHandler(remotePeerId: string, handler: (message: RelayMessage) => void): void {
    let handlers = this.messageHandlers.get(remotePeerId);
    if (!handlers) {
      handlers = new Set();
      this.messageHandlers.set(remotePeerId, handlers);
    }
    handlers.add(handler);
  }

  public registerPeerCloseHandler(remotePeerId: string, handler: (reason?: string) => void): void {
    let handlers = this.closeHandlers.get(remotePeerId);
    if (!handlers) {
      handlers = new Set();
      this.closeHandlers.set(remotePeerId, handlers);
    }
    handlers.add(handler);
  }

  private handleIncomingMessage(remotePeerId: string, message: RelayMessage): void {
    const handlers = this.messageHandlers.get(remotePeerId);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(message);
        } catch (err) {
          console.error(`[MultiTransportManager] Error in message handler for peer ${remotePeerId}:`, err);
        }
      }
    }
  }

  private handleTransportClosed(remotePeerId: string, transportType: TransportType, reason?: string): void {
    this.log('info', `Transport ${transportType} closed for peer ${remotePeerId}: ${reason || 'normal'}`);

    const healthMap = this.peerTransportHealth.get(remotePeerId);
    if (healthMap) {
      const health = healthMap.get(transportType);
      if (health) {
        health.isOpen = false;
      }
    }
    
    // Check if any open transports remain for this peer
    const remainingOpen = this.getPreferredTransport(remotePeerId);
    if (!remainingOpen) {
      // If all open transports are gone, check if ANY transports remain registered
      const transports = this.getTransports(remotePeerId);
      const anyOpen = transports.some((t) => t.isOpen());
      if (!anyOpen) {
        this.notifyPeerClosed(remotePeerId, reason || 'All transports closed');
      }
    } else {
      this.onPreferredTransportChange?.(remotePeerId, remainingOpen);
    }
  }

  private notifyPeerClosed(remotePeerId: string, reason?: string): void {
    const handlers = this.closeHandlers.get(remotePeerId);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(reason);
        } catch (err) {
          console.error(`[MultiTransportManager] Error in close handler for peer ${remotePeerId}:`, err);
        }
      }
    }
    this.messageHandlers.delete(remotePeerId);
    this.closeHandlers.delete(remotePeerId);
    this.managedPeerTransports.delete(remotePeerId);
    this.peerTransportHealth.delete(remotePeerId);
  }

  public getAllPeerIds(): string[] {
    return Array.from(this.peerTransports.keys());
  }

  public getAllTransports(): NexusTransport[] {
    const result: NexusTransport[] = [];
    for (const transportMap of this.peerTransports.values()) {
      result.push(...transportMap.values());
    }
    return result;
  }

  public closeAll(): void {
    for (const peerId of Array.from(this.peerTransports.keys())) {
      this.removeTransport(peerId);
    }
    this.peerTransports.clear();
    this.peerTransportHealth.clear();
    this.managedPeerTransports.clear();
    this.messageHandlers.clear();
    this.closeHandlers.clear();
  }

  private log(level: 'info' | 'warn' | 'error', message: string): void {
    if (this.onLog) {
      this.onLog(level, message);
    }
  }
}
