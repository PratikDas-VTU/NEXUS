import { describe, it, expect } from 'vitest';
import {
  calculateHaversineDistanceMeters,
  findHighDensityClusters,
  formatDensityLabel,
  MIN_DENSITY_NODES,
  DENSITY_RADIUS_METERS,
  LocatableNode,
} from '../densityClustering';

describe('Geographic Density Clustering Service', () => {
  it('has centralized configurable constants', () => {
    expect(MIN_DENSITY_NODES).toBe(3);
    expect(DENSITY_RADIUS_METERS).toBe(50);
  });

  it('correctly calculates Haversine distance in meters', () => {
    // Distance between two points ~30m apart
    const lat1 = 13.2384;
    const lon1 = 80.0094;
    // ~0.00027 degrees latitude is ~30 meters
    const lat2 = 13.23867;
    const lon2 = 80.0094;

    const dist = calculateHaversineDistanceMeters(lat1, lon1, lat2, lon2);
    expect(dist).toBeGreaterThan(25);
    expect(dist).toBeLessThan(35);
  });

  it('3 nodes within 50m -> one high-density region', () => {
    const nodes: LocatableNode[] = [
      { id: 'node-1', latitude: 13.2384, longitude: 80.0094, isDemo: false },
      { id: 'node-2', latitude: 13.2385, longitude: 80.0094, isDemo: false }, // ~11m away
      { id: 'node-3', latitude: 13.2386, longitude: 80.0094, isDemo: false }, // ~22m away
    ];

    const clusters = findHighDensityClusters(nodes, 3, 50);
    expect(clusters.length).toBe(1);
    expect(clusters[0].nodeCount).toBe(3);
    expect(clusters[0].nodeIds).toEqual(expect.arrayContaining(['node-1', 'node-2', 'node-3']));
  });

  it('2 nodes within 50m -> no density region (< MIN_DENSITY_NODES)', () => {
    const nodes: LocatableNode[] = [
      { id: 'node-1', latitude: 13.2384, longitude: 80.0094, isDemo: false },
      { id: 'node-2', latitude: 13.2385, longitude: 80.0094, isDemo: false },
    ];

    const clusters = findHighDensityClusters(nodes, 3, 50);
    expect(clusters.length).toBe(0);
  });

  it('3 nodes outside 50m -> separate locations (no density region)', () => {
    const nodes: LocatableNode[] = [
      { id: 'node-1', latitude: 13.2384, longitude: 80.0094, isDemo: false },
      { id: 'node-2', latitude: 13.2420, longitude: 80.0094, isDemo: false }, // ~400m away
      { id: 'node-3', latitude: 13.2480, longitude: 80.0094, isDemo: false }, // ~1000m away
    ];

    const clusters = findHighDensityClusters(nodes, 3, 50);
    expect(clusters.length).toBe(0);
  });

  it('4+ nodes -> appropriate clustering into single dense region', () => {
    const nodes: LocatableNode[] = [
      { id: 'node-1', latitude: 13.2384, longitude: 80.0094, isDemo: false },
      { id: 'node-2', latitude: 13.2385, longitude: 80.0094, isDemo: false },
      { id: 'node-3', latitude: 13.2386, longitude: 80.0094, isDemo: false },
      { id: 'node-4', latitude: 13.23855, longitude: 80.00945, isDemo: false },
      { id: 'node-5', latitude: 13.23845, longitude: 80.00938, isDemo: false },
    ];

    const clusters = findHighDensityClusters(nodes, 3, 50);
    expect(clusters.length).toBe(1);
    expect(clusters[0].nodeCount).toBe(5);
  });

  it('no GPS -> excluded from density calculations', () => {
    const nodes: LocatableNode[] = [
      { id: 'node-1', latitude: 13.2384, longitude: 80.0094, isDemo: false },
      { id: 'node-2', latitude: 13.2385, longitude: 80.0094, isDemo: false },
      // Node 3 has no GPS
      { id: 'node-3', latitude: null, longitude: null, isDemo: false },
      // Node 4 is undefined
      { id: 'node-4', isDemo: false },
    ];

    // Only 2 valid nodes remain, which is < 3
    const clusters = findHighDensityClusters(nodes, 3, 50);
    expect(clusters.length).toBe(0);
  });

  it('stale/unreliable GPS -> handled according to GPS quality (unavailable excluded)', () => {
    const nodes: LocatableNode[] = [
      { id: 'node-1', latitude: 13.2384, longitude: 80.0094, isDemo: false, gpsQuality: 'live' },
      { id: 'node-2', latitude: 13.2385, longitude: 80.0094, isDemo: false, gpsQuality: 'cached' },
      { id: 'node-3', latitude: 13.2386, longitude: 80.0094, isDemo: false, gpsQuality: 'unavailable' },
    ];

    // Node 3 is flagged unavailable -> excluded -> only 2 valid nodes -> no cluster
    const clusters = findHighDensityClusters(nodes, 3, 50);
    expect(clusters.length).toBe(0);
  });

  it('demo nodes -> ALWAYS excluded from operational density calculations', () => {
    const nodes: LocatableNode[] = [
      { id: 'node-1', latitude: 13.2384, longitude: 80.0094, isDemo: false },
      { id: 'node-2', latitude: 13.2385, longitude: 80.0094, isDemo: false },
      // Simulated demo nodes
      { id: 'demo-1', latitude: 13.23845, longitude: 80.00942, isDemo: true },
      { id: 'demo-2', latitude: 13.23855, longitude: 80.00948, isDemo: true },
    ];

    // Only 2 operational nodes -> demo nodes MUST NEVER participate
    const clusters = findHighDensityClusters(nodes, 3, 50);
    expect(clusters.length).toBe(0);
  });

  it('formatDensityLabel enforces Density != Emergency semantic rule', () => {
    const cluster = {
      id: 'cluster-1',
      centerLat: 13.2385,
      centerLng: 80.0094,
      radiusMeters: 38,
      nodeCount: 4,
      nodeIds: ['n1', 'n2', 'n3', 'n4'],
    };

    const label = formatDensityLabel(cluster);
    expect(label).toContain('4 nodes');
    expect(label).toContain('38m radius');
    expect(label).toContain('HIGH NODE DENSITY');
    // Must NOT be labeled as emergency area
    expect(label).not.toContain('EMERGENCY');
  });
});
