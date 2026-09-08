/**
 * NEXUS Geographic Density Clustering Service
 * 
 * Computes high-density responder/node clusters using the Haversine formula.
 * 
 * STRICT INTEGRITY RULES:
 * 1. Demo nodes (isDemo === true) are ALWAYS excluded from operational density calculations.
 * 2. Nodes without legitimate GPS coordinates are EXCLUDED (Node -> GPS unavailable).
 * 3. High Node Density != Emergency. A high-density area indicates concentrated responder/node
 *    presence, NOT an emergency distress beacon.
 */

import { NodeDensityCluster } from '../admin/types';

// Configurable constants (centralized, not scattered throughout the UI)
export const MIN_DENSITY_NODES = 3;
export const DENSITY_RADIUS_METERS = 50;

export interface LocatableNode {
  id: string;
  name?: string;
  latitude?: number | null;
  longitude?: number | null;
  isDemo?: boolean;
  gpsQuality?: 'live' | 'low_accuracy' | 'cached' | 'unavailable';
}

/**
 * Calculates great-circle distance between two points on Earth using the Haversine formula.
 * Returns distance in meters.
 */
export function calculateHaversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const EARTH_RADIUS_METERS = 6371000;
  const toRadians = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
}

/**
 * Computes high-density clusters from active operational nodes.
 * 
 * Rules:
 * - >= 3 nodes within 50m -> one high-density region
 * - 2 nodes -> no density region
 * - 3 nodes outside 50m -> separate locations (no density region)
 * - 4+ nodes -> appropriate clustering
 * - No GPS -> excluded
 * - Demo nodes -> ALWAYS excluded
 */
export function findHighDensityClusters(
  nodes: LocatableNode[],
  minNodes: number = MIN_DENSITY_NODES,
  radiusMeters: number = DENSITY_RADIUS_METERS
): NodeDensityCluster[] {
  // 1. Filter out demo nodes and nodes without valid coordinates
  const operationalNodes = nodes.filter((n) => {
    if (n.isDemo) return false;
    if (n.latitude === undefined || n.latitude === null || isNaN(n.latitude)) return false;
    if (n.longitude === undefined || n.longitude === null || isNaN(n.longitude)) return false;
    if (n.gpsQuality === 'unavailable') return false;
    return true;
  }) as Array<LocatableNode & { latitude: number; longitude: number }>;

  if (operationalNodes.length < minNodes) {
    return [];
  }

  // 2. Build adjacency list of nodes within radiusMeters
  const neighborsMap = new Map<string, string[]>();
  for (let i = 0; i < operationalNodes.length; i++) {
    const nodeA = operationalNodes[i];
    const neighbors: string[] = [];

    for (let j = 0; j < operationalNodes.length; j++) {
      const nodeB = operationalNodes[j];
      const dist = calculateHaversineDistanceMeters(
        nodeA.latitude,
        nodeA.longitude,
        nodeB.latitude,
        nodeB.longitude
      );
      if (dist <= radiusMeters) {
        neighbors.push(nodeB.id);
      }
    }
    neighborsMap.set(nodeA.id, neighbors);
  }

  // 3. Find dense seed cores (nodes having >= minNodes within radiusMeters)
  const visited = new Set<string>();
  const clusters: NodeDensityCluster[] = [];

  for (const seedNode of operationalNodes) {
    if (visited.has(seedNode.id)) continue;

    const seedNeighbors = neighborsMap.get(seedNode.id) || [];
    if (seedNeighbors.length < minNodes) {
      continue;
    }

    // Expand cluster using BFS
    const clusterNodeIds = new Set<string>();
    const queue = [...seedNeighbors];

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      if (clusterNodeIds.has(currentId)) continue;

      clusterNodeIds.add(currentId);
      visited.add(currentId);

      const currentNeighbors = neighborsMap.get(currentId) || [];
      if (currentNeighbors.length >= minNodes) {
        for (const neighborId of currentNeighbors) {
          if (!clusterNodeIds.has(neighborId)) {
            queue.push(neighborId);
          }
        }
      }
    }

    if (clusterNodeIds.size >= minNodes) {
      const clusterMembers = operationalNodes.filter((n) => clusterNodeIds.has(n.id));

      // Compute centroid
      const sumLat = clusterMembers.reduce((acc, n) => acc + n.latitude, 0);
      const sumLng = clusterMembers.reduce((acc, n) => acc + n.longitude, 0);
      const centerLat = sumLat / clusterMembers.length;
      const centerLng = sumLng / clusterMembers.length;

      // Compute bounding radius (distance from center to furthest member + padding)
      let maxDistFromCenter = 0;
      for (const member of clusterMembers) {
        const d = calculateHaversineDistanceMeters(centerLat, centerLng, member.latitude, member.longitude);
        if (d > maxDistFromCenter) {
          maxDistFromCenter = d;
        }
      }

      // Ensure minimum visual radius of 25m or actual spread
      const effectiveRadius = Math.max(Math.round(maxDistFromCenter + 8), 25);

      clusters.push({
        id: `density-cluster-${clusters.length + 1}`,
        centerLat,
        centerLng,
        radiusMeters: effectiveRadius,
        nodeCount: clusterMembers.length,
        nodeIds: Array.from(clusterNodeIds),
      });
    }
  }

  return clusters;
}

/**
 * Format density cluster label strictly adhering to semantic rules:
 * e.g. "5 nodes · 32m radius · HIGH NODE DENSITY"
 * NEVER "EMERGENCY AREA"
 */
export function formatDensityLabel(cluster: NodeDensityCluster): string {
  return `${cluster.nodeCount} nodes · ${cluster.radiusMeters}m radius · HIGH NODE DENSITY`;
}
