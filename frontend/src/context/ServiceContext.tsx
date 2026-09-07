import React, { createContext, useContext, useEffect, useState, useMemo, useCallback, useRef } from 'react';
import type { IFrontendIncidentService, INetworkRelayService, RelayNetworkStatus } from '../../../shared/interfaces';
import type { Incident, DraftIncident, IncidentStatus } from '../../../shared/types';
import { FrontendIncidentService } from '../../../backend/data/incidentService';
import { OfflineStorageAdapter } from '../../../backend/data/adapter';
import { NexusDatabase } from '../../../backend/data/db';
import { getDeviceId, getSynchronousDeviceId } from '../../../backend/data/deviceId';
import { RelayEngine } from '../../../networking/relayEngine';
import { incidentToViewModel } from '../services/incidentMapper';
import type { IncidentItem } from '../types';
import { NearbyMeshController } from '../services/nearbyMeshController';

import { NetworkCoordinator, NetworkDiagnostics } from '../services/networkCoordinator';
import { getSignalingUrl } from '../services/api/config';
import {
  GeolocationCoordinates,
  LocationState,
  GeolocationResult,
  getCurrentPosition,
  watchUserPosition,
  getCachedPosition,
  createManualCoordinates,
} from '../services/api/geolocation';
import {
  DevicePermissionsStatus,
  queryAllPermissionsStatus,
  requestNotificationPermission,
  requestStoragePersistence,
  requestScreenWakeLock,
  releaseScreenWakeLock,
  testBluetoothDeviceScan,
} from '../services/api/permissions';

interface ServiceContextValue {
  incidentService: IFrontendIncidentService;
  networkService: INetworkRelayService;
  coordinator: NetworkCoordinator;
  meshController: NearbyMeshController;
  incidents: IncidentItem[];
  rawIncidents: Incident[];
  outboxCount: number;
  networkStatus: RelayNetworkStatus;
  deviceId: string;
  createIncident: (draft: DraftIncident) => Promise<Incident>;
  updateIncidentStatus: (id: string, newStatus: IncidentStatus) => Promise<void>;
  refreshIncidents: () => Promise<void>;
  refreshOutboxCount: () => Promise<void>;
  purgeDemoData: (broadcast?: boolean) => Promise<void>;
  toggleInternet: (enable: boolean) => Promise<void>;

  // Location Core
  currentLocation: GeolocationCoordinates | null;
  locationState: LocationState;
  locationError: string | null;
  requestLocation: (forcePrompt?: boolean) => Promise<GeolocationResult>;
  setManualLocation: (lat: number, lng: number) => void;

  // Hardware & Network Diagnostics
  networkDiagnostics: NetworkDiagnostics;
  reconnectSignaler: (customUrl?: string) => Promise<void>;

  // Device Permissions & Field Readiness
  permissions: DevicePermissionsStatus;
  refreshPermissions: () => Promise<void>;
  requestPermission: (type: 'notifications' | 'storage' | 'wakeLock') => Promise<boolean>;
  testBluetooth: () => Promise<{ success: boolean; deviceName?: string; error?: string }>;
}

export const ServiceContext = createContext<ServiceContextValue | null>(null);

export const ServiceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Support multi-node testing via URL parameter (e.g. ?node=A or ?node=B)
  const nodeParam = useMemo(() => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    return params.get('node');
  }, []);

  const database = useMemo(() => {
    if (nodeParam) {
      return new NexusDatabase(`NexusLocalDB_${nodeParam}`);
    }
    return new NexusDatabase('NexusLocalDB');
  }, [nodeParam]);

  const storageAdapter = useMemo(() => {
    return new OfflineStorageAdapter(database);
  }, [database]);

  const [deviceId, setDeviceId] = useState<string>(() => getSynchronousDeviceId(nodeParam));
  const [incidents, setIncidents] = useState<IncidentItem[]>([]);
  const [rawIncidents, setRawIncidents] = useState<Incident[]>([]);
  const [outboxCount, setOutboxCount] = useState<number>(0);

  // Initial cached location lookup (Offline-First)
  const initialCachedLocation = useMemo(() => getCachedPosition(), []);
  const [currentLocation, setCurrentLocation] = useState<GeolocationCoordinates | null>(initialCachedLocation);
  const [locationState, setLocationState] = useState<LocationState>(initialCachedLocation ? 'CACHED' : 'IDLE');
  const [locationError, setLocationError] = useState<string | null>(null);

  // Permissions state
  const [permissions, setPermissions] = useState<DevicePermissionsStatus>({
    location: 'NOT_REQUESTED',
    notifications: 'NOT_REQUESTED',
    storage: 'NOT_REQUESTED',
    wakeLock: 'NOT_SUPPORTED',
    bluetooth: 'NOT_SUPPORTED',
    isSecureContext: false,
  });

  const incidentService = useMemo(() => {
    return new FrontendIncidentService(database);
  }, [database]);

  const networkService = useMemo(() => {
    return new RelayEngine(deviceId, storageAdapter);
  }, [deviceId, storageAdapter]);

  const coordinator = useMemo(() => {
    return new NetworkCoordinator({
      deviceId,
      relayEngine: networkService,
      signalingUrl: getSignalingUrl(),
      enableNativeTransport: false, // NearbyMeshController owns native Nearby Connections
    });
  }, [deviceId, networkService]);

  // Safeguard 1: SINGLE STABLE MESH CONTROLLER for the lifetime of ServiceProvider
  const meshControllerRef = useRef<NearbyMeshController | null>(null);
  if (!meshControllerRef.current) {
    meshControllerRef.current = new NearbyMeshController({
      localDeviceId: deviceId,
      relayEngine: networkService,
      multiTransportManager: coordinator.getMultiTransportManager(),
      autoConnect: true,
    });
  }
  const meshController = meshControllerRef.current;

  // Keep meshController dynamically wired if services update
  useEffect(() => {
    meshController.setRelayEngine(networkService);
    meshController.setMultiTransportManager(coordinator.getMultiTransportManager());
  }, [meshController, networkService, coordinator]);

  const [networkStatus, setNetworkStatus] = useState<RelayNetworkStatus>(networkService.getStatus());
  const [networkDiagnostics, setNetworkDiagnostics] = useState<NetworkDiagnostics>(() => coordinator.getDiagnostics());

  // Initialize device ID from Dexie (syncing with synchronous ID)
  useEffect(() => {
    async function initDevice() {
      if (!nodeParam) {
        const id = await getDeviceId(database);
        if (id !== deviceId) {
          setDeviceId(id);
          coordinator.updateDeviceId(id);
          meshController.updateLocalDeviceId(id);
        }
      }
    }
    initDevice();
  }, [database, nodeParam, coordinator, meshController, deviceId]);

  const refreshOutboxCount = useCallback(async () => {
    try {
      const count = await incidentService.getOutboxCount();
      setOutboxCount(count);
    } catch (e) {
      console.error('[ServiceProvider] Failed to get outbox count:', e);
    }
  }, [incidentService]);

  const refreshIncidents = useCallback(async () => {
    try {
      const items = await incidentService.listIncidents();
      setRawIncidents(items);
      const viewModels = items.map((inc) => incidentToViewModel(inc));
      setIncidents(viewModels);
      const count = await incidentService.getOutboxCount();
      setOutboxCount(count);
    } catch (e) {
      console.error('[ServiceProvider] Failed to refresh incidents:', e);
    }
  }, [incidentService]);

  const purgeDemoData = useCallback(async (broadcast = true) => {
    try {
      if (broadcast) {
        console.log('[ServiceProvider] Triggering network-wide purge broadcast across mesh & signaling');
        coordinator.broadcastPurgeAll('User initiated network-wide demo data purge');
      }
      await database.incidents.clear();
      await database.outbox.clear();
      setRawIncidents([]);
      setIncidents([]);
      setOutboxCount(0);
      storageAdapter.notifyStorageChange();
      console.log('[ServiceProvider] Local database purged successfully');
    } catch (e) {
      console.error('[ServiceProvider] Failed to purge demo data:', e);
    }
  }, [database, storageAdapter, coordinator]);

  // Listen for remote network-wide purge commands across WebSockets & WebRTC
  useEffect(() => {
    const unsub = coordinator.onPurgeAll((reason) => {
      console.warn('[ServiceProvider] Remote network purge received:', reason);
      purgeDemoData(false);
    });
    return unsub;
  }, [coordinator, purgeDemoData]);

  // Subscribe to network status & trigger immediate incident refresh on peer relay sync
  useEffect(() => {
    const unsub = networkService.subscribeStatus((status) => {
      setNetworkStatus(status);
      refreshIncidents();
    });
    return unsub;
  }, [networkService, refreshIncidents]);

  // Subscribe to real-time network diagnostics
  useEffect(() => {
    const unsub = coordinator.subscribeDiagnostics((diag) => {
      setNetworkDiagnostics(diag);
    });
    return unsub;
  }, [coordinator]);

  // 1. Reactive Storage Adapter Listener (triggers immediately when WebRTC peer delivers incident)
  useEffect(() => {
    const unsub = storageAdapter.onStorageChange(() => {
      refreshIncidents();
    });
    return unsub;
  }, [storageAdapter, refreshIncidents]);

  // 2. Continuous Background Heartbeat (ensures immediate synchronization if WebRTC events fire outside microtask)
  useEffect(() => {
    refreshIncidents();
    const interval = setInterval(() => {
      refreshIncidents();
    }, 1500);
    return () => clearInterval(interval);
  }, [refreshIncidents]);

  // 3. Subscribe to real Dexie incidents liveQuery
  useEffect(() => {
    let isSubscribed = true;

    refreshOutboxCount();

    const unsub = incidentService.subscribeToIncidents((items) => {
      if (!isSubscribed) return;
      setRawIncidents(items);
      const viewModels = items.map((inc) => incidentToViewModel(inc));
      setIncidents(viewModels);
      refreshOutboxCount();
    });

    return () => {
      isSubscribed = false;
      unsub();
    };
  }, [incidentService, refreshOutboxCount]);

  useEffect(() => {
    coordinator.start().catch((err) => {
      console.warn('[ServiceProvider] Initial coordinator start:', err);
    });
    return () => {
      coordinator.stop().catch(() => {});
    };
  }, [coordinator]);

  // Autonomous Mesh Boot: starts advertising and discovery as soon as app launches
  useEffect(() => {
    let isMounted = true;
    async function startAutonomousMesh() {
      try {
        const pre = await meshController.checkPrerequisites();
        if (pre.ready && isMounted) {
          console.log('[ServiceProvider] Nearby hardware ready. Starting autonomous mesh advertising & discovery...');
          await meshController.startScan();
        } else {
          console.log('[ServiceProvider] Mesh prerequisites status:', pre.state);
        }
      } catch (err) {
        console.warn('[ServiceProvider] Failed to start autonomous mesh:', err);
      }
    }
    startAutonomousMesh();

    return () => {
      isMounted = false;
      meshController.destroy();
    };
  }, [meshController]);

  // Refresh hardware permissions truthfully
  const refreshPermissions = useCallback(async () => {
    const status = await queryAllPermissionsStatus();
    setPermissions(status);
  }, []);

  // Initial permissions check, storage persistence & immediate location hydration
  useEffect(() => {
    // 1. Immediately hydrate cached or campus fallback coordinates so phone is never coordinate-blind!
    const initialPos = getCachedPosition(true);
    if (initialPos) {
      setCurrentLocation(initialPos);
      setLocationState(initialPos.isManual ? 'MANUAL' : 'CACHED');
    }

    refreshPermissions();
    requestStoragePersistence().then(() => {
      refreshPermissions();
    });

    // 2. Attempt real live GPS fix in background
    getCurrentPosition({ enableHighAccuracy: true, timeout: 6000 }).then((res) => {
      if (res.success && res.coords) {
        setCurrentLocation(res.coords);
        setLocationState('LIVE');
        setLocationError(null);
      }
    }).catch(() => {});
  }, [refreshPermissions]);

  // Location request handler
  const requestLocation = useCallback(async (_forcePrompt = false): Promise<GeolocationResult> => {
    setLocationState('ACQUIRING');
    setLocationError(null);

    const result = await getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 5000,
    });

    if (result.success && result.coords) {
      setCurrentLocation(result.coords);
      setLocationState('LIVE');
      setLocationError(null);
      refreshPermissions();
      return result;
    } else {
      // Fall back to cached or campus tactical fix so the device always has coordinates
      const cached = getCachedPosition(true);
      if (cached) {
        setCurrentLocation(cached);
        setLocationState(cached.isManual ? 'MANUAL' : 'CACHED');
      } else {
        if (result.errorCode === 'PERMISSION_DENIED') {
          setLocationState('DENIED');
        } else {
          setLocationState('UNAVAILABLE');
        }
      }
      setLocationError(result.error || 'Failed to acquire satellite GPS fix.');
      refreshPermissions();
      return result;
    }
  }, [refreshPermissions]);

  // Continuous location watch when active
  useEffect(() => {
    let unwatch: (() => void) | null = null;

    // Only start watching if we already have LIVE status or after request
    if (locationState === 'LIVE') {
      unwatch = watchUserPosition(
        (coords) => {
          setCurrentLocation(coords);
          setLocationState('LIVE');
          setLocationError(null);
        },
        (errorRes) => {
          // If watch fails, maintain cached position
          console.warn('[LocationWatch] GPS watch update issue:', errorRes.error);
        }
      );
    }

    return () => {
      if (unwatch) unwatch();
    };
  }, [locationState]);

  // Set manual coordinates fallback
  const setManualLocation = useCallback((lat: number, lng: number) => {
    const manualCoords = createManualCoordinates(lat, lng);
    setCurrentLocation(manualCoords);
    setLocationState('MANUAL');
    setLocationError(null);
  }, []);

  // Individual permission request handlers
  const requestPermission = useCallback(
    async (type: 'notifications' | 'storage' | 'wakeLock'): Promise<boolean> => {
      let success = false;
      if (type === 'notifications') {
        success = await requestNotificationPermission();
      } else if (type === 'storage') {
        success = await requestStoragePersistence();
      } else if (type === 'wakeLock') {
        success = await requestScreenWakeLock();
      }
      await refreshPermissions();
      return success;
    },
    [refreshPermissions]
  );

  // Test Bluetooth (OPTIONAL ONLY)
  const testBluetooth = useCallback(async () => {
    const res = await testBluetoothDeviceScan();
    await refreshPermissions();
    return res;
  }, [refreshPermissions]);

  // Clean up wake lock on unmount
  useEffect(() => {
    return () => {
      releaseScreenWakeLock();
    };
  }, []);

  const toggleInternet = async (enable: boolean) => {
    if (enable) {
      await coordinator.start();
    } else {
      await coordinator.stop();
    }
  };

  const createIncident = async (draft: DraftIncident): Promise<Incident> => {
    const inc = await incidentService.createIncident(draft);
    await refreshIncidents();
    // Trigger immediate peer synchronization across all active transports (Nearby + WebRTC + WebSocket)
    networkService.triggerPeerSync().catch((err) => {
      console.warn('[ServiceProvider] Peer sync after incident creation failed:', err);
    });
    return inc;
  };

  const updateIncidentStatus = async (id: string, newStatus: IncidentStatus): Promise<void> => {
    await incidentService.updateIncidentStatus(id, newStatus);
    await refreshIncidents();
    networkService.triggerPeerSync().catch((err) => {
      console.warn('[ServiceProvider] Peer sync after incident update failed:', err);
    });
  };

  const reconnectSignaler = useCallback(async (customUrl?: string) => {
    await coordinator.stop();
    await coordinator.start(customUrl);
  }, [coordinator]);

  const value: ServiceContextValue = {
    incidentService,
    networkService,
    coordinator,
    meshController,
    incidents,
    rawIncidents,
    outboxCount,
    networkStatus,
    deviceId,
    createIncident,
    updateIncidentStatus,
    refreshIncidents,
    refreshOutboxCount,
    purgeDemoData,
    toggleInternet,

    // Hardware & Network Diagnostics
    networkDiagnostics,
    reconnectSignaler,

    // Location
    currentLocation,
    locationState,
    locationError,
    requestLocation,
    setManualLocation,

    // Permissions
    permissions,
    refreshPermissions,
    requestPermission,
    testBluetooth,
  };

  return <ServiceContext.Provider value={value}>{children}</ServiceContext.Provider>;
};

export const useNexusServices = (): ServiceContextValue => {
  const ctx = useContext(ServiceContext);
  if (!ctx) {
    throw new Error('useNexusServices must be used within a ServiceProvider');
  }
  return ctx;
};
