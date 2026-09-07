export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: 'Incident Commander' | 'Super Admin' | 'Network Operations Director';
  station: string;
  badgeId: string;
  avatarInitials: string;
  lastLogin: string;
}

export interface AdminSession {
  isAuthenticated: boolean;
  user: AdminUser | null;
  loginTime?: string;
  sessionToken?: string;
}

export interface NodeHealth {
  id: string;
  nodeName: string;
  location: string;
  campusZone: string;
  status: 'online' | 'degraded' | 'offline';
  protocol: 'LoRa 868MHz' | 'BLE 5.2 Mesh' | 'Wi-Fi Direct P2P';
  batteryPercent: number;
  rssiDbm: number;
  packetsRouted24h: number;
  hopLatencyMs: number;
  lastHeartbeat: string;
}

export interface ResponderTeam {
  id: string;
  callsign: string;
  leadName: string;
  unitType: 'Medical First Aid' | 'Search & Rescue' | 'Campus Security' | 'Logistics & Water';
  currentSector: string;
  assignedIncidentId?: string;
  status: 'En Route' | 'On Scene' | 'Standby' | 'Offline';
  personnelCount: number;
  radioFrequency: string;
}

export interface AdminAuditLog {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  category: 'broadcast' | 'dispatch' | 'security' | 'mesh';
  severity: 'info' | 'warn' | 'critical';
}
