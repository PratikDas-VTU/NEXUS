import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import type { IFrontendIncidentService, INetworkRelayService, RelayNetworkStatus } from '../../../shared/interfaces';
import type { Incident, DraftIncident, IncidentStatus } from '../../../shared/types';
import { FrontendIncidentService } from '../../../backend/data/incidentService';
import { OfflineStorageAdapter } from '../../../backend/data/adapter';
import { NexusDatabase } from '../../../backend/data/db';
import { getDeviceId } from '../../../backend/data/deviceId';
import { RelayEngine } from '../../../networking/relayEngine';
import { incidentToViewModel } from '../services/incidentMapper';
import type { IncidentItem } from '../types';

import { NetworkCoordinator } from '../services/networkCoordinator';
import { getSignalingUrl } from '../services/api/config';

interface ServiceContextValue {
  incidentService: IFrontendIncidentService;
  networkService: INetworkRelayService;
  coordinator: NetworkCoordinator;
  incidents: IncidentItem[];
  rawIncidents: Incident[];
  outboxCount: number;
  networkStatus: RelayNetworkStatus;
  deviceId: string;
  createIncident: (draft: DraftIncident) => Promise<Incident>;
  updateIncidentStatus: (id: string, newStatus: IncidentStatus) => Promise<void>;
  refreshOutboxCount: () => Promise<void>;
  toggleInternet: (enable: boolean) => Promise<void>;
}

const ServiceContext = createContext<ServiceContextValue | null>(null);

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

  const [deviceId, setDeviceId] = useState<string>(nodeParam ? `DEV-${nodeParam.toUpperCase()}` : 'DEV-INIT');
  const [incidents, setIncidents] = useState<IncidentItem[]>([]);
  const [rawIncidents, setRawIncidents] = useState<Incident[]>([]);
  const [outboxCount, setOutboxCount] = useState<number>(0);

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
    });
  }, [deviceId, networkService]);

  const [networkStatus, setNetworkStatus] = useState<RelayNetworkStatus>(networkService.getStatus());

  // Initialize device ID
  useEffect(() => {
    async function initDevice() {
      if (!nodeParam) {
        const id = await getDeviceId(database);
        setDeviceId(id);
      }
    }
    initDevice();
  }, [database, nodeParam]);

  // Subscribe to network status
  useEffect(() => {
    const unsub = networkService.subscribeStatus((status) => {
      setNetworkStatus(status);
    });
    return unsub;
  }, [networkService]);

  const refreshOutboxCount = async () => {
    try {
      const count = await incidentService.getOutboxCount();
      setOutboxCount(count);
    } catch (e) {
      console.error('[ServiceProvider] Failed to get outbox count:', e);
    }
  };

  // Subscribe to real Dexie incidents (no fake seeding)
  useEffect(() => {
    let isSubscribed = true;

    // Initial outbox check
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
  }, [incidentService]);

  useEffect(() => {
    coordinator.start().catch((err) => {
      console.warn('[ServiceProvider] Initial coordinator start:', err);
    });
    return () => {
      coordinator.stop().catch(() => {});
    };
  }, [coordinator]);

  const toggleInternet = async (enable: boolean) => {
    if (enable) {
      await coordinator.start();
    } else {
      await coordinator.stop();
    }
  };

  const createIncident = async (draft: DraftIncident): Promise<Incident> => {
    const inc = await incidentService.createIncident(draft);
    await refreshOutboxCount();
    return inc;
  };

  const updateIncidentStatus = async (id: string, newStatus: IncidentStatus): Promise<void> => {
    await incidentService.updateIncidentStatus(id, newStatus);
    await refreshOutboxCount();
  };

  const value: ServiceContextValue = {
    incidentService,
    networkService,
    coordinator,
    incidents,
    rawIncidents,
    outboxCount,
    networkStatus,
    deviceId,
    createIncident,
    updateIncidentStatus,
    refreshOutboxCount,
    toggleInternet,
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
