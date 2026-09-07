export type NavTab = 'feed' | 'map' | 'network' | 'device';

export type IncidentCategory = 'all' | 'critical' | 'medical' | 'wildfire' | 'supplies';

export interface IncidentItem {
  id: string;
  category: string; // e.g. 'critical medical', 'critical wildfire', 'supplies'
  typeLabel: string; // e.g. 'Critical · Medical', 'Urgent · Fire', 'Resources · Water'
  badgeColor: 'error' | 'amber' | 'primary';
  timeAgo: string;
  title: string;
  description: string;
  distance: string;
  location: string;
  latitude?: number;
  longitude?: number;
  mediaUrl?: string;
  mediaAlt?: string;
  telemetryTag?: string;
  isVerified?: boolean;
  statusText?: string;
  urgency?: 'High' | 'Medium' | 'Low';
  hopsRemaining?: number;
  peopleAffected?: number;
  waterCapacity?: {
    availableGallons: string;
    flowRate: string;
    waitTime: string;
  };
  hasResponded?: boolean;
}

export interface MapBeacon {
  id: string;
  type: 'amber' | 'blue' | 'critical';
  label: string;
  title: string;
  category: string;
  sector: string;
  distance: string;
  walkTime: string;
  threatLevel: string;
  pos: {
    top: string;
    left?: string;
    right?: string;
  };
  responders: {
    initials: string[];
    countText: string;
  };
}

export interface MeshPeer {
  id: string;
  name: string;
  role: string;
  typeBadge: 'Direct' | 'Relay' | 'Idle' | 'Edge';
  typeColor: 'tertiary' | 'primary' | 'secondary' | 'neutral';
  icon: string;
  distance: string;
  syncTime: string;
  signalStrength: 'Excellent' | 'Good' | 'Moderate' | 'Edge';
  signalBars: number;
  radarPos: {
    top?: string;
    bottom?: string;
    left?: string;
    right?: string;
  };
  radarLabel: string;
}

export interface DeviceProfile {
  name: string;
  handle: string;
  role: string;
  sector: string;
  avatar: string;
  isVerified: boolean;
  batteryPercent: number;
  batteryHours: string;
  vaultUsedMb: number;
  vaultTotalMb: number;
  savedIncidentsCount: number;
  protocols: {
    ble: boolean;
    wifi: boolean;
    cloud: boolean;
  };
  backgroundMeshDiscovery: boolean;
}
