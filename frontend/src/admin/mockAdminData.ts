/**
 * NEXUS Reference & Simulated Dataset
 * 
 * NOTE: This dataset provides reference schema and simulated topology data
 * for emergency preparedness drills when physical radio repeaters or LoRa hardware
 * are not connected. Live mesh views in NEXUS read truthfully from local Dexie / WebRTC.
 */

import { AdminUser, NodeHealth, ResponderTeam, AdminAuditLog } from './types';

export const DEFAULT_ADMIN_USER: AdminUser = {
  id: 'adm-01',
  name: 'Dr. Rajesh K. Sundaram',
  email: 'admin@amrita.edu',
  role: 'Incident Commander',
  station: 'Amrita Vishwa Vidyapeetham Command Hub, Vengal',
  badgeId: 'AVV-DISASTER-094',
  avatarInitials: 'RK',
  lastLogin: 'Today, 08:42 AM IST',
};

export const INITIAL_MESH_NODES: NodeHealth[] = [
  {
    id: 'node-01',
    nodeName: 'Amrita Central IT Gateway Alpha',
    location: 'Central Library & Admin Quad',
    campusZone: 'Academic Core',
    status: 'online',
    protocol: 'LoRa 868MHz',
    batteryPercent: 98,
    rssiDbm: -54,
    packetsRouted24h: 14280,
    hopLatencyMs: 14,
    lastHeartbeat: '2s ago',
  },
  {
    id: 'node-02',
    nodeName: 'Ramanujan Block Medical Relay',
    location: 'Academic Block A Ground Floor',
    campusZone: 'Engineering Wing',
    status: 'online',
    protocol: 'BLE 5.2 Mesh',
    batteryPercent: 86,
    rssiDbm: -68,
    packetsRouted24h: 8940,
    hopLatencyMs: 22,
    lastHeartbeat: '6s ago',
  },
  {
    id: 'node-03',
    nodeName: 'Agastya Hostels Water & Logistics Repeater',
    location: 'Student Dining Hall Rooftop',
    campusZone: 'Residential Zone',
    status: 'online',
    protocol: 'Wi-Fi Direct P2P',
    batteryPercent: 91,
    rssiDbm: -62,
    packetsRouted24h: 11200,
    hopLatencyMs: 18,
    lastHeartbeat: '3s ago',
  },
  {
    id: 'node-04',
    nodeName: 'North Gate SH-50 Perimeter Node',
    location: 'Campus Security Watchtower',
    campusZone: 'North Boundary',
    status: 'degraded',
    protocol: 'LoRa 868MHz',
    batteryPercent: 44,
    rssiDbm: -84,
    packetsRouted24h: 6320,
    hopLatencyMs: 46,
    lastHeartbeat: '18s ago',
  },
  {
    id: 'node-05',
    nodeName: 'Vengal Village Community Health Sub-Station',
    location: 'Vengal Primary Health Centre',
    campusZone: 'Vengal Village (Thiruvallur)',
    status: 'online',
    protocol: 'LoRa 868MHz',
    batteryPercent: 78,
    rssiDbm: -76,
    packetsRouted24h: 4890,
    hopLatencyMs: 38,
    lastHeartbeat: '12s ago',
  },
];

export const INITIAL_RESPONDER_TEAMS: ResponderTeam[] = [
  {
    id: 'team-01',
    callsign: 'Alpha Medic 1',
    leadName: 'Samir Pillai, Paramedic',
    unitType: 'Medical First Aid',
    currentSector: 'Academic Block A (Ramanujan)',
    assignedIncidentId: 'inc-1',
    status: 'On Scene',
    personnelCount: 4,
    radioFrequency: '433.150 MHz · Encrypted',
  },
  {
    id: 'team-02',
    callsign: 'Vengal Perimeter Patrol',
    leadName: 'Venkatesh Rao, Security Chief',
    unitType: 'Campus Security',
    currentSector: 'North Gate · SH-50 Junction',
    assignedIncidentId: 'inc-2',
    status: 'On Scene',
    personnelCount: 3,
    radioFrequency: '433.400 MHz',
  },
  {
    id: 'team-03',
    callsign: 'Aqua Relief Team B',
    leadName: 'Meenakshi Sundaram, Water Logistics',
    unitType: 'Logistics & Water',
    currentSector: 'Agastya Dining Complex',
    assignedIncidentId: 'inc-3',
    status: 'Standby',
    personnelCount: 5,
    radioFrequency: '433.850 MHz',
  },
  {
    id: 'team-04',
    callsign: 'Disaster Search Unit 09',
    leadName: 'Capt. Arun Prakash',
    unitType: 'Search & Rescue',
    currentSector: 'Vengal Lake & East Ridge',
    status: 'Standby',
    personnelCount: 6,
    radioFrequency: '434.100 MHz · Priority Ch',
  },
];

export const INITIAL_AUDIT_LOGS: AdminAuditLog[] = [
  {
    id: 'log-01',
    timestamp: '10:48:12 IST',
    actor: 'Dr. Rajesh K.',
    action: 'Dispatched Alpha Medic 1 to Ramanujan Academic Block (Heat Exhaustion incident)',
    category: 'dispatch',
    severity: 'critical',
  },
  {
    id: 'log-02',
    timestamp: '10:35:04 IST',
    actor: 'System Automation',
    action: 'North Gate SH-50 Node battery dipped below 50%; automated low-power mesh throttling engaged',
    category: 'mesh',
    severity: 'warn',
  },
  {
    id: 'log-03',
    timestamp: '10:14:55 IST',
    actor: 'Network Operator',
    action: 'Validated AES-256 peer keys across all 5 Amrita Vengal mesh repeaters',
    category: 'security',
    severity: 'info',
  },
  {
    id: 'log-04',
    timestamp: '09:50:22 IST',
    actor: 'Dr. Rajesh K.',
    action: 'Approved priority water relief quota: 2,800 Litres at Agastya Dining Depot',
    category: 'broadcast',
    severity: 'info',
  },
];
