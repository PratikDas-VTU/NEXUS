import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  NearbyMeshController,
  type NearbyPreflightState,
  type NearbyNodeStatus,
  type NearbyNode,
  type NearbyMeshControllerOptions,
} from '../services/nearbyMeshController';

export type { NearbyPreflightState, NearbyNodeStatus, NearbyNode };

export interface UseNearbyMeshOptions extends NearbyMeshControllerOptions {}

export interface UseNearbyMeshResult {
  isScanning: boolean;
  isStarting: boolean;
  isStopping: boolean;
  advertising: boolean;
  discovery: boolean;
  isNativeAvailable: boolean;
  preflightState: NearbyPreflightState;
  missingPermissions: string[];
  errorMessage: string | null;
  nodes: NearbyNode[];
  connectedNodes: NearbyNode[];
  discoveredCount: number;
  connectedCount: number;
  startScan: () => Promise<boolean>;
  stopScan: () => Promise<void>;
  checkPrerequisites: () => Promise<{ ready: boolean; state: NearbyPreflightState }>;
  connect: (endpointId: string) => Promise<void>;
  disconnect: (endpointId: string) => Promise<void>;
  requestPermissions: () => Promise<boolean>;
}

export function useNearbyMesh(options: UseNearbyMeshOptions): UseNearbyMeshResult {
  const controller = useMemo(() => {
    return new NearbyMeshController(options);
  }, [options.localDeviceId, options.serviceId, options.bridge]);

  const [snapshot, setSnapshot] = useState(() => ({
    isScanning: controller.isScanning,
    isStarting: controller.isStarting,
    isStopping: controller.isStopping,
    advertising: controller.advertising,
    discovery: controller.discovery,
    isNativeAvailable: controller.isNativeAvailable,
    preflightState: controller.preflightState,
    missingPermissions: controller.missingPermissions,
    errorMessage: controller.errorMessage,
    nodes: controller.nodes,
  }));

  useEffect(() => {
    const unsub = controller.subscribe(() => {
      setSnapshot({
        isScanning: controller.isScanning,
        isStarting: controller.isStarting,
        isStopping: controller.isStopping,
        advertising: controller.advertising,
        discovery: controller.discovery,
        isNativeAvailable: controller.isNativeAvailable,
        preflightState: controller.preflightState,
        missingPermissions: controller.missingPermissions,
        errorMessage: controller.errorMessage,
        nodes: [...controller.nodes],
      });
    });

    controller.checkPrerequisites().catch(() => {});

    return () => {
      unsub();
      controller.destroy();
    };
  }, [controller]);

  const startScan = useCallback(() => controller.startScan(), [controller]);
  const stopScan = useCallback(() => controller.stopScan(), [controller]);
  const checkPrerequisites = useCallback(() => controller.checkPrerequisites(), [controller]);
  const connect = useCallback((endpointId: string) => controller.connect(endpointId), [controller]);
  const disconnect = useCallback((endpointId: string) => controller.disconnect(endpointId), [controller]);
  const requestPermissions = useCallback(() => controller.requestPermissions(), [controller]);

  const connectedNodes = snapshot.nodes.filter((n) => n.status === 'CONNECTED');

  return {
    ...snapshot,
    connectedNodes,
    discoveredCount: snapshot.nodes.filter((n) => n.status !== 'DISCONNECTED').length,
    connectedCount: connectedNodes.length,
    startScan,
    stopScan,
    checkPrerequisites,
    connect,
    disconnect,
    requestPermissions,
  };
}
