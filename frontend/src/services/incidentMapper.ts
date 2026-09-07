import type { Incident, DraftIncident, IncidentType, IncidentPriority } from '../../../shared/types';
import type { IncidentItem } from '../types';

/**
 * Calculates Haversine distance in meters between two lat/lon coordinates.
 */
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Radius of the earth in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Formats distance into human-friendly string (e.g., "350 m away", "1.2 km away").
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m away`;
  }
  return `${(meters / 1000).toFixed(1)} km away`;
}

/**
 * Formats epoch timestamp into human relative string (e.g. "Just now", "4m ago", "1h ago").
 */
export function formatRelativeTime(timestamp: number, now: number = Date.now()): string {
  const diffSec = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

/**
 * Capitalizes first letter of string.
 */
function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Maps a canonical domain Incident to the frontend view-model IncidentItem.
 */
export function incidentToViewModel(
  incident: Incident,
  userCoord?: { latitude: number; longitude: number }
): IncidentItem {
  // Determine badge color and priority label
  let badgeColor: 'error' | 'amber' | 'primary' = 'primary';
  let priorityLabel = 'Info';

  if (incident.priority === 'P0') {
    badgeColor = 'error';
    priorityLabel = 'Critical';
  } else if (incident.priority === 'P1') {
    badgeColor = 'amber';
    priorityLabel = 'Urgent';
  } else if (incident.priority === 'P2') {
    badgeColor = 'primary';
    priorityLabel = 'Resources';
  }

  const typeName = capitalize(incident.type);
  const typeLabel = `${priorityLabel} · ${typeName}`;
  const category = `${priorityLabel.toLowerCase()} ${incident.type}`.trim();

  // Format distance
  let distance = 'Local Node';
  if (userCoord) {
    const d = calculateDistanceMeters(
      userCoord.latitude,
      userCoord.longitude,
      incident.latitude,
      incident.longitude
    );
    distance = formatDistance(d);
  }

  // Parse title & description
  let title = `${typeName} Emergency`;
  let description = incident.description || 'Emergency assistance requested via NEXUS mesh node.';
  if (incident.description && incident.description.length > 0) {
    const lines = incident.description.split('\n');
    if (lines[0] && lines[0].length < 60) {
      title = lines[0];
      description = lines.slice(1).join('\n').trim() || lines[0];
    }
  }

  return {
    id: incident.incidentId,
    category,
    typeLabel,
    badgeColor,
    timeAgo: formatRelativeTime(incident.timestamp),
    title,
    description,
    distance,
    location: `Sector [${incident.latitude.toFixed(3)}, ${incident.longitude.toFixed(3)}]`,
    latitude: incident.latitude,
    longitude: incident.longitude,
    statusText: capitalize(incident.status),
    urgency: incident.priority === 'P0' ? 'High' : incident.priority === 'P1' ? 'Medium' : 'Low',
    hopsRemaining: Math.max(0, 3 - (incident.hopCount || 0)),
    peopleAffected: incident.peopleAffected,
    isVerified:
      incident.status === 'verified' ||
      incident.status === 'assigned' ||
      incident.status === 'resolved',
    hasResponded: incident.status === 'assigned',
  };
}

/**
 * Converts form or injection inputs to a validated DraftIncident.
 */
export function createDraftIncident(params: {
  type: IncidentType;
  priority?: IncidentPriority;
  latitude: number;
  longitude: number;
  peopleAffected?: number;
  description?: string;
}): DraftIncident {
  return {
    type: params.type,
    priority: params.priority,
    latitude: params.latitude,
    longitude: params.longitude,
    peopleAffected: params.peopleAffected ?? 1,
    description: params.description,
  };
}
