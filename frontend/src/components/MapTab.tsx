import React, { useState, useEffect, useRef, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapBeacon, IncidentItem } from '../types';
import { getCurrentPosition } from '../services/api/geolocation';
import { getMapTileConfig } from '../services/api/config';
import { useNexusServices } from '../context/ServiceContext';
import {
  DEMO_MESH_NODES,
  DEMO_REFERENCE_LOCATION,
  getDemoMeshEdges,
  calculateDistanceMeters,
  formatGeographicDistance,
  isDemoMeshEnabled,
  setDemoMeshEnabled,
  type DemoMeshNode,
  type DemoMeshEdge,
} from '../services/demoMeshVisualization';
import { useNearbyMesh } from '../hooks/useNearbyMesh';

interface MapTabProps {
  onShowToast: (msg: string) => void;
  incidents?: IncidentItem[];
  recalibrateSignal?: number;
}

export const MapTab: React.FC<MapTabProps> = ({
  onShowToast,
  incidents = [],
  recalibrateSignal,
}) => {
  const { currentLocation, requestLocation, deviceId } = useNexusServices();
  const nearby = useNearbyMesh({ localDeviceId: deviceId });
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const [map, setMap] = useState<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const userCircleRef = useRef<L.Circle | null>(null);
  const incidentMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const navRouteRef = useRef<L.Polyline | null>(null);
  const meshLinesRef = useRef<L.Polyline | null>(null);

  // Demo Mesh & Real Peer Visualization Refs & State
  const demoMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const demoEdgesRef = useRef<L.Polyline[]>([]);
  const demoDistanceLabelsRef = useRef<L.Marker[]>([]);
  const realPeerMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const realPeerLinesRef = useRef<L.Polyline[]>([]);

  const [showDemoMesh, setShowDemoMesh] = useState<boolean>(() => isDemoMeshEnabled());
  const [selectedDemoNodeId, setSelectedDemoNodeId] = useState<string | null>(null);
  const [selectedRealPeerId, setSelectedRealPeerId] = useState<string | null>(null);

  const [selectedBeaconId, setSelectedBeaconId] = useState<string>('');
  const [isSpinningRecenter, setIsSpinningRecenter] = useState<boolean>(false);
  const [isNavigating, setIsNavigating] = useState<boolean>(false);
  const [isDarkTacticalLayer, setIsDarkTacticalLayer] = useState<boolean>(false);
  const [showSearch, setShowSearch] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showInfoModal, setShowInfoModal] = useState<boolean>(false);
  const [pingActive, setPingActive] = useState<boolean>(false);
  const [isSheetCollapsed, setIsSheetCollapsed] = useState<boolean>(false);
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
    accuracy?: number;
  } | null>(null);

  // Convert raw incidents into typed MapBeacon view models
  const dynamicBeacons: MapBeacon[] = useMemo(() => {
    if (!incidents || incidents.length === 0) return [];

    return incidents.map((inc) => {
      const beaconType: 'amber' | 'blue' | 'critical' =
        inc.badgeColor === 'error' ? 'critical' : inc.badgeColor === 'amber' ? 'amber' : 'blue';

      return {
        id: inc.id,
        type: beaconType,
        label: inc.title.slice(0, 18),
        title: inc.title,
        category: inc.category,
        sector: inc.location,
        distance: inc.distance,
        walkTime: '4m walk',
        threatLevel: inc.badgeColor === 'error' ? 'P0 Critical' : inc.badgeColor === 'amber' ? 'P1 Urgent' : 'P2 Standard',
        pos: {
          top: '50%',
          left: '50%',
        },
        responders: {
          initials: ['NX', 'R1'],
          countText: inc.hasResponded ? '1 responder assigned' : '0 responders en route',
        },
      };
    });
  }, [incidents]);

  const selectedDemoNode = useMemo<DemoMeshNode | null>(() => {
    if (!showDemoMesh || !selectedDemoNodeId) return null;
    return DEMO_MESH_NODES.find((n) => n.id === selectedDemoNodeId) || null;
  }, [showDemoMesh, selectedDemoNodeId]);

  const demoAnchorCoords: [number, number] = useMemo(() => {
    return userLocation
      ? [userLocation.latitude, userLocation.longitude]
      : [DEMO_REFERENCE_LOCATION.latitude, DEMO_REFERENCE_LOCATION.longitude];
  }, [userLocation]);

  const demoNodeDistanceToAnchor = useMemo(() => {
    if (!selectedDemoNode) return null;
    const d = calculateDistanceMeters(
      demoAnchorCoords[0],
      demoAnchorCoords[1],
      selectedDemoNode.latitude,
      selectedDemoNode.longitude
    );
    return formatGeographicDistance(d);
  }, [selectedDemoNode, demoAnchorCoords]);

  const selectedRealPeer = useMemo(() => {
    if (!selectedRealPeerId) return null;
    return nearby.connectedNodes.find((p) => p.endpointId === selectedRealPeerId) || null;
  }, [selectedRealPeerId, nearby.connectedNodes]);

  const selectedBeacon: MapBeacon | null = useMemo(() => {
    if (selectedDemoNodeId || selectedRealPeerId) return null;
    if (dynamicBeacons.length === 0) return null;
    return dynamicBeacons.find((b) => b.id === selectedBeaconId) || (selectedBeaconId ? null : dynamicBeacons[0]);
  }, [dynamicBeacons, selectedBeaconId, selectedDemoNodeId, selectedRealPeerId]);

  // Selected incident raw item
  const selectedIncident = useMemo(() => {
    if (!selectedBeacon) return null;
    return incidents.find((i) => i.id === selectedBeacon.id) || null;
  }, [selectedBeacon, incidents]);

  // Sync with global device location
  useEffect(() => {
    if (currentLocation) {
      setUserLocation(currentLocation);
    }
  }, [currentLocation]);

  // 1. Initialize Leaflet Map once
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    // Remove stale Leaflet ID on container if previously set
    if ((mapContainerRef.current as any)._leaflet_id) {
      delete (mapContainerRef.current as any)._leaflet_id;
    }

    // Default reference center: Amrita Vengal Campus or first valid incident
    const initialLat = incidents.length > 0 && incidents[0].latitude ? incidents[0].latitude : 13.2384;
    const initialLng = incidents.length > 0 && incidents[0].longitude ? incidents[0].longitude : 80.0094;

    const leafletInstance = L.map(mapContainerRef.current, {
      center: [initialLat, initialLng],
      zoom: 14,
      zoomControl: false,
      attributionControl: false,
    });

    // Default layer: OpenStreetMap Standard Street (100% Free, Zero Key, Zero Watermark)
    const initialConfig = getMapTileConfig('street');
    const streetTiles = L.tileLayer(initialConfig.url, {
      maxZoom: initialConfig.maxZoom,
      subdomains: (initialConfig.subdomains as any) || 'abc',
      attribution: initialConfig.attribution,
    }).addTo(leafletInstance);

    tileLayerRef.current = streetTiles;
    mapInstanceRef.current = leafletInstance;
    setMap(leafletInstance);

    // Initial frame of incidents
    const validCoords: [number, number][] = incidents
      .filter((i) => i.latitude !== undefined && i.longitude !== undefined)
      .map((i) => [i.latitude!, i.longitude!]);

    if (validCoords.length > 1) {
      const bounds = L.latLngBounds(validCoords);
      leafletInstance.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
    }

    // Auto-locate user on mount
    getCurrentPosition({ enableHighAccuracy: true, timeout: 8000 })
      .then((pos) => {
        if (pos.success && pos.coords) {
          setUserLocation(pos.coords);
          if (validCoords.length === 0) {
            leafletInstance.flyTo([pos.coords.latitude, pos.coords.longitude], 15, { duration: 1 });
          }
        }
      })
      .catch(() => {});

    // Invalidate size on resize
    const resizeObserver = new ResizeObserver(() => {
      leafletInstance.invalidateSize();
    });
    resizeObserver.observe(mapContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      leafletInstance.remove();
      mapInstanceRef.current = null;
      setMap(null);
    };
  }, []);

  // 2. Toggle tile layer (OpenStreetMap Street vs Dark Tactical)
  useEffect(() => {
    if (!map) return;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }

    const config = getMapTileConfig(isDarkTacticalLayer ? 'dark' : 'street');
    tileLayerRef.current = L.tileLayer(config.url, {
      maxZoom: config.maxZoom,
      subdomains: (config.subdomains as any) || 'abc',
      attribution: config.attribution,
    }).addTo(map);
  }, [map, isDarkTacticalLayer]);

  // 3. Update User Location Marker & Accuracy Circle
  useEffect(() => {
    if (!map || !userLocation) return;

    const userHtml = `
      <div class="relative flex items-center justify-center w-8 h-8">
        <span class="animate-ping absolute inline-flex h-8 w-8 rounded-full bg-[#3e90ff] opacity-40"></span>
        <span class="relative flex items-center justify-center w-5 h-5 rounded-full bg-[#1c1b1b] shadow-lg border-2 border-white">
          <span class="w-2.5 h-2.5 rounded-full bg-[#3e90ff] shadow-[0_0_10px_#3e90ff]"></span>
        </span>
      </div>
    `;

    const userIcon = L.divIcon({
      className: 'custom-leaflet-marker',
      html: userHtml,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });

    if (!userMarkerRef.current) {
      userMarkerRef.current = L.marker([userLocation.latitude, userLocation.longitude], {
        icon: userIcon,
        zIndexOffset: 1000,
      }).addTo(map);
    } else {
      userMarkerRef.current.setLatLng([userLocation.latitude, userLocation.longitude]);
    }

    if (userLocation.accuracy) {
      if (!userCircleRef.current) {
        userCircleRef.current = L.circle([userLocation.latitude, userLocation.longitude], {
          radius: Math.min(userLocation.accuracy, 250),
          color: '#3e90ff',
          fillColor: '#3e90ff',
          fillOpacity: 0.1,
          weight: 1,
        }).addTo(map);
      } else {
        userCircleRef.current.setLatLng([userLocation.latitude, userLocation.longitude]);
        userCircleRef.current.setRadius(Math.min(userLocation.accuracy, 250));
      }
    }
  }, [map, userLocation]);

  // 4. Update Incident Markers on Map & Interlink Hop Lines
  useEffect(() => {
    if (!map) return;
    map.invalidateSize();
    const existingMarkers = incidentMarkersRef.current;

    // Track active ids to remove stale ones
    const currentIds = new Set(incidents.map((i) => i.id));

    // Remove deleted incidents
    for (const [id, marker] of existingMarkers.entries()) {
      if (!currentIds.has(id)) {
        map.removeLayer(marker);
        existingMarkers.delete(id);
      }
    }

    // Add or update markers
    incidents.forEach((inc) => {
      if (inc.latitude === undefined || inc.longitude === undefined) return;

      const isSelected = selectedBeacon?.id === inc.id;
      const isCritical = inc.badgeColor === 'error';
      const isAmber = inc.badgeColor === 'amber';

      const markerHtml = `
        <div class="flex flex-col items-center group cursor-pointer transition-transform duration-200 ${
          isSelected ? 'scale-125' : 'hover:scale-110'
        }">
          <div class="relative flex items-center justify-center w-10 h-10">
            ${
              isCritical
                ? `
                <span class="absolute w-11 h-11 rounded-full bg-[#ffb4ab]/35 animate-ping"></span>
                <span class="absolute w-8 h-8 rounded-full bg-[#93000a]/60"></span>
                <span class="relative flex items-center justify-center w-7 h-7 rounded-full bg-[#1c1b1b] shadow-2xl border-2 border-[#ffb4ab]">
                  <span class="w-3.5 h-3.5 rounded-full bg-[#ef4444] shadow-[0_0_16px_#ef4444] animate-pulse"></span>
                </span>
                `
                : isAmber
                ? `
                <span class="animate-ping absolute inline-flex h-8 w-8 rounded-full bg-amber-500 opacity-40"></span>
                <span class="relative flex items-center justify-center w-7 h-7 rounded-full bg-[#1c1b1b] shadow-lg border-2 border-amber-400">
                  <span class="w-3.5 h-3.5 rounded-full bg-amber-400 shadow-[0_0_12px_#f59e0b]"></span>
                </span>
                `
                : `
                <span class="relative flex items-center justify-center w-7 h-7 rounded-full bg-[#3e90ff]/20 backdrop-blur-sm border-2 border-[#aac7ff]">
                  <span class="w-3.5 h-3.5 rounded-full bg-[#aac7ff] shadow-[0_0_12px_#3e90ff]"></span>
                </span>
                `
            }
          </div>
          <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap shadow-md mt-0.5 border ${
            isCritical
              ? 'bg-[#93000a]/95 text-[#ffdad6] border-[#ffb4ab]/50'
              : isAmber
              ? 'bg-[#1c1b1b]/95 text-amber-300 border-amber-500/50'
              : 'bg-[#1c1b1b]/95 text-[#aac7ff] border-[#3e90ff]/50'
          }">${(inc.title || 'Incident').slice(0, 16)}</span>
        </div>
      `;

      const markerIcon = L.divIcon({
        className: 'custom-leaflet-marker',
        html: markerHtml,
        iconSize: [44, 48],
        iconAnchor: [22, 24],
      });

      if (existingMarkers.has(inc.id)) {
        const marker = existingMarkers.get(inc.id)!;
        marker.setLatLng([inc.latitude, inc.longitude]);
        marker.setIcon(markerIcon);
        marker.setZIndexOffset(isSelected ? 900 : 100);
      } else {
        const marker = L.marker([inc.latitude, inc.longitude], {
          icon: markerIcon,
          zIndexOffset: isSelected ? 900 : 100,
        }).addTo(map);

        marker.on('click', () => {
          setSelectedBeaconId(inc.id);
          setIsSheetCollapsed(false);
          map.panTo([inc.latitude, inc.longitude]);
        });

        existingMarkers.set(inc.id, marker);
      }
    });

    // Mesh interlink polylines between active incident nodes
    const validCoords: [number, number][] = incidents
      .filter((i) => i.latitude !== undefined && i.longitude !== undefined)
      .map((i) => [i.latitude!, i.longitude!]);

    if (validCoords.length >= 2) {
      if (!meshLinesRef.current) {
        meshLinesRef.current = L.polyline(validCoords, {
          color: '#3e90ff',
          dashArray: '6, 6',
          weight: 2.5,
          opacity: 0.75,
        }).addTo(map);
      } else {
        meshLinesRef.current.setLatLngs(validCoords);
      }
    } else if (meshLinesRef.current) {
      map.removeLayer(meshLinesRef.current);
      meshLinesRef.current = null;
    }
  }, [map, incidents, selectedBeacon]);

  // 5. Navigation Route Line
  useEffect(() => {
    if (!map) return;

    if (isNavigating && userLocation && selectedIncident && selectedIncident.latitude && selectedIncident.longitude) {
      const routeCoords: [number, number][] = [
        [userLocation.latitude, userLocation.longitude],
        [selectedIncident.latitude, selectedIncident.longitude],
      ];

      if (!navRouteRef.current) {
        navRouteRef.current = L.polyline(routeCoords, {
          color: '#3e90ff',
          dashArray: '8, 6',
          weight: 3.5,
          opacity: 0.85,
        }).addTo(map);
      } else {
        navRouteRef.current.setLatLngs(routeCoords);
      }
    } else if (navRouteRef.current) {
      map.removeLayer(navRouteRef.current);
      navRouteRef.current = null;
    }
  }, [map, isNavigating, userLocation, selectedIncident]);

  // 6. Update Demo Mesh Markers and Edges (Dashed Purple: Rule 9 & 10)
  useEffect(() => {
    if (!map) return;

    const existingDemoMarkers = demoMarkersRef.current;

    if (!showDemoMesh) {
      // Clean up all demo markers
      for (const [id, marker] of existingDemoMarkers.entries()) {
        map.removeLayer(marker);
      }
      existingDemoMarkers.clear();

      // Clean up all demo edges
      demoEdgesRef.current.forEach((polyline) => {
        map.removeLayer(polyline);
      });
      demoEdgesRef.current = [];

      // Clean up all demo distance labels
      demoDistanceLabelsRef.current.forEach((labelMarker) => {
        map.removeLayer(labelMarker);
      });
      demoDistanceLabelsRef.current = [];
      return;
    }

    // Render 3 Deterministic Demo Nodes
    DEMO_MESH_NODES.forEach((node) => {
      const isSelected = selectedDemoNodeId === node.id;

      const markerHtml = `
        <div class="flex flex-col items-center group cursor-pointer transition-transform duration-200 ${
          isSelected ? 'scale-125' : 'hover:scale-110'
        }">
          <div class="relative flex items-center justify-center w-10 h-10">
            <span class="absolute w-10 h-10 rounded-full bg-[#a855f7]/25 animate-pulse"></span>
            <span class="relative flex items-center justify-center w-7 h-7 rounded-full bg-[#1c1b1b] shadow-xl border-2 border-dashed ${
              isSelected ? 'border-[#e9d5ff] scale-105' : 'border-[#c084fc]'
            }">
              <span class="w-3 h-3 rounded-full bg-[#c084fc] shadow-[0_0_12px_#a855f7]"></span>
            </span>
          </div>
          <span class="px-2 py-0.5 rounded-full text-[9px] font-bold font-mono whitespace-nowrap shadow-md mt-0.5 bg-[#2e1065]/95 text-[#d8b4fe] border border-[#a855f7]/50">
            ${node.label}
          </span>
        </div>
      `;

      const markerIcon = L.divIcon({
        className: 'custom-leaflet-marker',
        html: markerHtml,
        iconSize: [44, 48],
        iconAnchor: [22, 24],
      });

      if (existingDemoMarkers.has(node.id)) {
        const marker = existingDemoMarkers.get(node.id)!;
        marker.setLatLng([node.latitude, node.longitude]);
        marker.setIcon(markerIcon);
        marker.setZIndexOffset(isSelected ? 950 : 150);
      } else {
        const marker = L.marker([node.latitude, node.longitude], {
          icon: markerIcon,
          zIndexOffset: isSelected ? 950 : 150,
        }).addTo(map);

        marker.on('click', () => {
          setSelectedDemoNodeId(node.id);
          setSelectedBeaconId('');
          setSelectedRealPeerId(null);
          setIsSheetCollapsed(false);
          map.panTo([node.latitude, node.longitude]);
        });

        existingDemoMarkers.set(node.id, marker);
      }
    });

    // Render Demo Topology Edges (Dashed Purple: rule 9 & 10) & Distance Labels
    const anchorCoords: [number, number] = userLocation
      ? [userLocation.latitude, userLocation.longitude]
      : [DEMO_REFERENCE_LOCATION.latitude, DEMO_REFERENCE_LOCATION.longitude];

    const edges = getDemoMeshEdges(anchorCoords);

    // Remove old polylines
    demoEdgesRef.current.forEach((p) => map.removeLayer(p));
    demoEdgesRef.current = [];

    // Remove old distance labels
    demoDistanceLabelsRef.current.forEach((l) => map.removeLayer(l));
    demoDistanceLabelsRef.current = [];

    // Create new polylines and distance labels for each demo edge
    edges.forEach((edge) => {
      const polyline = L.polyline([edge.fromCoords, edge.toCoords], {
        color: '#a855f7',
        dashArray: '4, 8',
        weight: 2,
        opacity: 0.7,
      }).addTo(map);

      demoEdgesRef.current.push(polyline);

      // Render subtle geographic distance label at edge midpoint
      const labelHtml = `
        <div class="px-1.5 py-0.5 rounded-md text-[9px] font-mono font-bold tracking-tight shadow-md whitespace-nowrap bg-[#1c1b1b]/95 text-[#d8b4fe] border border-[#a855f7]/50 backdrop-blur-md pointer-events-none flex items-center gap-1 select-none">
          <span class="w-1.5 h-1.5 rounded-full bg-[#c084fc]"></span>
          <span>${edge.formattedDistance}</span>
        </div>
      `;

      const labelIcon = L.divIcon({
        className: 'custom-demo-distance-label',
        html: labelHtml,
        iconSize: [52, 18],
        iconAnchor: [26, 9],
      });

      const labelMarker = L.marker(edge.midpointCoords, {
        icon: labelIcon,
        interactive: false,
        zIndexOffset: 120,
      }).addTo(map);

      demoDistanceLabelsRef.current.push(labelMarker);
    });
  }, [map, showDemoMesh, selectedDemoNodeId, userLocation]);

  // 7. Update Real Physical Nearby Peer Markers and Connections (Solid Green: rule 9 & 14)
  useEffect(() => {
    if (!map) return;

    const existingRealMarkers = realPeerMarkersRef.current;
    const connectedPeers = nearby.connectedNodes;
    const activePeerIds = new Set(connectedPeers.map((p) => p.endpointId));

    // Remove disconnected peers
    for (const [id, marker] of existingRealMarkers.entries()) {
      if (!activePeerIds.has(id)) {
        map.removeLayer(marker);
        existingRealMarkers.delete(id);
      }
    }

    // Clean up old real peer lines
    realPeerLinesRef.current.forEach((l) => map.removeLayer(l));
    realPeerLinesRef.current = [];

    if (!userLocation || connectedPeers.length === 0) {
      return;
    }

    // Offset connected peers slightly (~12-15m) so they don't visually occlude the user marker if co-located
    connectedPeers.forEach((peer, idx) => {
      const angle = (idx * Math.PI * 2) / Math.max(connectedPeers.length, 1);
      const peerLat = userLocation.latitude + (Math.sin(angle) * 15) / 111139;
      const peerLng = userLocation.longitude + (Math.cos(angle) * 15) / 108172;

      const isSelected = selectedRealPeerId === peer.endpointId;

      const markerHtml = `
        <div class="flex flex-col items-center group cursor-pointer transition-transform duration-200 ${
          isSelected ? 'scale-125' : 'hover:scale-110'
        }">
          <div class="relative flex items-center justify-center w-10 h-10">
            <span class="absolute w-10 h-10 rounded-full bg-[#47e266]/30 animate-ping"></span>
            <span class="relative flex items-center justify-center w-7 h-7 rounded-full bg-[#1c1b1b] shadow-xl border-2 ${
              isSelected ? 'border-white scale-105' : 'border-[#47e266]'
            }">
              <span class="w-3.5 h-3.5 rounded-full bg-[#47e266] shadow-[0_0_12px_#47e266]"></span>
            </span>
          </div>
          <span class="px-2 py-0.5 rounded-full text-[9px] font-bold font-mono whitespace-nowrap shadow-md mt-0.5 bg-[#142e1d]/95 text-[#47e266] border border-[#2f6f3a]">
            REAL PEER · ${peer.endpointName}
          </span>
        </div>
      `;

      const markerIcon = L.divIcon({
        className: 'custom-leaflet-marker',
        html: markerHtml,
        iconSize: [44, 48],
        iconAnchor: [22, 24],
      });

      if (existingRealMarkers.has(peer.endpointId)) {
        const marker = existingRealMarkers.get(peer.endpointId)!;
        marker.setLatLng([peerLat, peerLng]);
        marker.setIcon(markerIcon);
        marker.setZIndexOffset(isSelected ? 990 : 200);
      } else {
        const marker = L.marker([peerLat, peerLng], {
          icon: markerIcon,
          zIndexOffset: isSelected ? 990 : 200,
        }).addTo(map);

        marker.on('click', () => {
          setSelectedRealPeerId(peer.endpointId);
          setSelectedBeaconId('');
          setSelectedDemoNodeId(null);
          setIsSheetCollapsed(false);
          map.panTo([peerLat, peerLng]);
        });

        existingRealMarkers.set(peer.endpointId, marker);
      }

      // Draw SOLID GREEN line between user and real peer (Rule #9: Real physical connection = solid green)
      const line = L.polyline(
        [
          [userLocation.latitude, userLocation.longitude],
          [peerLat, peerLng],
        ],
        {
          color: '#47e266',
          weight: 3,
          opacity: 0.9,
        }
      ).addTo(map);

      realPeerLinesRef.current.push(line);
    });
  }, [map, nearby.connectedNodes, userLocation, selectedRealPeerId]);

  // Fit perimeter across all nodes (Rule 16: demo coordinates included only while showDemoMesh is ON)
  const fitPerimeter = () => {
    if (!map) return;
    map.invalidateSize();
    const validCoords: [number, number][] = incidents
      .filter((i) => i.latitude !== undefined && i.longitude !== undefined)
      .map((i) => [i.latitude!, i.longitude!]);

    if (userLocation) {
      validCoords.push([userLocation.latitude, userLocation.longitude]);
    }

    // Only include demo coordinates if Demo Mesh is ON (Rule 16)
    if (showDemoMesh) {
      DEMO_MESH_NODES.forEach((d) => {
        validCoords.push([d.latitude, d.longitude]);
      });
    }

    if (validCoords.length > 1) {
      const bounds = L.latLngBounds(validCoords);
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 });
      onShowToast(`Tactical perimeter fit: ${validCoords.length} nodes in view`);
    } else if (validCoords.length === 1) {
      map.flyTo(validCoords[0], 15, { duration: 0.8 });
      onShowToast(`Centered on tactical node`);
    } else {
      map.flyTo([13.2384, 80.0094], 15, { duration: 0.8 });
      onShowToast('Centered on Amrita Vengal Campus Hub');
    }
  };

  // Recalibrate trigger from AdminDashboard
  useEffect(() => {
    if (recalibrateSignal && recalibrateSignal > 0) {
      fitPerimeter();
    }
  }, [recalibrateSignal]);

  const handleToggleDemoMesh = () => {
    const next = !showDemoMesh;
    setShowDemoMesh(next);
    setDemoMeshEnabled(next);
    if (next) {
      onShowToast('Demo Mesh: Active (3 Simulated Nodes · ~50-90m)');
    } else {
      if (selectedDemoNodeId) {
        setSelectedDemoNodeId(null);
      }
      onShowToast('Demo Mesh: Disabled (Real network only)');
    }
  };

  const handleRecenter = async () => {
    setIsSpinningRecenter(true);
    try {
      const res = await requestLocation(true);
      if (res.success && res.coords) {
        setUserLocation(res.coords);
        if (mapInstanceRef.current) {
          mapInstanceRef.current.flyTo([res.coords.latitude, res.coords.longitude], 16, { duration: 1.2 });
        }
        onShowToast(`GPS locked: ${res.coords.latitude.toFixed(4)}, ${res.coords.longitude.toFixed(4)} (±${res.coords.accuracy}m)`);
      } else if (currentLocation && mapInstanceRef.current) {
        mapInstanceRef.current.flyTo([currentLocation.latitude, currentLocation.longitude], 15, { duration: 1 });
        onShowToast(`Centered on ${currentLocation.source === 'CACHED' ? 'cached' : 'manual'} position`);
      } else {
        onShowToast(`GPS notice: ${res.error || 'Coordinates unavailable'}`);
      }
    } catch {
      if (currentLocation && mapInstanceRef.current) {
        mapInstanceRef.current.flyTo([currentLocation.latitude, currentLocation.longitude], 15, { duration: 1 });
      }
      onShowToast('Could not acquire fresh GPS fix');
    } finally {
      setIsSpinningRecenter(false);
    }
  };

  const handleZoomIn = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.zoomIn();
    }
  };

  const handleZoomOut = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.zoomOut();
    }
  };

  const handleToggleNav = () => {
    if (!selectedBeacon) return;
    if (!isNavigating) {
      setIsNavigating(true);
      onShowToast(`Offline turn-by-turn started for ${selectedBeacon.title}`);
    } else {
      setIsNavigating(false);
      onShowToast('Offline navigation cancelled');
    }
  };

  const handlePingResponders = () => {
    if (!selectedBeacon) return;
    setPingActive(true);
    onShowToast(`Contactless peer ping sent to responders at ${selectedBeacon.sector}`);
    setTimeout(() => setPingActive(false), 800);
  };

  const filteredBeacons = searchQuery.trim()
    ? dynamicBeacons.filter(b => b.title.toLowerCase().includes(searchQuery.toLowerCase()) || b.label.toLowerCase().includes(searchQuery.toLowerCase()))
    : dynamicBeacons;

  return (
    <div className="flex flex-col w-full h-full flex-1 min-h-0 relative overflow-hidden select-none bg-[#0e0e0e]">
      {/* Real Dynamic Leaflet Map Container */}
      <div
        ref={mapContainerRef}
        className="absolute inset-0 w-full h-full z-0 bg-[#0e0e0e]"
      />

      {/* Top Gradient Scrim */}
      <div className="pointer-events-none absolute top-0 inset-x-0 h-28 bg-gradient-to-b from-[#131313]/90 via-[#131313]/40 to-transparent z-10" />

      {/* Top Controls Header */}
      <div className="absolute top-3 inset-x-3 flex flex-col gap-2 z-20 pointer-events-none">
        <div className="flex items-center justify-between w-full gap-2">
          {/* Left Controls: Status Chip & Demo Mesh Toggle */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Status Chip */}
            <div className="pointer-events-auto flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#1c1b1b]/95 backdrop-blur-xl shadow-lg border border-[#2a2a2a]">
              <span className="w-2 h-2 rounded-full bg-[#47e266] animate-pulse" />
              <span className="text-[12px] text-[#e5e2e1] font-semibold">
                {userLocation
                  ? `GPS: ${userLocation.latitude.toFixed(3)}, ${userLocation.longitude.toFixed(3)}`
                  : 'Offline Tactical Map'}
              </span>
            </div>

            {/* Demo Mesh Toggle Button */}
            <button
              aria-label="Toggle Demo Mesh Visualization"
              onClick={handleToggleDemoMesh}
              className={`pointer-events-auto flex items-center gap-1.5 px-2.5 py-1.5 rounded-full backdrop-blur-xl shadow-lg border text-[11px] font-bold transition-all active:scale-95 cursor-pointer ${
                showDemoMesh
                  ? 'bg-[#581c87]/90 text-[#f3e8ff] border-[#a855f7] shadow-[0_0_12px_rgba(168,85,247,0.35)]'
                  : 'bg-[#1c1b1b]/95 text-[#8b91a0] border-[#2a2a2a] hover:text-[#e5e2e1]'
              }`}
              type="button"
              title={showDemoMesh ? 'Demo Mesh Topology: ON (Click to disable)' : 'Demo Mesh Topology: OFF (Click to enable)'}
            >
              <span className="material-symbols-outlined text-[15px]">
                {showDemoMesh ? 'hub' : 'device_hub'}
              </span>
              <span>{showDemoMesh ? 'Demo Mesh: ON' : 'Demo Mesh: OFF'}</span>
            </button>
          </div>

          {/* Right Controls Stack */}
          <div className="pointer-events-auto flex items-center gap-1.5">
            {/* Zoom In Button */}
            <button
              aria-label="Zoom in"
              onClick={handleZoomIn}
              className="w-9 h-9 rounded-xl bg-[#1c1b1b]/90 backdrop-blur-xl shadow-md flex items-center justify-center text-[#e5e2e1] hover:bg-[#2a2a2a] active:scale-95 transition-all cursor-pointer border border-[#2a2a2a]"
              type="button"
              title="Zoom in"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
            </button>

            {/* Zoom Out Button */}
            <button
              aria-label="Zoom out"
              onClick={handleZoomOut}
              className="w-9 h-9 rounded-xl bg-[#1c1b1b]/90 backdrop-blur-xl shadow-md flex items-center justify-center text-[#e5e2e1] hover:bg-[#2a2a2a] active:scale-95 transition-all cursor-pointer border border-[#2a2a2a]"
              type="button"
              title="Zoom out"
            >
              <span className="material-symbols-outlined text-[18px]">remove</span>
            </button>

            {/* Search Pill */}
            {dynamicBeacons.length > 0 && (
              <button
                aria-label="Search map"
                onClick={() => setShowSearch(!showSearch)}
                className={`w-9 h-9 rounded-xl backdrop-blur-xl shadow-md flex items-center justify-center transition-all active:scale-95 cursor-pointer border ${
                  showSearch ? 'bg-[#3e90ff] text-[#002957] border-[#3e90ff]' : 'bg-[#1c1b1b]/90 text-[#e5e2e1] hover:bg-[#2a2a2a] border-[#2a2a2a]'
                }`}
                type="button"
                title="Search Beacons"
              >
                <span className="material-symbols-outlined text-[18px]">search</span>
              </button>
            )}

            {/* Layers Toggle (Street Map vs Dark Tactical) */}
            <button
              aria-label="Toggle map layer style"
              onClick={() => {
                const next = !isDarkTacticalLayer;
                setIsDarkTacticalLayer(next);
                onShowToast(next ? 'Dark Tactical map active' : 'Street Map tiles active');
              }}
              className={`w-9 h-9 rounded-xl backdrop-blur-xl shadow-md flex items-center justify-center transition-all active:scale-95 cursor-pointer border ${
                isDarkTacticalLayer ? 'bg-[#2a2a2a] text-[#aac7ff] border-[#3e90ff]/50' : 'bg-[#1c1b1b]/90 text-[#8b91a0] border-[#2a2a2a]'
              }`}
              id="layer-btn"
              type="button"
              title={isDarkTacticalLayer ? 'Switch to Street Map' : 'Switch to Dark Tactical'}
            >
              <span className="material-symbols-outlined text-[18px]">layers</span>
            </button>

            {/* Fit Perimeter / All Nodes Button */}
            <button
              aria-label="Fit all nodes"
              onClick={fitPerimeter}
              className="w-9 h-9 rounded-xl bg-[#1c1b1b]/90 backdrop-blur-xl shadow-md flex items-center justify-center text-[#aac7ff] hover:bg-[#2a2a2a] transition-all active:scale-95 cursor-pointer border border-[#2a2a2a]"
              type="button"
              title="Fit Perimeter (All Hops & Beacons)"
            >
              <span className="material-symbols-outlined text-[18px]">fit_screen</span>
            </button>

            {/* Use My Location / GPS Pill */}
            <button
              aria-label="Use My Location"
              onClick={handleRecenter}
              className={`w-9 h-9 rounded-xl bg-[#1c1b1b]/90 backdrop-blur-xl shadow-md flex items-center justify-center text-[#aac7ff] hover:bg-[#2a2a2a] transition-all active:scale-95 cursor-pointer border border-[#2a2a2a] ${
                isSpinningRecenter ? 'rotate-180 duration-500' : ''
              }`}
              id="recenter-btn"
              type="button"
              title="Use My Location"
            >
              <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                my_location
              </span>
            </button>
          </div>
        </div>

        {/* Quick Beacon Switcher Carousel (when incidents exist) */}
        {dynamicBeacons.length > 0 && (
          <div className="pointer-events-auto flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            {dynamicBeacons.map((beacon) => {
              const isSelected = beacon.id === selectedBeacon?.id;
              return (
                <button
                  key={beacon.id}
                  onClick={() => {
                    setSelectedBeaconId(beacon.id);
                    setIsSheetCollapsed(false);
                    const inc = incidents.find((i) => i.id === beacon.id);
                    if (inc && inc.latitude !== undefined && inc.longitude !== undefined && mapInstanceRef.current) {
                      mapInstanceRef.current.flyTo([inc.latitude, inc.longitude], 15, { duration: 0.8 });
                    }
                  }}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all whitespace-nowrap cursor-pointer border shadow-sm ${
                    isSelected
                      ? beacon.type === 'critical'
                        ? 'bg-[#93000a] text-[#ffdad6] border-[#ffb4ab]/60'
                        : beacon.type === 'amber'
                        ? 'bg-amber-950 text-amber-200 border-amber-400/60'
                        : 'bg-[#002957] text-[#aac7ff] border-[#3e90ff]/60'
                      : 'bg-[#1c1b1b]/90 text-[#c0c6d6] border-[#2a2a2a] hover:bg-[#2a2a2a]'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    beacon.type === 'critical' ? 'bg-[#ffb4ab]' : beacon.type === 'amber' ? 'bg-amber-400' : 'bg-[#3e90ff]'
                  }`} />
                  <span>{beacon.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Empty State Banner when no incidents in Dexie, no Demo Mesh active, and no real Nearby peers connected */}
      {dynamicBeacons.length === 0 && !showDemoMesh && nearby.connectedCount === 0 && (
        <div className="absolute top-20 inset-x-4 z-20 flex flex-col items-center justify-center py-4 px-5 rounded-2xl bg-[#1c1b1b]/90 backdrop-blur-md border border-[#2a2a2a] text-center shadow-xl">
          <div className="w-9 h-9 rounded-full bg-[#201f1f] flex items-center justify-center text-[#8b91a0] mb-2">
            <span className="material-symbols-outlined text-[20px]">radar</span>
          </div>
          <span className="text-[13px] font-bold text-[#e5e2e1] uppercase tracking-wider mb-0.5">
            No reported incidents nearby
          </span>
          <p className="text-[11.5px] text-[#8b91a0] max-w-[260px] leading-relaxed">
            Perimeter clear. Reports created on this node or received via mesh will populate on the map in real-time.
          </p>
        </div>
      )}

      {/* Quick Search Overlay */}
      {showSearch && dynamicBeacons.length > 0 && (
        <div className="absolute top-20 inset-x-3 z-30 bg-[#1c1b1b]/95 backdrop-blur-2xl rounded-2xl p-3 shadow-2xl border border-[#2a2a2a]">
          <div className="flex items-center gap-2 bg-[#131313] px-3 py-1.5 rounded-xl border border-[#2a2a2a]">
            <span className="material-symbols-outlined text-[18px] text-[#8b91a0]">search</span>
            <input
              type="text"
              placeholder="Search active incidents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-transparent text-xs text-[#e5e2e1] placeholder-[#8b91a0] focus:outline-none"
              autoFocus
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="text-[#8b91a0] text-xs cursor-pointer">Clear</button>
            )}
          </div>
          <div className="mt-2 space-y-1 max-h-36 overflow-y-auto">
            {filteredBeacons.map(b => (
              <div
                key={b.id}
                onClick={() => {
                  setSelectedBeaconId(b.id);
                  setShowSearch(false);
                  setIsSheetCollapsed(false);
                  const inc = incidents.find(i => i.id === b.id);
                  if (inc && inc.latitude !== undefined && inc.longitude !== undefined && mapInstanceRef.current) {
                    mapInstanceRef.current.flyTo([inc.latitude, inc.longitude], 15, { duration: 0.8 });
                  }
                }}
                className="p-2 rounded-lg hover:bg-[#2a2a2a] text-xs text-[#e5e2e1] flex items-center justify-between cursor-pointer"
              >
                <span className="font-medium">{b.title}</span>
                <span className="text-[10px] text-[#c0c6d6] font-mono">{b.distance}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Floating Bottom Sheet */}
      <div className="mt-auto z-30 w-full px-2.5 pb-2.5">
        <div className="w-full max-w-md mx-auto rounded-3xl bg-[#1c1b1b]/95 backdrop-blur-2xl shadow-[0_15px_40px_rgba(0,0,0,0.7)] p-4 transition-all duration-300 ease-out border border-[#2a2a2a]">
          {selectedDemoNode ? (
            <>
              {/* Tactile Drag Handle */}
              <button
                onClick={() => setIsSheetCollapsed(!isSheetCollapsed)}
                className="w-full flex items-center justify-center py-1 -mt-1 mb-2 group cursor-pointer focus:outline-none"
                title={isSheetCollapsed ? 'Expand panel' : 'Collapse panel'}
              >
                <div className="w-10 h-1 rounded-full bg-[#414754] group-hover:bg-[#c084fc] transition-colors" />
              </button>

              {isSheetCollapsed ? (
                /* Collapsed Demo Node State */
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#c084fc] shrink-0 animate-pulse" />
                    <div className="flex flex-col truncate">
                      <span className="text-[14px] font-bold text-[#e5e2e1] truncate">{selectedDemoNode.title}</span>
                      <span className="text-[11px] text-[#d8b4fe]">{selectedDemoNode.role} · {selectedDemoNode.offsetDescription}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setSelectedDemoNodeId(null)}
                      className="px-2.5 py-1.5 rounded-xl font-semibold text-xs bg-[#2a2a2a] text-[#e5e2e1] hover:bg-[#353535] cursor-pointer"
                    >
                      Deselect
                    </button>
                    <button
                      onClick={() => setIsSheetCollapsed(false)}
                      className="w-8 h-8 rounded-xl bg-[#2a2a2a] text-[#e5e2e1] flex items-center justify-center cursor-pointer"
                      title="Expand"
                    >
                      <span className="material-symbols-outlined text-[18px]">expand_less</span>
                    </button>
                  </div>
                </div>
              ) : (
                /* Expanded Demo Node State */
                <>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#c084fc] animate-pulse" />
                        <span className="text-[17px] text-[#e5e2e1] font-bold tracking-tight">
                          {selectedDemoNode.title}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[12px] text-[#c0c6d6]">
                        <span>{selectedDemoNode.role}</span>
                        <span className="text-[#8b91a0]">•</span>
                        <span className="text-[#d8b4fe] font-mono">{selectedDemoNode.offsetDescription}</span>
                      </div>
                    </div>

                    {/* Demo Visualization Pill */}
                    <div className="px-2.5 py-1 rounded-full flex items-center gap-1 shadow-sm shrink-0 bg-[#3b0764] text-[#d8b4fe] border border-[#a855f7]/60">
                      <span className="material-symbols-outlined text-[13px]">science</span>
                      <span className="text-[10px] font-bold uppercase tracking-wider">DEMO NODE</span>
                    </div>
                  </div>

                  {/* Demo Telemetry Bar */}
                  <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-[#201f1f] mb-2 border border-[#3b0764]/60">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[16px] text-[#c084fc]">battery_charging_full</span>
                      <span className="text-[12px] text-[#e5e2e1] font-mono">{selectedDemoNode.details.battery}</span>
                      <span className="text-[#8b91a0] text-xs">•</span>
                      <span className="text-[11px] text-[#c0c6d6]">{selectedDemoNode.details.simulatedSignal}</span>
                    </div>
                    <span className="text-[10px] font-mono text-[#a855f7] bg-[#2e1065] px-2 py-0.5 rounded border border-[#a855f7]/40">
                      isDemo: true
                    </span>
                  </div>

                  {/* Geographic Distance Callout (Not Radio Range) */}
                  <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-[#181226] mb-2.5 border border-[#a855f7]/30 text-xs">
                    <span className="text-[#c0c6d6]">Geographic distance from local anchor:</span>
                    <span className="font-mono font-bold text-[#d8b4fe]">{demoNodeDistanceToAnchor}</span>
                  </div>

                  {/* Isolation Assurance Banner */}
                  <p className="text-[11px] text-[#8b91a0] leading-relaxed mb-3 bg-[#131313] p-2.5 rounded-xl border border-[#2a2a2a]">
                    ℹ️ <strong>Geographic Demo Visualization Only:</strong> {selectedDemoNode.details.description} Not participating in radio mesh.
                  </p>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSelectedDemoNodeId(null)}
                      className="flex-1 h-11 rounded-xl font-bold text-[13px] bg-[#2a2a2a] text-[#e5e2e1] hover:bg-[#353535] transition-all cursor-pointer flex items-center justify-center gap-1.5"
                      type="button"
                    >
                      <span className="material-symbols-outlined text-[16px]">close</span>
                      <span>Deselect Demo Node</span>
                    </button>
                    <button
                      aria-label="Demo Node Details"
                      onClick={() => setShowInfoModal(true)}
                      className="w-11 h-11 rounded-xl bg-[#2a2a2a] text-[#e5e2e1] flex items-center justify-center hover:bg-[#3a3939] active:scale-95 transition-all cursor-pointer border border-[#2a2a2a] shrink-0"
                      type="button"
                      title="Demo Node Details"
                    >
                      <span className="material-symbols-outlined text-[20px]">info</span>
                    </button>
                    <button
                      aria-label="Collapse panel"
                      onClick={() => setIsSheetCollapsed(true)}
                      className="w-11 h-11 rounded-xl bg-[#201f1f] text-[#8b91a0] hover:text-[#e5e2e1] flex items-center justify-center hover:bg-[#2a2a2a] active:scale-95 transition-all cursor-pointer border border-[#2a2a2a] shrink-0"
                      type="button"
                      title="Minimize Panel"
                    >
                      <span className="material-symbols-outlined text-[20px]">expand_more</span>
                    </button>
                  </div>
                </>
              )}
            </>
          ) : selectedRealPeer ? (
            <>
              {/* Real Physical Nearby Peer State */}
              <button
                onClick={() => setIsSheetCollapsed(!isSheetCollapsed)}
                className="w-full flex items-center justify-center py-1 -mt-1 mb-2 group cursor-pointer focus:outline-none"
                title={isSheetCollapsed ? 'Expand panel' : 'Collapse panel'}
              >
                <div className="w-10 h-1 rounded-full bg-[#414754] group-hover:bg-[#47e266] transition-colors" />
              </button>

              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex flex-col">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#47e266] animate-ping" />
                    <span className="text-[17px] text-[#e5e2e1] font-bold tracking-tight">
                      {selectedRealPeer.endpointName}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[12px] text-[#c0c6d6]">
                    <span>Real Physical Radio Peer</span>
                    <span className="text-[#8b91a0]">•</span>
                    <span className="text-[#47e266] font-mono">{selectedRealPeer.status}</span>
                  </div>
                </div>

                <div className="px-2.5 py-1 rounded-full flex items-center gap-1 shadow-sm shrink-0 bg-[#142e1d] text-[#47e266] border border-[#2f6f3a]">
                  <span className="material-symbols-outlined text-[13px]">nearby</span>
                  <span className="text-[10px] font-bold uppercase tracking-wider">REAL PEER</span>
                </div>
              </div>

              <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-[#201f1f] mb-3 border border-[#2f6f3a]/60 text-xs text-[#c0c6d6]">
                <span>Endpoint ID: <strong className="font-mono text-[#e5e2e1]">{selectedRealPeer.endpointId}</strong></span>
                <span className="text-[#47e266] font-semibold">Solid Green Link</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedRealPeerId(null)}
                  className="flex-1 h-11 rounded-xl font-bold text-[13px] bg-[#2a2a2a] text-[#e5e2e1] hover:bg-[#353535] transition-all cursor-pointer flex items-center justify-center gap-1.5"
                  type="button"
                >
                  <span className="material-symbols-outlined text-[16px]">close</span>
                  <span>Deselect Peer</span>
                </button>
                <button
                  aria-label="Peer Details"
                  onClick={() => setShowInfoModal(true)}
                  className="w-11 h-11 rounded-xl bg-[#2a2a2a] text-[#e5e2e1] flex items-center justify-center hover:bg-[#3a3939] active:scale-95 transition-all cursor-pointer border border-[#2a2a2a] shrink-0"
                  type="button"
                  title="Peer Details"
                >
                  <span className="material-symbols-outlined text-[20px]">info</span>
                </button>
                <button
                  aria-label="Collapse panel"
                  onClick={() => setIsSheetCollapsed(true)}
                  className="w-11 h-11 rounded-xl bg-[#201f1f] text-[#8b91a0] hover:text-[#e5e2e1] flex items-center justify-center hover:bg-[#2a2a2a] active:scale-95 transition-all cursor-pointer border border-[#2a2a2a] shrink-0"
                  type="button"
                  title="Minimize Panel"
                >
                  <span className="material-symbols-outlined text-[20px]">expand_more</span>
                </button>
              </div>
            </>
          ) : selectedBeacon ? (
            <>
              {/* Tactile Drag & Toggle Handle */}
              <button
                onClick={() => setIsSheetCollapsed(!isSheetCollapsed)}
                className="w-full flex items-center justify-center py-1 -mt-1 mb-2 group cursor-pointer focus:outline-none"
                title={isSheetCollapsed ? 'Expand panel' : 'Collapse panel'}
              >
                <div className="w-10 h-1 rounded-full bg-[#414754] group-hover:bg-[#aac7ff] transition-colors" />
              </button>

              {/* Collapsed Compact State */}
              {isSheetCollapsed ? (
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                      selectedBeacon.type === 'critical' ? 'bg-[#ffb4ab] animate-pulse' : selectedBeacon.type === 'amber' ? 'bg-amber-400' : 'bg-[#3e90ff]'
                    }`} />
                    <div className="flex flex-col truncate">
                      <span className="text-[14px] font-bold text-[#e5e2e1] truncate">{selectedBeacon.title}</span>
                      <span className="text-[11px] text-[#c0c6d6]">{selectedBeacon.sector} · {selectedBeacon.distance}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={handleToggleNav}
                      className={`px-3 py-1.5 rounded-xl font-semibold text-xs flex items-center gap-1 cursor-pointer ${
                        isNavigating ? 'bg-[#00531a] text-[#6cff82]' : 'bg-[#3e90ff] text-[#002957]'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[16px]">near_me</span>
                      <span>{isNavigating ? 'Navigating' : 'Navigate'}</span>
                    </button>
                    <button
                      onClick={() => setIsSheetCollapsed(false)}
                      className="w-8 h-8 rounded-xl bg-[#2a2a2a] text-[#e5e2e1] flex items-center justify-center cursor-pointer"
                      title="Expand"
                    >
                      <span className="material-symbols-outlined text-[18px]">expand_less</span>
                    </button>
                  </div>
                </div>
              ) : (
                /* Expanded Full State */
                <>
                  {/* Incident Header */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={`w-2.5 h-2.5 rounded-full ${
                          selectedBeacon.type === 'critical' ? 'bg-[#ffb4ab] animate-pulse' : selectedBeacon.type === 'amber' ? 'bg-amber-400' : 'bg-[#3e90ff]'
                        }`} />
                        <span className="text-[17px] text-[#e5e2e1] font-bold tracking-tight">
                          {selectedBeacon.title}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[12px] text-[#c0c6d6]">
                        <span>{selectedBeacon.sector}</span>
                        <span className="text-[#8b91a0]">•</span>
                        <span>{selectedBeacon.distance}</span>
                        <span className="text-[#8b91a0]">•</span>
                        <span className="text-[#e5e2e1] font-semibold">{selectedBeacon.walkTime}</span>
                      </div>
                    </div>

                    {/* Threat Level Indicator Pill */}
                    <div className={`px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm shrink-0 ${
                      selectedBeacon.type === 'critical'
                        ? 'bg-[#93000a] text-[#ffdad6]'
                        : selectedBeacon.type === 'amber'
                        ? 'bg-amber-950/80 text-amber-300 border border-amber-500/40'
                        : 'bg-[#002957] text-[#aac7ff]'
                    }`}>
                      <span className="material-symbols-outlined text-[13px]">
                        {selectedBeacon.type === 'critical' ? 'e911_emergency' : 'warning'}
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-wider">
                        {selectedBeacon.threatLevel}
                      </span>
                    </div>
                  </div>

                  {/* Live Mesh Responder Status Bar */}
                  <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-[#201f1f] mb-3 border border-[#2a2a2a]/60">
                    <div className="flex items-center gap-2">
                      <div className="flex -space-x-1.5 overflow-hidden">
                        {selectedBeacon.responders.initials.map((init, idx) => (
                          <div
                            key={idx}
                            className={`inline-flex h-5 w-5 rounded-full text-[10px] items-center justify-center font-bold border border-[#131313] ${
                              idx === 0
                                ? 'bg-[#3e90ff] text-[#002957]'
                                : idx === 1
                                ? 'bg-[#00a73e] text-[#00320d]'
                                : 'bg-[#3a3939] text-[#e5e2e1]'
                            }`}
                          >
                            {init}
                          </div>
                        ))}
                      </div>
                      <span className="text-[12px] text-[#e5e2e1] font-medium truncate">
                        {selectedBeacon.responders.countText}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-[#47e266] text-[11px] font-medium shrink-0">
                      <span className="material-symbols-outlined text-[15px]">signal_cellular_alt</span>
                      <span>Mesh Sync</span>
                    </div>
                  </div>

                  {/* Actionable Buttons */}
                  <div className="flex items-center gap-2">
                    {/* Main Navigation Button */}
                    <button
                      onClick={handleToggleNav}
                      className={`flex-1 h-11 rounded-xl font-bold text-[14px] flex items-center justify-center gap-2 shadow-lg hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer ${
                        isNavigating
                          ? 'bg-[#00531a] text-[#6cff82] shadow-[#47e266]/20'
                          : 'bg-[#3e90ff] text-[#002957] shadow-[#3e90ff]/20'
                      }`}
                      id="start-nav-btn"
                      type="button"
                    >
                      <span
                        className={`material-symbols-outlined text-[18px] transition-transform ${isNavigating ? 'rotate-45' : ''}`}
                        style={{ fontVariationSettings: "'FILL' 1" }}
                      >
                        near_me
                      </span>
                      <span>{isNavigating ? 'Navigating (Active)' : 'Start Offline Navigation'}</span>
                    </button>

                    {/* Ping / Dispatch Quick Action Button */}
                    <button
                      aria-label="Ping Responders"
                      onClick={handlePingResponders}
                      className={`w-11 h-11 rounded-xl flex items-center justify-center active:scale-95 transition-all cursor-pointer border border-[#2a2a2a] shrink-0 ${
                        pingActive
                          ? 'bg-[#47e266] text-[#003910]'
                          : 'bg-[#2a2a2a] text-[#e5e2e1] hover:bg-[#3a3939]'
                      }`}
                      id="ping-responders-btn"
                      type="button"
                      title="Ping Responders"
                    >
                      <span className="material-symbols-outlined text-[20px]">contactless</span>
                    </button>

                    {/* Context Share / Info Button */}
                    <button
                      aria-label="More details"
                      onClick={() => setShowInfoModal(true)}
                      className="w-11 h-11 rounded-xl bg-[#2a2a2a] text-[#e5e2e1] flex items-center justify-center hover:bg-[#3a3939] active:scale-95 transition-all cursor-pointer border border-[#2a2a2a] shrink-0"
                      type="button"
                      title="Beacon Details"
                    >
                      <span className="material-symbols-outlined text-[20px]">info</span>
                    </button>

                    {/* Quick Collapse Button */}
                    <button
                      aria-label="Collapse panel"
                      onClick={() => setIsSheetCollapsed(true)}
                      className="w-11 h-11 rounded-xl bg-[#201f1f] text-[#8b91a0] hover:text-[#e5e2e1] flex items-center justify-center hover:bg-[#2a2a2a] active:scale-95 transition-all cursor-pointer border border-[#2a2a2a] shrink-0"
                      type="button"
                      title="Minimize Panel"
                    >
                      <span className="material-symbols-outlined text-[20px]">expand_more</span>
                    </button>
                  </div>
                </>
              )}
            </>
          ) : (
            /* Standby Card when no active incidents */
            <div className="flex items-center justify-between py-1">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#201f1f] flex items-center justify-center text-[#47e266]">
                  <span className="material-symbols-outlined text-[18px]">explore</span>
                </div>
                <div>
                  <h4 className="text-[13px] font-bold text-[#e5e2e1]">Tactical Grid Active</h4>
                  <p className="text-[11px] text-[#8b91a0]">
                    {userLocation
                      ? `GPS: ${userLocation.latitude.toFixed(4)}, ${userLocation.longitude.toFixed(4)}`
                      : 'GPS Ready · Standby for mesh beacons'}
                  </p>
                </div>
              </div>
              <button
                onClick={handleRecenter}
                className="px-3 py-1.5 rounded-xl bg-[#2a2a2a] hover:bg-[#353534] text-[#aac7ff] text-xs font-semibold flex items-center gap-1 cursor-pointer border border-[#3e90ff]/30"
              >
                <span className="material-symbols-outlined text-[15px]">my_location</span>
                <span>Use My Location</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Info Details Modal */}
      {showInfoModal && (
        <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#1c1b1b] border border-[#2a2a2a] rounded-3xl w-full max-w-xs p-5 shadow-2xl text-xs space-y-3 animate-in fade-in zoom-in duration-150">
            {selectedDemoNode ? (
              /* Demo Node Info View */
              <>
                <div className="flex justify-between items-center border-b border-[#2a2a2a] pb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#c084fc] animate-pulse" />
                    <span className="font-bold text-[15px] text-[#e5e2e1]">{selectedDemoNode.title}</span>
                  </div>
                  <button
                    onClick={() => setShowInfoModal(false)}
                    className="w-7 h-7 rounded-full bg-[#2a2a2a] flex items-center justify-center text-[#c0c6d6] hover:text-white cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px]">close</span>
                  </button>
                </div>
                <div className="space-y-2 text-[#c0c6d6]">
                  <div className="flex justify-between">
                    <span className="text-[#8b91a0]">Classification:</span>
                    <span className="font-semibold text-[#d8b4fe]">Demo Node (Simulation)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#8b91a0]">Simulated Role:</span>
                    <span className="font-medium text-[#e5e2e1]">{selectedDemoNode.role}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#8b91a0]">Coordinates:</span>
                    <span className="font-mono text-[#e5e2e1]">{selectedDemoNode.latitude.toFixed(6)}, {selectedDemoNode.longitude.toFixed(6)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#8b91a0]">Geographic Distance:</span>
                    <span className="font-medium text-[#e5e2e1]">{demoNodeDistanceToAnchor} (Spatial only)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#8b91a0]">Radio Status:</span>
                    <span className="font-mono text-[#aac7ff]">Not participating in radio mesh</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#8b91a0]">Isolation Flag:</span>
                    <span className="font-mono text-[#c084fc]">isDemo: true</span>
                  </div>
                </div>
                <div className="pt-2">
                  <button
                    onClick={() => setShowInfoModal(false)}
                    className="w-full py-2.5 bg-[#2a2a2a] hover:bg-[#3a3939] text-[#e5e2e1] rounded-xl font-medium cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </>
            ) : selectedRealPeer ? (
              /* Real Physical Peer Info View */
              <>
                <div className="flex justify-between items-center border-b border-[#2a2a2a] pb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#47e266] animate-ping" />
                    <span className="font-bold text-[15px] text-[#e5e2e1]">{selectedRealPeer.endpointName}</span>
                  </div>
                  <button
                    onClick={() => setShowInfoModal(false)}
                    className="w-7 h-7 rounded-full bg-[#2a2a2a] flex items-center justify-center text-[#c0c6d6] hover:text-white cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px]">close</span>
                  </button>
                </div>
                <div className="space-y-2 text-[#c0c6d6]">
                  <div className="flex justify-between">
                    <span className="text-[#8b91a0]">Transport:</span>
                    <span className="font-semibold text-[#47e266]">Android Nearby Connections</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#8b91a0]">Endpoint ID:</span>
                    <span className="font-mono text-[#e5e2e1]">{selectedRealPeer.endpointId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#8b91a0]">Connection State:</span>
                    <span className="font-medium text-[#47e266]">{selectedRealPeer.status}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#8b91a0]">Link Visual:</span>
                    <span className="font-medium text-[#47e266]">Solid Green Line</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#8b91a0]">Data Status:</span>
                    <span className="font-medium text-[#aac7ff]">Live Physical Radio</span>
                  </div>
                </div>
                <div className="pt-2">
                  <button
                    onClick={() => setShowInfoModal(false)}
                    className="w-full py-2.5 bg-[#2a2a2a] hover:bg-[#3a3939] text-[#e5e2e1] rounded-xl font-medium cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </>
            ) : selectedBeacon ? (
              /* Existing Incident Info View */
              <>
                <div className="flex justify-between items-center border-b border-[#2a2a2a] pb-2">
                  <span className="font-bold text-[15px] text-[#e5e2e1]">{selectedBeacon.title}</span>
                  <button
                    onClick={() => setShowInfoModal(false)}
                    className="w-7 h-7 rounded-full bg-[#2a2a2a] flex items-center justify-center text-[#c0c6d6] hover:text-white cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px]">close</span>
                  </button>
                </div>
                <div className="space-y-2 text-[#c0c6d6]">
                  <div className="flex justify-between">
                    <span className="text-[#8b91a0]">Sector:</span>
                    <span className="font-medium text-[#e5e2e1]">{selectedBeacon.sector}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#8b91a0]">Classification:</span>
                    <span className="font-medium text-[#e5e2e1]">{selectedBeacon.category}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#8b91a0]">Distance &amp; ETA:</span>
                    <span className="font-medium text-[#e5e2e1]">{selectedBeacon.distance} ({selectedBeacon.walkTime})</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#8b91a0]">Threat Rating:</span>
                    <span className="font-semibold text-[#ffb4ab]">{selectedBeacon.threatLevel}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#8b91a0]">Encryption:</span>
                    <span className="font-mono text-[#aac7ff]">AES-256 Mesh Local</span>
                  </div>
                </div>
                <div className="pt-2 flex gap-2">
                  <button
                    onClick={() => {
                      setShowInfoModal(false);
                      handleToggleNav();
                    }}
                    className="flex-1 py-2.5 bg-[#3e90ff] hover:bg-[#3e90ff]/90 text-[#002957] rounded-xl font-bold cursor-pointer"
                  >
                    {isNavigating ? 'Stop Navigation' : 'Start Navigation'}
                  </button>
                  <button
                    onClick={() => setShowInfoModal(false)}
                    className="px-4 py-2.5 bg-[#2a2a2a] hover:bg-[#3a3939] text-[#e5e2e1] rounded-xl font-medium cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};
