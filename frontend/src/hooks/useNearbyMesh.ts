import { useState, useEffect, useCallback, useContext, useRef } from 'react';
import {
  NearbyMeshController,
  type NearbyPreflightState,
  type NearbyNodeStatus,
  type NearbyNode,
  type NearbyMeshControllerOptions,
} from '../services/nearbyMeshController';
import { ServiceContext } from '../context/ServiceContext';

export type { NearbyPreflightState, NearbyNodeStatus, NearbyNode };

export interface UseNearbyMeshOptions extends Partial<NearbyMeshControllerOptions> {}

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

export function useNearbyMesh(options?: UseNearbyMeshOptions): UseNearbyMeshResult {
  const ctx = useContext(ServiceContext);
  const isContextMode = Boolean(ctx?.meshController);

  // If inside ServiceProvider, use the application-level singleton meshController
  // Otherwise, create an isolated fallback controller (for standalone unit tests)
  const fallbackRef = useRef<NearbyMeshController | null>(null);
  if (!isContextMode && !fallbackRef.current) {
    fallbackRef.current = new NearbyMeshController({
      localDeviceId: options?.localDeviceId || 'standalone-node',
      serviceId: options?.serviceId,
      bridge: options?.bridge,
      onToast: options?.onToast,
      onStateChange: options?.onStateChange,
    });
  }

  const controller = isContextMode ? ctx!.meshController : fallbackRef.current!;

  // Dynamically attach toast callback if provided
  useEffect(() => {
    if (options?.onToast) {
      controller.setOnToast(options.onToast);
    }
  }, [controller, options?.onToast]);

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

    if (!isContextMode) {
      controller.checkPrerequisites().catch(() => {});
    }

    return () => {
      unsub();
      // Safeguards 1 & 4: In context mode (real app), DO NOT destroy the controller when NetworkTab unmounts!
      // Only destroy if this was an isolated fallback controller created for a standalone unit test.
      if (!isContextMode && fallbackRef.current) {
        fallbackRef.current.destroy();
        fallbackRef.current = null;
      }
    };
  }, [controller, isContextMode]);

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
