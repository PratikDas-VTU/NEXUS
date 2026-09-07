/**
 * NEXUS — Isolated Demo Mesh Visualization Layer
 * 
 * STRICT ARCHITECTURAL ISOLATION:
 * - This module is ONLY for MapTab UI visualization.
 * - These dummy nodes NEVER enter RelayEngine, MultiTransportManager,
 *   Dexie DB, Nearby Connections, or protocol messaging (HELLO/MANIFEST/REQUEST/PAYLOAD/ACK).
 * - All entries contain `isDemo: true` to guarantee zero confusion with real nodes.
 * - Geographic distance is strictly spatial and NOT radio range or hop count.
 */

export interface DemoMeshNode {
  readonly id: string;
  readonly label: string;
  readonly title: string;
  readonly role: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly distanceMeters: number;
  readonly offsetDescription: string;
  readonly isDemo: true;
  readonly details: {
    readonly battery: string;
    readonly simulatedSignal: string;
    readonly description: string;
  };
}

export interface DemoMeshEdge {
  readonly id: string;
  readonly fromLabel: string;
  readonly toLabel: string;
  readonly fromCoords: [number, number];
  readonly toCoords: [number, number];
  readonly midpointCoords: [number, number];
  readonly distanceMeters: number;
  readonly formattedDistance: string;
  readonly isDemo: true;
  readonly label: string;
}

/**
 * Real/Reference coordinate anchor:
 * Latitude: 13.2628, Longitude: 80.0280
 */
export const DEMO_REFERENCE_LOCATION = {
  latitude: 13.2628,
  longitude: 80.0280,
} as const;

/**
 * Calculates geographic distance in meters between two lat/lng coordinates
 * using the Haversine formula. Pure mathematical helper independent of networking.
 */
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth mean radius in meters
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * toRad) *
      Math.cos(lat2 * toRad) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Formats geographic distance sensibly:
 * - Under 1000 m: e.g. "67.9 m"
 * - 1000 m or more: e.g. "1.24 km"
 */
export function formatGeographicDistance(meters: number): string {
  if (meters < 1000) {
    return `${meters.toFixed(1)} m`;
  }
  return `${(meters / 1000).toFixed(2)} km`;
}

/**
 * 3 Deterministic Demo Nodes placed approximately 50-90m around the reference location.
 * Calculated offsets:
 *   1 deg Lat  ~ 111,139 m  =>  0.00000900 deg/m
 *   1 deg Lng  ~ 108,172 m  =>  0.00000924 deg/m
 */
export const DEMO_MESH_NODES: readonly DemoMeshNode[] = [
  {
    id: 'nexus-demo-alpha',
    label: 'DEMO · Alpha',
    title: 'Nexus Relay Alpha [DEMO]',
    role: 'Simulated Demo Relay (Node Alpha)',
    latitude: 13.262980,
    longitude: 80.028600,
    distanceMeters: Math.round(
      calculateDistanceMeters(
        DEMO_REFERENCE_LOCATION.latitude,
        DEMO_REFERENCE_LOCATION.longitude,
        13.262980,
        80.028600
      )
    ),
    offsetDescription: '+20m N, +65m E (~68m)',
    isDemo: true,
    details: {
      battery: '92%',
      simulatedSignal: 'Strong (-62 dBm)',
      description: 'Virtual relay node for spatial mesh topology demonstration. Not a live radio transceiver.',
    },
  },
  {
    id: 'nexus-demo-bravo',
    label: 'DEMO · Bravo',
    title: 'Nexus Field Relay Bravo [DEMO]',
    role: 'Simulated Field Relay (Node Bravo)',
    latitude: 13.263430,
    longitude: 80.028460,
    distanceMeters: Math.round(
      calculateDistanceMeters(
        DEMO_REFERENCE_LOCATION.latitude,
        DEMO_REFERENCE_LOCATION.longitude,
        13.263430,
        80.028460
      )
    ),
    offsetDescription: '+70m N, +50m E (~86m)',
    isDemo: true,
    details: {
      battery: '85%',
      simulatedSignal: 'Moderate (-74 dBm)',
      description: 'Virtual field relay node for spatial mesh topology demonstration. Not a live radio transceiver.',
    },
  },
  {
    id: 'nexus-demo-charlie',
    label: 'DEMO · Charlie',
    title: 'Nexus Edge Unit Charlie [DEMO]',
    role: 'Simulated Edge Beacon (Node Charlie)',
    latitude: 13.262220,
    longitude: 80.028550,
    distanceMeters: Math.round(
      calculateDistanceMeters(
        DEMO_REFERENCE_LOCATION.latitude,
        DEMO_REFERENCE_LOCATION.longitude,
        13.262220,
        80.028550
      )
    ),
    offsetDescription: '-64m S, +60m E (~88m)',
    isDemo: true,
    details: {
      battery: '78%',
      simulatedSignal: 'Moderate (-78 dBm)',
      description: 'Virtual edge beacon for spatial mesh topology demonstration. Not a live radio transceiver.',
    },
  },
] as const;

/**
 * Returns the demo visualization edges with dynamically computed geographic distances
 * and midpoint coordinates for map labels.
 */
export function getDemoMeshEdges(
  referenceCoords: [number, number] = [DEMO_REFERENCE_LOCATION.latitude, DEMO_REFERENCE_LOCATION.longitude]
): DemoMeshEdge[] {
  const edgeDefs = [
    {
      id: 'demo-edge-anchor-alpha',
      fromLabel: 'Reference Node',
      toLabel: 'Alpha',
      fromCoords: referenceCoords,
      toCoords: [DEMO_MESH_NODES[0].latitude, DEMO_MESH_NODES[0].longitude] as [number, number],
    },
    {
      id: 'demo-edge-alpha-bravo',
      fromLabel: 'Alpha',
      toLabel: 'Bravo',
      fromCoords: [DEMO_MESH_NODES[0].latitude, DEMO_MESH_NODES[0].longitude] as [number, number],
      toCoords: [DEMO_MESH_NODES[1].latitude, DEMO_MESH_NODES[1].longitude] as [number, number],
    },
    {
      id: 'demo-edge-alpha-charlie',
      fromLabel: 'Alpha',
      toLabel: 'Charlie',
      fromCoords: [DEMO_MESH_NODES[0].latitude, DEMO_MESH_NODES[0].longitude] as [number, number],
      toCoords: [DEMO_MESH_NODES[2].latitude, DEMO_MESH_NODES[2].longitude] as [number, number],
    },
  ];

  return edgeDefs.map((def) => {
    const distMeters = calculateDistanceMeters(
      def.fromCoords[0],
      def.fromCoords[1],
      def.toCoords[0],
      def.toCoords[1]
    );
    const formatted = formatGeographicDistance(distMeters);
    const midpoint: [number, number] = [
      (def.fromCoords[0] + def.toCoords[0]) / 2,
      (def.fromCoords[1] + def.toCoords[1]) / 2,
    ];

    return {
      id: def.id,
      fromLabel: def.fromLabel,
      toLabel: def.toLabel,
      fromCoords: def.fromCoords,
      toCoords: def.toCoords,
      midpointCoords: midpoint,
      distanceMeters: distMeters,
      formattedDistance: formatted,
      isDemo: true as const,
      label: `DEMO · ${formatted}`,
    };
  });
}

const DEMO_MESH_STORAGE_KEY = 'nexus_demo_mesh_visualization_enabled';

/**
 * Checks if Demo Mesh is enabled.
 * Default is strictly FALSE for conservative, non-intrusive behavior.
 */
export function isDemoMeshEnabled(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(DEMO_MESH_STORAGE_KEY) === 'true';
}

/**
 * Persists the user toggle for Demo Mesh.
 */
export function setDemoMeshEnabled(enabled: boolean): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(DEMO_MESH_STORAGE_KEY, enabled ? 'true' : 'false');
}
