/**
 * NEXUS — Offline-First Emergency & Community Network
 * Capacitor Native Mesh Bridge Adapter (Phase 6 — Step 5A Foundation)
 * 
 * Binds the TypeScript INativeMeshBridge contract to the Android-side
 * NexusNativePlugin via @capacitor/core.
 * 
 * Safety:
 * In this Step 5A foundation scaffold, isAvailable() returns false,
 * correctly reflecting that the native mobile shell is loaded but
 * the radio hardware transport (Nearby Connections / Wi-Fi Direct)
 * is pending implementation in Step 5B.
 */

import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import type {
  INativeMeshBridge,
  NativePeerEndpoint,
  NativeConnectionStatus,
  NativeBridgeStatus,
  EndpointListenerCallbacks,
} from './nativeBridge';

export interface NexusNativePluginInterface {
  isAvailable(): Promise<{ available: boolean; status?: string; platform?: string; missingPermissions?: string; googlePlayServicesCode?: number }>;
  requestPermissions?(): Promise<any>;
  startAdvertising(options: { deviceName: string; serviceId: string }): Promise<void>;
  stopAdvertising(): Promise<void>;
  startDiscovery(options: { serviceId: string }): Promise<void>;
  stopDiscovery(): Promise<void>;
  connect(options: { endpointId: string; deviceName?: string }): Promise<void>;
  sendPayload(options: { endpointId: string; payload: string }): Promise<void>;
  disconnect(options: { endpointId: string }): Promise<void>;
  disconnectAll(): Promise<void>;
  addListener(
    eventName: 'endpointFound',
    listenerFunc: (endpoint: NativePeerEndpoint) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'endpointLost',
    listenerFunc: (data: { endpointId: string }) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'connectionInitiated',
    listenerFunc: (endpoint: NativePeerEndpoint) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'connectionResult',
    listenerFunc: (data: {
      endpointId: string;
      status: NativeConnectionStatus;
      message?: string;
      statusCode?: number;
      statusDescription?: string;
    }) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'payloadReceived',
    listenerFunc: (data: { endpointId: string; payload: string }) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'disconnected',
    listenerFunc: (data: { endpointId: string; reason?: string }) => void
  ): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}

export class CapacitorNativeMeshBridge implements INativeMeshBridge {
  private plugin: NexusNativePluginInterface;
  private isAvailableCache = false;
  private listenersAttached = false;
  private listenerHandles: PluginListenerHandle[] = [];
  private customListeners: EndpointListenerCallbacks[] = [];

  public onEndpointFound?: (endpoint: NativePeerEndpoint) => void;
  public onEndpointLost?: (endpointId: string) => void;
  public onConnectionInitiated?: (endpoint: NativePeerEndpoint) => void;
  public onConnectionResult?: (
    endpointId: string,
    status: NativeConnectionStatus,
    message?: string,
    statusCode?: number,
    statusDescription?: string
  ) => void;
  public onPayloadReceived?: (endpointId: string, payload: string) => void;
  public onDisconnected?: (endpointId: string, reason?: string) => void;

  constructor(plugin?: NexusNativePluginInterface) {
    this.plugin = plugin || registerPlugin<NexusNativePluginInterface>('NexusNative');
    this.initListeners();
  }

  public isAvailable(): boolean {
    return this.isAvailableCache;
  }

  /**
   * Probes the native Android plugin for radio capability.
   * In Step 5A foundation scaffold, resolves to false.
   */
  public async probeAvailability(): Promise<boolean> {
    try {
      const res = await this.plugin.isAvailable();
      this.isAvailableCache = res.available === true;
      return this.isAvailableCache;
    } catch {
      this.isAvailableCache = false;
      return false;
    }
  }

  /**
   * Performs an asynchronous diagnostic status check including runtime permissions and radio state.
   */
  public async checkStatus(): Promise<NativeBridgeStatus> {
    try {
      const res = await this.plugin.isAvailable();
      this.isAvailableCache = res.available === true;
      return res;
    } catch {
      this.isAvailableCache = false;
      return { available: false, status: 'plugin_error', platform: 'android' };
    }
  }

  /**
   * Requests runtime permissions for Nearby Connections if supported by the plugin.
   */
  public async requestPermissions(): Promise<boolean> {
    try {
      if (typeof this.plugin.requestPermissions === 'function') {
        await this.plugin.requestPermissions();
        return await this.probeAvailability();
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Registers a multi-subscriber listener for native endpoint events.
   * Returns an unsubscribe callback.
   */
  public addEndpointListener(callbacks: EndpointListenerCallbacks): () => void {
    this.customListeners.push(callbacks);
    return () => {
      const idx = this.customListeners.indexOf(callbacks);
      if (idx !== -1) {
        this.customListeners.splice(idx, 1);
      }
    };
  }

  public lastError: string | null = null;
  public lastAdvertisingError: string | null = null;
  public lastDiscoveryError: string | null = null;

  public getLastError(): string | null {
    return this.lastError;
  }

  public async startAdvertising(deviceName: string, serviceId: string): Promise<boolean> {
    this.lastAdvertisingError = null;
    this.lastError = null;

    if (!this.isAvailable()) {
      return false;
    }
    try {
      await this.plugin.startAdvertising({ deviceName, serviceId });
      return true;
    } catch (err: any) {
      const msg = err?.message || (typeof err === 'string' ? err : JSON.stringify(err));
      this.lastAdvertisingError = msg;
      this.lastError = msg;
      console.error(`[CapacitorNativeMeshBridge] startAdvertising failed: ${msg}`);
      return false;
    }
  }

  public async stopAdvertising(): Promise<void> {
    try {
      await this.plugin.stopAdvertising();
    } catch {
      // Safe no-op
    }
  }

  public async startDiscovery(serviceId: string): Promise<boolean> {
    this.lastDiscoveryError = null;
    this.lastError = null;

    if (!this.isAvailable()) {
      return false;
    }
    try {
      await this.plugin.startDiscovery({ serviceId });
      return true;
    } catch (err: any) {
      const msg = err?.message || (typeof err === 'string' ? err : JSON.stringify(err));
      this.lastDiscoveryError = msg;
      this.lastError = msg;
      console.error(`[CapacitorNativeMeshBridge] startDiscovery failed: ${msg}`);
      return false;
    }
  }

  public async stopDiscovery(): Promise<void> {
    try {
      await this.plugin.stopDiscovery();
    } catch {
      // Safe no-op
    }
  }

  public async connect(endpointId: string, deviceName?: string): Promise<void> {
    await this.plugin.connect({ endpointId, deviceName });
  }

  public async sendPayload(endpointId: string, payload: string): Promise<void> {
    if (!this.isAvailable()) {
      throw new Error('[CapacitorNativeMeshBridge] Native radio hardware not available in Step 5A scaffold');
    }
    await this.plugin.sendPayload({ endpointId, payload });
  }

  public async disconnect(endpointId: string): Promise<void> {
    try {
      await this.plugin.disconnect({ endpointId });
    } catch {
      // Safe no-op
    }
  }

  public async disconnectAll(): Promise<void> {
    try {
      await this.plugin.disconnectAll();
    } catch {
      // Safe no-op
    }
  }

  public async removeAllListeners(): Promise<void> {
    for (const handle of this.listenerHandles) {
      try {
        await handle.remove();
      } catch {
        // Safe no-op
      }
    }
    this.listenerHandles = [];
    this.listenersAttached = false;
  }

  private initListeners(): void {
    if (this.listenersAttached) return;
    this.listenersAttached = true;

    try {
      const p1 = this.plugin.addListener('endpointFound', (ep) => {
        this.onEndpointFound?.(ep);
        for (const l of this.customListeners) {
          l.onEndpointFound?.(ep);
        }
      });
      const p2 = this.plugin.addListener('endpointLost', (data) => {
        const id = typeof data === 'string' ? data : data?.endpointId;
        this.onEndpointLost?.(id);
        for (const l of this.customListeners) {
          l.onEndpointLost?.(id);
        }
      });
      const p3 = this.plugin.addListener('connectionInitiated', (ep) => {
        this.onConnectionInitiated?.(ep);
        for (const l of this.customListeners) {
          l.onConnectionInitiated?.(ep);
        }
      });
      const p4 = this.plugin.addListener('connectionResult', (data) => {
        this.onConnectionResult?.(data.endpointId, data.status, data.message, data.statusCode, data.statusDescription);
        for (const l of this.customListeners) {
          l.onConnectionResult?.(data.endpointId, data.status, data.message, data.statusCode, data.statusDescription);
        }
      });
      const p5 = this.plugin.addListener('payloadReceived', (data) => {
        this.onPayloadReceived?.(data.endpointId, data.payload);
        for (const l of this.customListeners) {
          l.onPayloadReceived?.(data.endpointId, data.payload);
        }
      });
      const p6 = this.plugin.addListener('disconnected', (data) => {
        this.onDisconnected?.(data.endpointId, data.reason);
        for (const l of this.customListeners) {
          l.onDisconnected?.(data.endpointId, data.reason);
        }
      });

      Promise.all([p1, p2, p3, p4, p5, p6])
        .then((handles) => {
          this.listenerHandles.push(...handles);
        })
        .catch(() => {});
    } catch {
      // Expected in web/mock environments where native listener bridge is unattached
    }
  }
}
