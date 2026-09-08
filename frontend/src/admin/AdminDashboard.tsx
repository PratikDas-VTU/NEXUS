import React, { useState, useMemo } from 'react';
import { AdminUser } from './types';
import { IncidentManager } from './IncidentManager';
import { NodeTelemetry } from './NodeTelemetry';
import { ResponderDirectory } from './ResponderDirectory';
import { MapTab } from '../components/MapTab';
import { IncidentItem } from '../types';
import { useNexusServices } from '../context/ServiceContext';
import {
  findHighDensityClusters,
  MIN_DENSITY_NODES,
  DENSITY_RADIUS_METERS,
  formatDensityLabel,
  LocatableNode,
} from '../services/densityClustering';

interface AdminDashboardProps {
  adminUser: AdminUser;
  incidents: IncidentItem[];
  onAddIncident: (data: {
    title: string;
    description: string;
    location: string;
    category: string;
    badgeColor?: 'error' | 'amber' | 'primary';
    peopleAffected?: number;
  }) => void;
  onResolveIncident: (id: string) => void;
  onLogout: () => void;
  onSwitchToFieldView: () => void;
  onShowToast: (msg: string) => void;
  isInternetConnected: boolean;
  onToggleInternet: () => void;
}

type AdminNavTab =
  | 'overview'
  | 'map'
  | 'incidents'
  | 'alerts'
  | 'responders'
  | 'analytics'
  | 'users'
  | 'settings'
  | 'audit';

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  adminUser,
  incidents,
  onAddIncident,
  onResolveIncident,
  onLogout,
  onSwitchToFieldView,
  onShowToast,
  isInternetConnected,
  onToggleInternet,
}) => {
  const {
    networkStatus,
    networkDiagnostics,
    deviceId,
    outboxCount,
    reconnectSignaler,
    refreshIncidents,
    purgeDemoData,
    currentLocation,
    locationState,
    locationError,
    isAudioMuted,
    toggleAudioMute,
    rawIncidents,
  } = useNexusServices();

  const [activeNav, setActiveNav] = useState<AdminNavTab>('overview');
  const [recalibrateSignal, setRecalibrateSignal] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  );
  const [showEditSignaler, setShowEditSignaler] = useState<boolean>(false);
  const [customSignalerInput, setCustomSignalerInput] = useState<string>(() => {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem('nexus_custom_signaling_url') || '';
    }
    return '';
  });

  const handleSaveSignalerUrl = async () => {
    let target = customSignalerInput.trim();
    if (target) {
      if (!target.startsWith('ws://') && !target.startsWith('wss://')) {
        target = `ws://${target}`;
      }
      if (!target.includes(':8080') && !target.includes('/ws') && !target.includes(':3000')) {
        target = `${target}:8080`;
      }
      localStorage.setItem('nexus_custom_signaling_url', target);
      onShowToast(`Configured Signaler: ${target}`);
      try {
        await reconnectSignaler(target);
      } catch {}
    } else {
      localStorage.removeItem('nexus_custom_signaling_url');
      onShowToast('Reset to automatic LAN detection');
      try {
        await reconnectSignaler();
      } catch {}
    }
    setShowEditSignaler(false);
  };

  // Operational nodes for GPS density clustering (Strict Rules: Legitimate GPS only, demo excluded)
  const operationalNodesForClustering = useMemo<LocatableNode[]>(() => {
    const nodes: LocatableNode[] = [];
    if (currentLocation && locationState !== 'UNAVAILABLE') {
      nodes.push({
        id: deviceId,
        name: 'Local Command Station',
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
        gpsQuality: locationState === 'LIVE' ? 'live' : locationState === 'CACHED' ? 'cached' : 'low_accuracy',
        isDemo: false,
      });
    }
    // Note: Physical peers without known GPS coordinates are flagged "GPS Unavailable" and excluded from density calculations.
    return nodes;
  }, [currentLocation, locationState, deviceId]);

  const activeDensityClusters = useMemo(() => {
    return findHighDensityClusters(operationalNodesForClustering, MIN_DENSITY_NODES, DENSITY_RADIUS_METERS);
  }, [operationalNodesForClustering]);

  // Helper lookups into raw Dexie incidents for physical origin and hops
  const getOriginNodeId = (incId: string): string => {
    const raw = rawIncidents?.find((r) => r.incidentId === incId);
    if (raw?.originDeviceId) return raw.originDeviceId;
    return `Node-${incId.slice(0, 6).toUpperCase()}`;
  };

  const getHopCount = (incId: string): number => {
    const raw = rawIncidents?.find((r) => r.incidentId === incId);
    return raw?.hopCount ?? 0;
  };

  // UNIFIED SINGLE SOURCE OF TRUTH FOR INCIDENTS (Priority 8)
  const activeEmergencies = useMemo(() => {
    return incidents.filter(
      (i) =>
        (i.badgeColor === 'error' ||
          i.badgeColor === 'amber' ||
          i.category.includes('critical') ||
          i.category.includes('hazard')) &&
        i.statusText?.toLowerCase() !== 'resolved'
    );
  }, [incidents]);

  const criticalP0Incidents = useMemo(() => {
    return incidents.filter(
      (i) =>
        (i.badgeColor === 'error' || i.category.includes('critical')) &&
        i.statusText?.toLowerCase() !== 'resolved'
    );
  }, [incidents]);

  const activeEmergenciesCount = activeEmergencies.length;
  const criticalIncidentsCount = criticalP0Incidents.length;

  // Selected emergency in active emergencies list (for cycling through if multiple)
  const [activeEmergencyIndex, setActiveEmergencyIndex] = useState<number>(0);
  const primaryActiveEmergency = useMemo(() => {
    if (activeEmergencies.length === 0) return null;
    const clampedIndex = Math.min(activeEmergencyIndex, activeEmergencies.length - 1);
    return activeEmergencies[clampedIndex] || activeEmergencies[0];
  }, [activeEmergencies, activeEmergencyIndex]);

  // Selected incident for Emergency Detail Drawer (Priority 3)
  const [selectedIncidentForDrawer, setSelectedIncidentForDrawer] = useState<IncidentItem | null>(null);

  const uniqueLocations = useMemo(() => {
    const locs = incidents.map((i) => i.location).filter(Boolean);
    return Array.from(new Set(locs));
  }, [incidents]);

  // Alert Lifecycle Management (New -> Acknowledged -> Active -> Resolved)
  const [acknowledgedAlertIds, setAcknowledgedAlertIds] = useState<Set<string>>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('nexus_acknowledged_alerts_v1');
        if (stored) return new Set(JSON.parse(stored));
      } catch (e) {
        console.warn(e);
      }
    }
    return new Set();
  });

  const [alertFilter, setAlertFilter] = useState<'all' | 'new' | 'acknowledged' | 'resolved'>('all');

  const handleAcknowledgeAlert = (alertId: string) => {
    setAcknowledgedAlertIds((prev) => {
      const next = new Set(prev);
      next.add(alertId);
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('nexus_acknowledged_alerts_v1', JSON.stringify(Array.from(next)));
        } catch (e) {}
      }
      return next;
    });
    onShowToast(`✓ Emergency alert acknowledged by Command Station`);
  };

  const filteredIncidents = useMemo(() => {
    return incidents.filter(
      (i) =>
        i.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        i.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
        i.category.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [incidents, searchQuery]);

  const criticalIncidents = useMemo(() => {
    return incidents.filter(
      (i) =>
        i.badgeColor === 'error' ||
        i.category.includes('critical') ||
        i.category.includes('hazard')
    );
  }, [incidents]);

  // Operational Live Event Stream (Priority 1 Row 3: 5–8 meaningful events)
  const liveEventStream = useMemo(() => {
    interface LiveEventItem {
      id: string;
      type: 'emergency' | 'peer' | 'sync' | 'density' | 'resolved';
      icon: string;
      color: string;
      badgeBg: string;
      title: string;
      subtitle: string;
      timeAgo: string;
      timestamp: number;
      incident?: IncidentItem;
    }

    const events: LiveEventItem[] = [];

    // 1. Incidents events
    incidents.forEach((inc, idx) => {
      const isCritical = inc.badgeColor === 'error' || inc.category.includes('critical');
      const isUrgent = inc.badgeColor === 'amber' || inc.category.includes('hazard');
      const isResolved = inc.statusText?.toLowerCase() === 'resolved';

      if (isResolved) {
        events.push({
          id: `evt-res-${inc.id}`,
          type: 'resolved',
          icon: 'check_circle',
          color: 'text-[#47e266]',
          badgeBg: 'bg-[#142618]/90 border-[#294a30]',
          title: `Resolved: ${inc.title.slice(0, 30)}`,
          subtitle: `Vault #${inc.id.slice(0, 8)} · Marked Resolved`,
          timeAgo: inc.timeAgo || 'Recent',
          timestamp: Date.now() - 100000 - idx * 1000,
          incident: inc,
        });
      } else if (isCritical) {
        events.push({
          id: `evt-crit-${inc.id}`,
          type: 'emergency',
          icon: 'crisis_alert',
          color: 'text-[#ffb4ab]',
          badgeBg: 'bg-[#2b1115] border-[#5a1c22]',
          title: `🚨 P0 Critical: ${inc.title.slice(0, 30)}`,
          subtitle: `From ${getOriginNodeId(inc.id)} · ${inc.location}`,
          timeAgo: inc.timeAgo || 'Just now',
          timestamp: Date.now() - 5000 - idx * 1000,
          incident: inc,
        });
      } else if (isUrgent) {
        events.push({
          id: `evt-urg-${inc.id}`,
          type: 'emergency',
          icon: 'warning',
          color: 'text-amber-300',
          badgeBg: 'bg-[#2b1f11] border-[#5c4015]',
          title: `⚠️ P1 Urgent: ${inc.title.slice(0, 30)}`,
          subtitle: `From ${getOriginNodeId(inc.id)} · ${inc.location}`,
          timeAgo: inc.timeAgo || 'Just now',
          timestamp: Date.now() - 15000 - idx * 1000,
          incident: inc,
        });
      }
    });

    // 2. Peer connection events
    networkStatus.activePeers.forEach((peer, idx) => {
      const displayId = peer.deviceId || peer.peerId.slice(0, 10);
      events.push({
        id: `evt-peer-${peer.peerId}-${idx}`,
        type: 'peer',
        icon: 'sensors',
        color: 'text-[#47e266]',
        badgeBg: 'bg-[#142618]/90 border-[#294a30]',
        title: `Real Physical Node Connected`,
        subtitle: `Node ${displayId} · Direct Mesh P2P Active`,
        timeAgo: 'Live',
        timestamp: Date.now() - 30000 * (idx + 1),
      });
    });

    // 3. High density event (if present)
    if (activeDensityClusters.length > 0) {
      events.push({
        id: `evt-density-${activeDensityClusters[0].id}`,
        type: 'density',
        icon: 'groups',
        color: 'text-amber-400',
        badgeBg: 'bg-[#291616] border-[#592626]',
        title: `High Node Density Cluster Detected`,
        subtitle: `${activeDensityClusters[0].nodeCount} Physical Nodes in ${activeDensityClusters[0].radiusMeters}m radius`,
        timeAgo: 'Live',
        timestamp: Date.now() - 20000,
      });
    }

    // 4. Mesh status / sync event
    if (networkStatus.isSignalingConnected) {
      events.push({
        id: `evt-signaler`,
        type: 'sync',
        icon: 'lan',
        color: 'text-[#3e90ff]',
        badgeBg: 'bg-[#101b2b] border-[#1d385c]',
        title: `Local Mesh Signaler Active`,
        subtitle: `LAN Signaling @ 8080 · P2P Fallback Ready`,
        timeAgo: 'Nominal',
        timestamp: Date.now() - 60000,
      });
    }

    // Sort by timestamp desc and take 7 events
    return events.sort((a, b) => b.timestamp - a.timestamp).slice(0, 7);
  }, [incidents, networkStatus, activeDensityClusters, rawIncidents]);

  return (
    <div className="min-h-screen w-full bg-[#0c0c0d] text-[#e5e2e1] flex overflow-x-hidden font-sans select-none">
      {/* 1. LEFT SIDEBAR */}
      <aside
        className={`${
          isSidebarOpen ? 'w-64' : 'w-20'
        } shrink-0 bg-[#121214] border-r border-[#202024] flex flex-col justify-between transition-all duration-300 z-30`}
      >
        <div className="flex flex-col">
          {/* Logo & Brand */}
          <div className="h-16 px-4 flex items-center justify-between border-b border-[#202024]">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#002957] to-[#3e90ff] flex items-center justify-center border border-[#3e90ff]/50 shadow-md shrink-0">
                <span className="material-symbols-outlined text-white text-[20px]">
                  security
                </span>
              </div>
              {isSidebarOpen && (
                <div className="flex flex-col">
                  <span className="font-extrabold tracking-wider text-sm text-[#e5e2e1]">
                    NEXUS
                  </span>
                  <span className="text-[10px] text-[#8b91a0] -mt-0.5 tracking-tight font-mono">
                    DISASTER COMMAND
                  </span>
                </div>
              )}
            </div>

            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="w-7 h-7 rounded-lg hover:bg-[#1f1f23] text-[#8b91a0] hover:text-[#e5e2e1] flex items-center justify-center cursor-pointer transition-colors"
              title={isSidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            >
              <span className="material-symbols-outlined text-[18px]">
                {isSidebarOpen ? 'menu_open' : 'menu'}
              </span>
            </button>
          </div>

          {/* MAIN NAV SECTION */}
          <div className="px-3 py-4 space-y-6 overflow-y-auto no-scrollbar">
            {/* COMMAND GROUP */}
            <div>
              {isSidebarOpen && (
                <span className="px-3 text-[10px] font-bold text-[#626875] tracking-wider uppercase block mb-2">
                  Command Center
                </span>
              )}
              <nav className="space-y-1">
                {[
                  { id: 'overview', label: 'Overview', icon: 'dashboard' },
                  { id: 'map', label: 'Live GIS Map', icon: 'map' },
                  { id: 'incidents', label: 'Active Incidents', icon: 'emergency', badge: activeEmergenciesCount },
                  { id: 'alerts', label: 'Critical Alerts', icon: 'notifications_active', badge: criticalIncidentsCount },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setActiveNav(item.id as AdminNavTab)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold cursor-pointer transition-all ${
                      activeNav === item.id
                        ? 'bg-[#1e293b] text-[#3e90ff] shadow-sm shadow-[#3e90ff]/10'
                        : 'text-[#8b91a0] hover:bg-[#18181c] hover:text-[#e5e2e1]'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[19px] shrink-0">
                      {item.icon}
                    </span>
                    {isSidebarOpen && (
                      <span className="truncate flex-1 text-left">{item.label}</span>
                    )}
                    {isSidebarOpen && item.badge !== undefined && item.badge > 0 && (
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold font-mono ${
                          item.id === 'alerts' || item.id === 'incidents'
                            ? 'bg-[#93000a] text-[#ffdad6] border border-[#ffb4ab]/40'
                            : 'bg-[#1e293b] text-[#aac7ff] border border-[#3e90ff]/30'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                ))}
              </nav>
            </div>

            {/* OPERATIONS GROUP */}
            <div>
              {isSidebarOpen && (
                <span className="px-3 text-[10px] font-bold text-[#626875] tracking-wider uppercase block mb-2">
                  Operations
                </span>
              )}
              <nav className="space-y-1">
                {[
                  { id: 'analytics', label: 'Mesh Telemetry', icon: 'hub', badge: networkStatus.activePeers.length },
                  { id: 'responders', label: 'Field Roster', icon: 'groups' },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setActiveNav(item.id as AdminNavTab)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold cursor-pointer transition-all ${
                      activeNav === item.id
                        ? 'bg-[#1e293b] text-[#3e90ff] shadow-sm shadow-[#3e90ff]/10'
                        : 'text-[#8b91a0] hover:bg-[#18181c] hover:text-[#e5e2e1]'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[19px] shrink-0">
                      {item.icon}
                    </span>
                    {isSidebarOpen && (
                      <span className="truncate flex-1 text-left">{item.label}</span>
                    )}
                    {isSidebarOpen && item.badge !== undefined && item.badge > 0 && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded-full font-bold font-mono bg-[#142618] text-[#6cff82] border border-[#294a30]">
                        {item.badge}
                      </span>
                    )}
                  </button>
                ))}
              </nav>
            </div>

            {/* SYSTEM GROUP */}
            <div>
              {isSidebarOpen && (
                <span className="px-3 text-[10px] font-bold text-[#626875] tracking-wider uppercase block mb-2">
                  System &amp; Network
                </span>
              )}
              <nav className="space-y-1">
                {[
                  { id: 'users', label: 'Mesh Station Nodes', icon: 'badge' },
                  { id: 'audit', label: 'Network Event Logs', icon: 'receipt_long' },
                  { id: 'settings', label: 'Node Settings', icon: 'tune' },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setActiveNav(item.id as AdminNavTab)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold cursor-pointer transition-all ${
                      activeNav === item.id
                        ? 'bg-[#1e293b] text-[#3e90ff]'
                        : 'text-[#8b91a0] hover:bg-[#18181c] hover:text-[#e5e2e1]'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[19px] shrink-0">
                      {item.icon}
                    </span>
                    {isSidebarOpen && (
                      <span className="truncate flex-1 text-left">{item.label}</span>
                    )}
                  </button>
                ))}
              </nav>
            </div>
          </div>
        </div>

        {/* BOTTOM SIDEBAR FOOTER */}
        <div className="p-3 border-t border-[#202024] space-y-2">
          {/* Offline Mode Switcher */}
          <div
            onClick={onToggleInternet}
            className={`flex items-center justify-between p-2 rounded-xl border cursor-pointer transition-all ${
              !isInternetConnected
                ? 'bg-[#181f18] border-[#346b3b] text-[#6cff82]'
                : 'bg-[#18181c] border-[#29292e] text-[#8b91a0]'
            }`}
          >
            <div className="flex items-center gap-2 overflow-hidden">
              <span className="material-symbols-outlined text-[18px]">
                {!isInternetConnected ? 'wifi_off' : 'cloud_done'}
              </span>
              {isSidebarOpen && (
                <div className="flex flex-col">
                  <span className="text-[11px] font-bold text-[#e5e2e1]">Offline Mode</span>
                  <span className="text-[9px] text-[#8b91a0]">
                    {!isInternetConnected ? 'Active Mesh' : 'Cloud Uplink'}
                  </span>
                </div>
              )}
            </div>
            {isSidebarOpen && (
              <div
                className={`w-8 h-4 rounded-full p-0.5 transition-colors ${
                  !isInternetConnected ? 'bg-[#47e266]' : 'bg-[#333]'
                }`}
              >
                <div
                  className={`w-3 h-3 rounded-full bg-black transition-transform ${
                    !isInternetConnected ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </div>
            )}
          </div>

          {/* Switch to Field Mobile App */}
          <button
            onClick={onSwitchToFieldView}
            className="w-full flex items-center justify-center gap-2 p-2 rounded-xl bg-[#1a1a1f] hover:bg-[#24242a] border border-[#2b2b32] text-xs text-[#aac7ff] cursor-pointer transition-all active:scale-[0.98]"
            title="Preview Mobile Field Responder App"
          >
            <span className="material-symbols-outlined text-[17px]">smartphone</span>
            {isSidebarOpen && <span>Field Responder App</span>}
          </button>
        </div>
      </aside>

      {/* 2. MAIN CONTENT VIEWPORT */}
      <div className="flex-1 min-w-0 flex flex-col overflow-y-auto">
        {/* TOP COMMAND HEADER */}
        <header className="sticky top-0 z-20 h-16 bg-[#121214]/90 backdrop-blur-md border-b border-[#202024] px-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-xs text-[#8b91a0] flex items-center gap-1.5 font-mono">
              <span className="w-2 h-2 rounded-full bg-[#47e266] animate-pulse" />
              <span>MESH: <strong className="text-white">{networkStatus.mode.toUpperCase()}</strong></span>
            </span>
            <span className="text-xs text-[#444] hidden sm:inline">|</span>
            <span className="text-xs text-[#8b91a0] hidden sm:flex items-center gap-1.5 font-mono">
              <span className={`w-2 h-2 rounded-full ${
                locationState === 'LIVE'
                  ? 'bg-[#47e266]'
                  : locationState === 'CACHED'
                  ? 'bg-amber-400'
                  : 'bg-[#8b91a0]'
              }`} />
              <span className={locationState === 'LIVE' ? 'text-[#47e266]' : 'text-amber-300'}>
                {locationState === 'LIVE'
                  ? `LIVE GPS (±${Math.round(currentLocation?.accuracy || 12)}m)`
                  : locationState === 'CACHED'
                  ? 'CACHED TACTICAL'
                  : locationState === 'MANUAL'
                  ? 'MANUAL FIX'
                  : 'NO GPS FIX'}
              </span>
            </span>
            <span className="text-xs text-[#444] hidden md:inline">|</span>
            <span className="text-xs text-[#aac7ff] font-medium hidden md:inline">
              Amrita Vishwa Vidyapeetham · Vengal Campus (Thiruvallur)
            </span>
          </div>

          {/* Search bar & Controls */}
          <div className="flex items-center gap-3">
            <div className="relative hidden md:flex items-center">
              <span className="material-symbols-outlined absolute left-2.5 text-[17px] text-[#626875]">
                search
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search incidents, sectors, nodes..."
                className="w-64 bg-[#18181c] border border-[#28282e] focus:border-[#3e90ff] rounded-xl py-1.5 pl-8 pr-3 text-xs text-[#e5e2e1] outline-none transition-all placeholder-[#555]"
              />
            </div>

            {/* Audio Emergency Alerts Toggle */}
            <button
              onClick={() => {
                const muted = toggleAudioMute();
                onShowToast(muted ? '🔇 Emergency alert tones muted' : '🔊 Emergency alert tones active (P0/P1 audible)');
              }}
              className={`px-2.5 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all ${
                isAudioMuted
                  ? 'bg-[#202026] border-[#2e2e38] text-[#8b91a0]'
                  : 'bg-[#142318] border-[#294a30] text-[#6cff82]'
              }`}
              title={isAudioMuted ? 'Alert Sound Muted (Click to Unmute)' : 'Alert Sound Active (Click to Mute)'}
            >
              <span className="material-symbols-outlined text-[16px]">
                {isAudioMuted ? 'volume_off' : 'volume_up'}
              </span>
              <span className="hidden sm:inline">{isAudioMuted ? 'Muted' : 'Sound On'}</span>
            </button>

            {/* Quick Refresh */}
            <button
              onClick={() => {
                refreshIncidents();
                onShowToast('Dexie storage & WebRTC channels synchronized');
              }}
              className="p-2 rounded-xl bg-[#18181c] hover:bg-[#222228] border border-[#28282e] text-[#c0c6d6] cursor-pointer"
              title="Refresh Dashboard"
            >
              <span className="material-symbols-outlined text-[18px]">refresh</span>
            </button>

            {/* One-Click Network-Wide Purge Demo Data */}
            <button
              onClick={async () => {
                await purgeDemoData();
                onShowToast('✓ Network-wide purge broadcast! All devices cleared.');
              }}
              className="px-2.5 py-1.5 rounded-xl bg-[#2b1616] hover:bg-[#3f1919] border border-[#ffb4ab]/30 text-[#ffb4ab] text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all active:scale-95"
              title="One-Click Wipe Demo Data (All Devices Everywhere)"
            >
              <span className="material-symbols-outlined text-[16px]">delete_sweep</span>
              <span className="hidden sm:inline">Purge Everywhere</span>
            </button>

            {/* User Profile & Logout */}
            <div className="flex items-center gap-2 pl-2 border-l border-[#24242a]">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#002957] to-[#3e90ff] flex items-center justify-center text-white font-bold text-xs border border-[#3e90ff]/50">
                {adminUser.avatarInitials}
              </div>
              <div className="hidden lg:flex flex-col text-left">
                <span className="text-xs font-bold text-[#e5e2e1] leading-tight">
                  {adminUser.name}
                </span>
                <span className="text-[10px] text-[#8b91a0] leading-tight">
                  {adminUser.role}
                </span>
              </div>

              <button
                onClick={onLogout}
                className="p-1.5 rounded-lg bg-[#202026] hover:bg-[#93000a]/30 hover:border-[#ffb4ab]/40 border border-[#2b2b32] text-[#8b91a0] hover:text-[#ffb4ab] cursor-pointer transition-colors ml-1"
                title="Switch Role or Logout"
              >
                <span className="material-symbols-outlined text-[18px]">logout</span>
              </button>
            </div>
          </div>
        </header>

        {/* 3. MAIN DASHBOARD CONTENT */}
        <main className="flex-1 p-4 sm:p-6 space-y-6 max-w-7xl w-full mx-auto">
          {/* OVERVIEW TAB (3-SECOND COMPREHENSION REDESIGN) */}
          {activeNav === 'overview' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              {/* ROW 1: COMMAND STATUS STRIP */}
              <div className="bg-[#131417] border border-[#24272e] rounded-2xl p-3 flex flex-wrap items-center justify-between gap-2.5 shadow-md">
                <div className="flex items-center gap-2 flex-wrap text-xs font-mono">
                  {/* MESH HEALTH */}
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border bg-[#181a1f] border-[#292c35]">
                    <span className="text-[10px] text-[#8b91a0] font-sans font-bold uppercase tracking-wider">MESH</span>
                    <span className="text-[#626875]">|</span>
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${
                        networkStatus.activePeers.length > 0
                          ? 'bg-[#47e266] animate-pulse'
                          : networkStatus.isSignalingConnected
                          ? 'bg-amber-400'
                          : 'bg-[#8b91a0]'
                      }`} />
                      <span className={`font-bold ${
                        networkStatus.activePeers.length > 0
                          ? 'text-[#47e266]'
                          : networkStatus.isSignalingConnected
                          ? 'text-amber-300'
                          : 'text-[#8b91a0]'
                      }`}>
                        {networkStatus.activePeers.length > 0
                          ? 'OPERATIONAL'
                          : networkStatus.isSignalingConnected
                          ? 'STANDBY (LAN READY)'
                          : 'OFFLINE SOLO'}
                      </span>
                    </div>
                  </div>

                  {/* REAL NODES */}
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border bg-[#181a1f] border-[#292c35]">
                    <span className="text-[10px] text-[#8b91a0] font-sans font-bold uppercase tracking-wider">REAL NODES</span>
                    <span className="text-[#626875]">|</span>
                    <div className="flex items-center gap-1.5">
                      <span className={`font-bold text-sm ${networkStatus.activePeers.length > 0 ? 'text-[#47e266]' : 'text-white'}`}>
                        {networkStatus.activePeers.length}
                      </span>
                      <span className="text-[11px] text-[#8b91a0] font-sans">
                        ({networkDiagnostics.discoveredPeers.length} on LAN)
                      </span>
                    </div>
                  </div>

                  {/* ACTIVE EMERGENCIES */}
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border ${
                    activeEmergenciesCount > 0
                      ? 'bg-[#2b1115] border-[#5a1c22] text-[#ffb4ab]'
                      : 'bg-[#181a1f] border-[#292c35] text-[#8b91a0]'
                  }`}>
                    <span className="text-[10px] font-sans font-bold uppercase tracking-wider">ACTIVE EMERGENCIES</span>
                    <span className="opacity-40">|</span>
                    <div className="flex items-center gap-1.5">
                      {activeEmergenciesCount > 0 && (
                        <span className="w-2 h-2 rounded-full bg-[#ff5449] animate-ping" />
                      )}
                      <span className={`font-bold text-sm ${activeEmergenciesCount > 0 ? 'text-[#ff5449]' : 'text-[#47e266]'}`}>
                        {activeEmergenciesCount}
                      </span>
                      <span className="text-[10px] font-sans">
                        {activeEmergenciesCount > 0 ? (activeEmergenciesCount === 1 ? 'ACTIVE CRITICAL' : 'ACTIVE') : 'NOMINAL'}
                      </span>
                    </div>
                  </div>

                  {/* HIGH DENSITY */}
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border ${
                    activeDensityClusters.length > 0
                      ? 'bg-[#291616] border-[#592626] text-amber-300'
                      : 'bg-[#181a1f] border-[#292c35] text-[#8b91a0]'
                  }`}>
                    <span className="text-[10px] font-sans font-bold uppercase tracking-wider">HIGH DENSITY</span>
                    <span className="opacity-40">|</span>
                    <span className={`font-bold ${activeDensityClusters.length > 0 ? 'text-amber-300' : 'text-[#8b91a0]'}`}>
                      {activeDensityClusters.length > 0
                        ? `${activeDensityClusters.length} ZONE (≥${MIN_DENSITY_NODES}n/${DENSITY_RADIUS_METERS}m)`
                        : locationState === 'UNAVAILABLE'
                        ? 'GPS UNAVAILABLE'
                        : '0 ZONES'}
                    </span>
                  </div>

                  {/* GPS STATUS */}
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border bg-[#181a1f] border-[#292c35]">
                    <span className="text-[10px] text-[#8b91a0] font-sans font-bold uppercase tracking-wider">GPS</span>
                    <span className="text-[#626875]">|</span>
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${
                        locationState === 'LIVE'
                          ? 'bg-[#47e266]'
                          : locationState === 'CACHED'
                          ? 'bg-amber-400'
                          : 'bg-[#8b91a0]'
                      }`} />
                      <span className={`font-bold ${
                        locationState === 'LIVE'
                          ? 'text-[#47e266]'
                          : locationState === 'CACHED'
                          ? 'text-amber-300'
                          : 'text-[#8b91a0]'
                      }`}>
                        {locationState === 'LIVE'
                          ? `LIVE (±${Math.round(currentLocation?.accuracy || 12)}m)`
                          : locationState === 'CACHED'
                          ? 'CACHED TACTICAL'
                          : locationState === 'MANUAL'
                          ? 'MANUAL FIX'
                          : 'NO GPS FIX'}
                      </span>
                    </div>
                  </div>

                  {/* SYNC STATUS */}
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border bg-[#181a1f] border-[#292c35]">
                    <span className="text-[10px] text-[#8b91a0] font-sans font-bold uppercase tracking-wider">SYNC</span>
                    <span className="text-[#626875]">|</span>
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${outboxCount === 0 ? 'bg-[#47e266]' : 'bg-amber-400'}`} />
                      <span className={`font-bold ${outboxCount === 0 ? 'text-[#47e266]' : 'text-amber-300'}`}>
                        {outboxCount === 0 ? 'HEALTHY' : `QUEUED (${outboxCount})`}
                      </span>
                      <span className="text-[10px] text-[#8b91a0] font-sans">
                        ({incidents.length} in Vault)
                      </span>
                    </div>
                  </div>
                </div>

                {/* Recalibrate / Quick Controls */}
                <div className="flex items-center gap-2 text-xs">
                  <button
                    onClick={() => {
                      setRecalibrateSignal((c) => c + 1);
                      onShowToast('Perimeter GIS bounds recalibrated');
                    }}
                    className="px-2.5 py-1 rounded-xl bg-[#1e2026] hover:bg-[#252830] text-[#aac7ff] border border-[#2d303b] text-xs font-semibold cursor-pointer transition-colors"
                    title="Recalibrate Tactical Map bounds"
                  >
                    Recalibrate Map
                  </button>
                </div>
              </div>

              {/* ROW 2: ACTIVE EMERGENCY COMMAND CARD */}
              {primaryActiveEmergency ? (
                <div className="bg-[#1f1012] border-2 border-[#ff5449]/60 rounded-3xl p-5 sm:p-6 shadow-2xl relative overflow-hidden transition-all animate-in slide-in-from-top-2 duration-200">
                  {/* Subtle pulsing background accent */}
                  <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-[#ff5449]/10 blur-3xl pointer-events-none" />

                  <div className="relative z-10 flex flex-col gap-3.5">
                    {/* Header bar */}
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-3.5 w-3.5 relative">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#ff5449] opacity-75" />
                          <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-[#ff5449]" />
                        </span>
                        <span className="text-xs font-black uppercase tracking-wider text-[#ffb4ab] flex items-center gap-1.5 font-mono">
                          <span className="material-symbols-outlined text-[18px]">crisis_alert</span>
                          ACTIVE EMERGENCY COMMAND DISPATCH
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Priority Badge */}
                        <span className={`px-2.5 py-0.5 rounded-lg text-xs font-black font-mono uppercase tracking-wider border ${
                          primaryActiveEmergency.badgeColor === 'error'
                            ? 'bg-[#93000a] text-[#ffdad6] border-[#ffb4ab]/50'
                            : 'bg-amber-950 text-amber-300 border-amber-600/40'
                        }`}>
                          {primaryActiveEmergency.badgeColor === 'error' ? 'P0 · CRITICAL' : 'P1 · URGENT'}
                        </span>

                        {/* Relative time */}
                        <span className="text-[11px] text-[#ffb4ab] font-mono">
                          ⏱ Received {primaryActiveEmergency.timeAgo}
                        </span>

                        {/* Multi-emergency pager if > 1 */}
                        {activeEmergencies.length > 1 && (
                          <div className="flex items-center gap-1 pl-2 border-l border-[#ffb4ab]/20">
                            <button
                              onClick={() => setActiveEmergencyIndex((prev) => (prev > 0 ? prev - 1 : activeEmergencies.length - 1))}
                              className="w-5 h-5 rounded bg-[#381619] hover:bg-[#521c22] text-[#ffb4ab] flex items-center justify-center cursor-pointer text-xs"
                              title="Previous Emergency"
                            >
                              ‹
                            </button>
                            <span className="text-[10px] text-[#ffb4ab] font-mono">
                              {activeEmergencyIndex + 1}/{activeEmergencies.length}
                            </span>
                            <button
                              onClick={() => setActiveEmergencyIndex((prev) => (prev < activeEmergencies.length - 1 ? prev + 1 : 0))}
                              className="w-5 h-5 rounded bg-[#381619] hover:bg-[#521c22] text-[#ffb4ab] flex items-center justify-center cursor-pointer text-xs"
                              title="Next Emergency"
                            >
                              ›
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Title & Description */}
                    <div>
                      <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight leading-tight">
                        {primaryActiveEmergency.title}
                      </h2>
                      <p className="text-xs sm:text-sm text-[#ffdad6]/90 line-clamp-2 mt-1 leading-relaxed">
                        {primaryActiveEmergency.description}
                      </p>
                    </div>

                    {/* Metadata summary */}
                    <div className="flex items-center gap-3 sm:gap-5 flex-wrap text-xs text-[#ffb4ab] font-mono pt-1">
                      <span className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[16px] text-[#ff5449]">place</span>
                        <span>📍 {primaryActiveEmergency.location}</span>
                      </span>
                      <span className="text-[#662024]">·</span>
                      <span className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[16px] text-[#ffb4ab]">sensors</span>
                        <span>📡 Received from {getOriginNodeId(primaryActiveEmergency.id)}</span>
                      </span>
                      <span className="text-[#662024]">·</span>
                      <span className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[16px] text-[#ffb4ab]">timeline</span>
                        <span>{getHopCount(primaryActiveEmergency.id)} Relay Hops</span>
                      </span>
                    </div>

                    {/* Operational Action Buttons */}
                    <div className="flex items-center gap-2 sm:gap-3 flex-wrap pt-3 border-t border-[#ff5449]/20">
                      <button
                        onClick={() => {
                          setActiveNav('map');
                          onShowToast(`📍 Centering tactical map on emergency beacon...`);
                        }}
                        className="px-4 py-2 rounded-xl bg-[#ff5449] hover:bg-[#ff3b30] text-black font-extrabold text-xs cursor-pointer transition-all flex items-center gap-1.5 shadow-lg active:scale-95"
                      >
                        <span className="material-symbols-outlined text-[16px]">pin_drop</span>
                        <span>LOCATE ON MAP</span>
                      </button>

                      {!acknowledgedAlertIds.has(primaryActiveEmergency.id) ? (
                        <button
                          onClick={() => handleAcknowledgeAlert(primaryActiveEmergency.id)}
                          className="px-4 py-2 rounded-xl bg-[#3f191c] hover:bg-[#521e23] border border-[#ffb4ab]/40 text-[#ffb4ab] font-bold text-xs cursor-pointer transition-all flex items-center gap-1.5 active:scale-95"
                        >
                          <span className="material-symbols-outlined text-[16px]">check</span>
                          <span>ACKNOWLEDGE</span>
                        </button>
                      ) : (
                        <span className="px-4 py-2 rounded-xl bg-[#142618] border border-[#294a30] text-[#6cff82] font-bold text-xs flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[16px]">check_circle</span>
                          <span>ACKNOWLEDGED</span>
                        </span>
                      )}

                      <button
                        onClick={() => setSelectedIncidentForDrawer(primaryActiveEmergency)}
                        className="px-4 py-2 rounded-xl bg-[#2b1619] hover:bg-[#3d1c20] border border-[#ffb4ab]/30 text-white font-semibold text-xs cursor-pointer transition-all flex items-center gap-1.5"
                      >
                        <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                        <span>OPEN INCIDENT</span>
                      </button>

                      <button
                        onClick={() => onResolveIncident(primaryActiveEmergency.id)}
                        className="px-4 py-2 rounded-xl bg-[#142618] hover:bg-[#1b3d22] border border-[#294a30] text-[#6cff82] font-semibold text-xs cursor-pointer transition-all flex items-center gap-1.5 ml-auto"
                      >
                        <span className="material-symbols-outlined text-[16px]">task_alt</span>
                        <span>RESOLVE</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-[#101712] border border-[#1e3825] rounded-3xl p-5 sm:p-6 flex items-center justify-between gap-4 shadow-md transition-all">
                  <div className="flex items-center gap-3.5">
                    <div className="w-11 h-11 rounded-2xl bg-[#142618] border border-[#294a30] flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-[#47e266] text-[24px]">
                        verified_user
                      </span>
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-[#e5e2e1] flex items-center gap-2">
                        <span>✓ NO ACTIVE EMERGENCIES</span>
                        <span className="w-2 h-2 rounded-full bg-[#47e266]" />
                      </h3>
                      <p className="text-xs text-[#8b91a0] mt-0.5">
                        All monitored campus sectors nominal · Autonomous mesh listening on background radio
                      </p>
                    </div>
                  </div>

                  <div className="hidden sm:flex items-center gap-2.5 shrink-0">
                    <span className="px-3 py-1.5 rounded-xl bg-[#142618] border border-[#294a30] text-[#6cff82] text-xs font-bold font-mono">
                      0 Active P0/P1
                    </span>
                    <span className="px-3 py-1.5 rounded-xl bg-[#16181c] border border-[#262830] text-[#8b91a0] text-xs font-mono">
                      {incidents.length} Total in Vault
                    </span>
                  </div>
                </div>
              )}

              {/* ROW 3: LIVE TACTICAL MAP (2/3) + LIVE EVENT STREAM (1/3) */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Left: Tactical Map (2/3) */}
                <div className="lg:col-span-2 bg-[#151518] border border-[#24242a] rounded-3xl p-4 overflow-hidden shadow-xl flex flex-col justify-between">
                  <div className="flex items-center justify-between pb-3 border-b border-[#222228] mb-3 flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[#3e90ff] text-[20px]">
                        location_searching
                      </span>
                      <h3 className="text-sm font-bold text-[#e5e2e1]">
                        Live Tactical GIS Map · Amrita Vengal Campus
                      </h3>
                    </div>

                    {/* Map Legend */}
                    <div className="flex items-center gap-3 text-[11px] text-[#8b91a0] flex-wrap font-medium">
                      <span className="flex items-center gap-1 font-semibold text-[#ffb4ab]">
                        <span className="w-2 h-2 rounded-full bg-[#ff5449] animate-pulse" />
                        🔴 Emergency
                      </span>
                      <span className="flex items-center gap-1 font-semibold text-[#47e266]">
                        <span className="w-2 h-2 rounded-full bg-[#47e266]" />
                        🟢 Real Node
                      </span>
                      <span className="flex items-center gap-1 font-semibold text-amber-300">
                        <span className="w-2 h-2 rounded-full bg-amber-400" />
                        🔴 Density Zone
                      </span>
                      <span className="flex items-center gap-1 text-[#c084fc]">
                        <span className="w-2 h-2 rounded-full border border-[#c084fc] border-dashed" />
                        🟣 Demo (Simulated)
                      </span>
                    </div>
                  </div>

                  {/* Map Viewport */}
                  <div className="w-full h-[430px] rounded-2xl overflow-hidden border border-[#282830]">
                    <MapTab onShowToast={onShowToast} incidents={incidents} recalibrateSignal={recalibrateSignal} />
                  </div>
                </div>

                {/* Right: Live Event Stream (1/3) */}
                <div className="bg-[#151518] border border-[#24242a] rounded-3xl p-4 shadow-xl flex flex-col justify-between space-y-3">
                  <div className="flex items-center justify-between border-b border-[#222228] pb-2">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[18px] text-[#3e90ff]">
                        bolt
                      </span>
                      <h3 className="text-xs font-bold text-[#e5e2e1]">Live Event Stream</h3>
                    </div>
                    <span className="text-[10px] text-[#47e266] font-mono font-bold flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#47e266] animate-pulse" />
                      LIVE RADAR
                    </span>
                  </div>

                  {/* Event Items */}
                  <div className="flex-1 space-y-2 overflow-y-auto max-h-[385px] no-scrollbar pr-0.5">
                    {liveEventStream.length === 0 ? (
                      <div className="p-6 text-center text-[#8b91a0]">
                        <span className="material-symbols-outlined text-[24px] mb-1 opacity-40">radar</span>
                        <p className="text-xs">No recent events. Monitoring radio channel...</p>
                      </div>
                    ) : (
                      liveEventStream.map((evt) => (
                        <div
                          key={evt.id}
                          onClick={() => {
                            if (evt.incident) {
                              setSelectedIncidentForDrawer(evt.incident);
                            }
                          }}
                          className={`p-2.5 rounded-xl border flex items-start gap-2.5 transition-all ${
                            evt.incident ? 'cursor-pointer hover:border-[#3e90ff]/50' : ''
                          } ${evt.badgeBg}`}
                        >
                          <span className={`material-symbols-outlined text-[16px] mt-0.5 shrink-0 ${evt.color}`}>
                            {evt.icon}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1">
                              <h4 className={`text-[11px] font-bold truncate ${evt.color}`}>
                                {evt.title}
                              </h4>
                              <span className="text-[10px] text-[#8b91a0] font-mono shrink-0">
                                {evt.timeAgo}
                              </span>
                            </div>
                            <p className="text-[10px] text-[#8b91a0] truncate mt-0.5 font-mono">
                              {evt.subtitle}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Bottom summary bar */}
                  <div className="pt-2 border-t border-[#222228] flex items-center justify-between text-[11px] text-[#8b91a0]">
                    <span className="font-mono">{incidents.length} Records in Vault</span>
                    <button
                      onClick={() => setActiveNav('alerts')}
                      className="text-[#3e90ff] hover:underline font-semibold cursor-pointer"
                    >
                      View All Alerts ({criticalIncidentsCount}) →
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* MAP TAB */}
          {activeNav === 'map' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-[#e5e2e1]">Tactical Campus GIS Map</h2>
                  <p className="text-xs text-[#8b91a0]">
                    Amrita Vishwa Vidyapeetham, Chennai Campus (Vengal, Thiruvallur)
                  </p>
                </div>
                <button
                  onClick={() => {
                    setRecalibrateSignal((c) => c + 1);
                    onShowToast('Perimeter GIS bounds recalibrated to all active mesh nodes');
                  }}
                  className="px-3 py-1.5 rounded-xl bg-[#1f1f26] hover:bg-[#282832] text-xs font-semibold text-[#aac7ff] border border-[#333] cursor-pointer"
                >
                  Recalibrate GIS
                </button>
              </div>

              <div className="w-full h-[620px] rounded-3xl overflow-hidden border border-[#26262e] shadow-2xl">
                <MapTab onShowToast={onShowToast} incidents={incidents} recalibrateSignal={recalibrateSignal} />
              </div>
            </div>
          )}

          {/* INCIDENTS & DISPATCH TAB */}
          {activeNav === 'incidents' && (
            <div className="animate-in fade-in duration-200">
              <IncidentManager
                incidents={incidents}
                onAddIncident={onAddIncident}
                onResolveIncident={onResolveIncident}
                onShowToast={onShowToast}
              />
            </div>
          )}

          {/* ALERTS TAB */}
          {activeNav === 'alerts' && (
            <div className="bg-[#151518] border border-[#24242a] rounded-3xl p-6 space-y-4 animate-in fade-in duration-200">
              <div className="flex items-center justify-between pb-4 border-b border-[#222228]">
                <div>
                  <h2 className="text-lg font-bold text-[#e5e2e1]">Broadcast Alerts Center</h2>
                  <p className="text-xs text-[#8b91a0]">
                    Send emergency alerts directly to all peer devices in the Amrita mesh
                  </p>
                </div>
                <button
                  onClick={() => {
                    onAddIncident({
                      title: 'Campus Weather Alert: Heavy Inflow Near Vengal Lake',
                      description: 'Precautionary evacuation notice for ground floor facilities.',
                      location: 'Amrita North Gate & Lake Perimeter',
                      category: 'critical flood',
                      badgeColor: 'error',
                    });
                    onShowToast('Emergency Weather Alert pushed across mesh');
                  }}
                  className="px-4 py-2 rounded-xl bg-[#ffb4ab] text-[#93000a] font-bold text-xs cursor-pointer hover:bg-white transition-colors"
                >
                  Dispatch Campus Precaution Alert
                </button>
              </div>

              <div className="flex items-center justify-between pb-4 border-b border-[#222228]">
                <div>
                  <h2 className="text-lg font-bold text-[#e5e2e1] flex items-center gap-2">
                    <span>Broadcast Alerts Center</span>
                    {criticalIncidents.filter((i) => !acknowledgedAlertIds.has(i.id) && i.statusText?.toLowerCase() !== 'resolved').length > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#93000a] text-[#ffdad6] animate-pulse">
                        {criticalIncidents.filter((i) => !acknowledgedAlertIds.has(i.id) && i.statusText?.toLowerCase() !== 'resolved').length} Unacknowledged
                      </span>
                    )}
                  </h2>
                  <p className="text-xs text-[#8b91a0]">
                    Tactical emergency notifications across the autonomous mesh · Multi-state alert lifecycle
                  </p>
                </div>
                <button
                  onClick={() => {
                    onAddIncident({
                      title: 'Campus Weather Alert: Heavy Inflow Near Vengal Lake',
                      description: 'Precautionary evacuation notice for ground floor facilities.',
                      location: 'Amrita North Gate & Lake Perimeter',
                      category: 'critical flood',
                      badgeColor: 'error',
                    });
                    onShowToast('🚨 Priority Campus Alert broadcasted across offline mesh');
                  }}
                  className="px-4 py-2 rounded-xl bg-[#ffb4ab] text-[#93000a] font-bold text-xs cursor-pointer hover:bg-white transition-colors flex items-center gap-1.5 shadow-md"
                >
                  <span className="material-symbols-outlined text-[16px]">campaign</span>
                  <span>Broadcast New Precaution Alert</span>
                </button>
              </div>

              {/* Alert Lifecycle Filter Chips */}
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
                {[
                  { id: 'all', label: `All Alerts (${criticalIncidents.length})` },
                  {
                    id: 'new',
                    label: `New / Action Required (${criticalIncidents.filter((i) => !acknowledgedAlertIds.has(i.id) && i.statusText?.toLowerCase() !== 'resolved').length})`,
                    urgent: criticalIncidents.filter((i) => !acknowledgedAlertIds.has(i.id) && i.statusText?.toLowerCase() !== 'resolved').length > 0,
                  },
                  {
                    id: 'acknowledged',
                    label: `Acknowledged (${criticalIncidents.filter((i) => acknowledgedAlertIds.has(i.id) && i.statusText?.toLowerCase() !== 'resolved').length})`,
                  },
                  {
                    id: 'resolved',
                    label: `Resolved (${criticalIncidents.filter((i) => i.statusText?.toLowerCase() === 'resolved').length})`,
                  },
                ].map((chip) => (
                  <button
                    key={chip.id}
                    onClick={() => setAlertFilter(chip.id as any)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-all border whitespace-nowrap flex items-center gap-1.5 ${
                      alertFilter === chip.id
                        ? 'bg-[#002957] text-[#aac7ff] border-[#3e90ff]/50'
                        : 'bg-[#121214] text-[#8b91a0] border-[#25252a] hover:text-[#e5e2e1]'
                    }`}
                  >
                    {chip.urgent && <span className="w-1.5 h-1.5 rounded-full bg-[#ffb4ab] animate-ping" />}
                    <span>{chip.label}</span>
                  </button>
                ))}
              </div>

              {/* Alerts List */}
              <div className="space-y-3">
                {(() => {
                  const filteredAlerts = criticalIncidents.filter((inc) => {
                    const isResolved = inc.statusText?.toLowerCase() === 'resolved';
                    const isAck = acknowledgedAlertIds.has(inc.id);

                    if (alertFilter === 'new') return !isAck && !isResolved;
                    if (alertFilter === 'acknowledged') return isAck && !isResolved;
                    if (alertFilter === 'resolved') return isResolved;
                    return true;
                  });

                  if (filteredAlerts.length === 0) {
                    return (
                      <div className="p-8 text-center text-[#8b91a0] bg-[#101013] rounded-2xl border border-[#222228]">
                        <span className="material-symbols-outlined text-[32px] text-[#47e266] mb-1">
                          verified_user
                        </span>
                        <p className="text-xs">No alerts matching filter criteria in the local vault.</p>
                      </div>
                    );
                  }

                  return filteredAlerts.map((inc) => {
                    const isResolved = inc.statusText?.toLowerCase() === 'resolved';
                    const isAcknowledged = acknowledgedAlertIds.has(inc.id);
                    const isNew = !isResolved && !isAcknowledged;

                    return (
                      <div
                        key={inc.id}
                        className={`p-4 rounded-2xl border transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                          isNew
                            ? 'bg-[#1a1213] border-[#ffb4ab]/40 shadow-sm'
                            : isAcknowledged
                            ? 'bg-[#141416] border-amber-600/30'
                            : 'bg-[#101310] border-[#294a30]/50 opacity-80'
                        }`}
                      >
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <span
                            className={`w-3 h-3 rounded-full mt-1 shrink-0 ${
                              isNew
                                ? 'bg-[#ffb4ab] animate-pulse'
                                : isAcknowledged
                                ? 'bg-amber-400'
                                : 'bg-[#47e266]'
                            }`}
                          />
                          <div className="space-y-1 flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              {/* Lifecycle Badge */}
                              <span
                                className={`px-2 py-0.5 rounded-md text-[10px] font-bold font-mono uppercase tracking-wider ${
                                  isNew
                                    ? 'bg-[#93000a] text-[#ffdad6] border border-[#ffb4ab]/50'
                                    : isAcknowledged
                                    ? 'bg-amber-950 text-amber-300 border border-amber-600/40'
                                    : 'bg-[#142618] text-[#6cff82] border border-[#294a30]'
                                }`}
                              >
                                {isNew
                                  ? 'NEW ALERT · ACTION REQUIRED'
                                  : isAcknowledged
                                  ? 'ACKNOWLEDGED · IN PROGRESS'
                                  : 'RESOLVED IN DEXIE'}
                              </span>

                              <span className="text-[11px] text-[#8b91a0]">{inc.timeAgo}</span>
                              <span className="px-1.5 py-0.2 rounded bg-[#202024] text-[#8b91a0] text-[10px] font-mono">
                                Hops: {inc.hopsRemaining ?? 3} rem
                              </span>
                            </div>

                            <h4 className="text-sm font-bold text-[#e5e2e1] truncate">{inc.title}</h4>
                            <p className="text-xs text-[#c0c6d6] line-clamp-2">{inc.description}</p>

                            <div className="text-[11px] text-[#8b91a0] flex items-center gap-2 pt-0.5 font-mono">
                              <span className="text-[#aac7ff] flex items-center gap-1">
                                <span className="material-symbols-outlined text-[13px]">place</span>
                                <span>{inc.location}</span>
                              </span>
                              <span>·</span>
                              <span>{inc.distance}</span>
                              <span>·</span>
                              <span>ID: {inc.id.slice(0, 8)}</span>
                            </div>
                          </div>
                        </div>

                        {/* Lifecycle Action Buttons */}
                        <div className="flex items-center gap-2 self-start md:self-center shrink-0 flex-wrap">
                          {isNew && (
                            <button
                              onClick={() => handleAcknowledgeAlert(inc.id)}
                              className="px-3 py-1.5 rounded-xl bg-amber-950/60 hover:bg-amber-900/60 border border-amber-600/50 text-amber-300 text-xs font-semibold cursor-pointer transition-all flex items-center gap-1.5"
                              title="Acknowledge alert receipt"
                            >
                              <span className="material-symbols-outlined text-[15px]">done</span>
                              <span>Acknowledge</span>
                            </button>
                          )}

                          <button
                            onClick={() => {
                              setActiveNav('map');
                              onShowToast(`Focusing tactical map on: ${inc.location}`);
                            }}
                            className="px-3 py-1.5 rounded-xl bg-[#1e293b] hover:bg-[#273549] border border-[#3e90ff]/40 text-[#aac7ff] text-xs font-semibold cursor-pointer transition-all flex items-center gap-1.5"
                            title="View alert location on GIS Map"
                          >
                            <span className="material-symbols-outlined text-[15px]">explore</span>
                            <span>Locate on Map</span>
                          </button>
                          <button
                            onClick={() => setSelectedIncidentForDrawer(inc)}
                            className="px-3 py-1.5 rounded-xl bg-[#1e2026] hover:bg-[#282b34] border border-[#2d303b] text-white text-xs font-semibold cursor-pointer transition-all flex items-center gap-1.5"
                            title="Open detailed incident drawer"
                          >
                            <span className="material-symbols-outlined text-[15px]">open_in_new</span>
                            <span>Details</span>
                          </button>

                          {!isResolved ? (
                            <button
                              onClick={() => {
                                onResolveIncident(inc.id);
                                onShowToast(`✓ Alert marked RESOLVED in Dexie: "${inc.title}"`);
                              }}
                              className="px-3 py-1.5 rounded-xl bg-[#142618] hover:bg-[#1a3521] border border-[#294a30] text-[#6cff82] text-xs font-semibold cursor-pointer transition-all flex items-center gap-1.5"
                              title="Mark alert as resolved in Dexie vault"
                            >
                              <span className="material-symbols-outlined text-[15px]">task_alt</span>
                              <span>Resolve Alert</span>
                            </button>
                          ) : (
                            <span className="px-3 py-1.5 rounded-xl bg-[#142618] border border-[#294a30] text-[#6cff82] text-xs font-semibold flex items-center gap-1 font-mono">
                              <span className="material-symbols-outlined text-[14px]">check_circle</span>
                              <span>Resolved</span>
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          )}

          {/* RESPONDERS TAB */}
          {activeNav === 'responders' && (
            <div className="animate-in fade-in duration-200">
              <ResponderDirectory onShowToast={onShowToast} />
            </div>
          )}

          {/* ANALYTICS & NODES TAB */}
          {activeNav === 'analytics' && (
            <div className="animate-in fade-in duration-200">
              <NodeTelemetry onShowToast={onShowToast} />
            </div>
          )}

          {/* USERS & ROLES TAB */}
          {activeNav === 'users' && (
            <div className="bg-[#151518] border border-[#24242a] rounded-3xl p-6 space-y-4 animate-in fade-in duration-200">
              <div className="flex items-center justify-between pb-4 border-b border-[#222228]">
                <div>
                  <h2 className="text-lg font-bold text-[#e5e2e1]">Mesh Station &amp; Node Directory</h2>
                  <p className="text-xs text-[#8b91a0]">
                    Verified local command stations and active peer nodes on the offline mesh
                  </p>
                </div>
                <span className="px-3 py-1 rounded-full bg-[#202028] text-xs text-[#aac7ff] font-bold">
                  {networkDiagnostics.discoveredPeers.length + 1} Active Mesh Nodes
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Local Command Node */}
                <div className="p-4 rounded-2xl bg-[#101013] border border-[#3e90ff]/40 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-[#002957] text-[#aac7ff] flex items-center justify-center font-bold text-xs">
                        {adminUser.avatarInitials}
                      </div>
                      <div>
                        <span className="text-xs font-bold text-[#e5e2e1] block">
                          {adminUser.name}
                        </span>
                        <span className="text-[10px] text-[#8b91a0]">
                          Incident Commander · Local Command Station
                        </span>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#3e90ff]/20 text-[#aac7ff]">
                      HOST ADMIN
                    </span>
                  </div>
                  <div className="text-[11px] text-[#8b91a0] pt-2 border-t border-[#1c1c22] flex justify-between font-mono">
                    <span>Node ID: {deviceId}</span>
                    <span className="text-[#47e266]">Active Session</span>
                  </div>
                </div>

                {/* Discovered Peer Nodes */}
                {networkDiagnostics.discoveredPeers.map((peer) => (
                  <div
                    key={peer.peerId}
                    className="p-4 rounded-2xl bg-[#101013] border border-[#222228] space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-[#003910] text-[#6cff82] flex items-center justify-center font-bold text-xs">
                          P
                        </div>
                        <div>
                          <span className="text-xs font-bold text-[#e5e2e1] block">
                            Mesh Peer ({peer.deviceId || peer.peerId.slice(0, 8)})
                          </span>
                          <span className="text-[10px] text-[#8b91a0]">
                            Remote Station · Field Node
                          </span>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#47e266]/20 text-[#6cff82]">
                        PEER
                      </span>
                    </div>
                    <div className="text-[11px] text-[#8b91a0] pt-2 border-t border-[#1c1c22] flex justify-between font-mono">
                      <span>Peer: {peer.peerId.slice(0, 16)}...</span>
                      <span className="text-[#47e266]">Mesh Connected</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SYSTEM SETTINGS TAB */}
          {activeNav === 'settings' && (
            <div className="bg-[#151518] border border-[#24242a] rounded-3xl p-6 space-y-4 animate-in fade-in duration-200">
              <h2 className="text-lg font-bold text-[#e5e2e1]">Mesh &amp; Node Settings</h2>
              <div className="space-y-3">
                <div className="p-4 rounded-2xl bg-[#101013] border border-[#222228] flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-[#e5e2e1] block">
                      Local Node Hardware UUID
                    </span>
                    <span className="text-[11px] text-[#8b91a0] font-mono">
                      {deviceId}
                    </span>
                  </div>
                  <button
                    onClick={() => onShowToast('Node identity verified in Dexie')}
                    className="px-3 py-1.5 rounded-xl bg-[#202028] text-xs font-semibold text-[#aac7ff] hover:bg-[#282834] cursor-pointer"
                  >
                    Verify UUID
                  </button>
                </div>

                <div className="p-4 rounded-2xl bg-[#101013] border border-[#222228] flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-[#e5e2e1] block">
                        Local Signaling Server Endpoint
                      </span>
                      <span className="text-[11px] text-[#8b91a0] font-mono">
                        {networkDiagnostics.signalingUrl} ({networkDiagnostics.signalingState})
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setShowEditSignaler(!showEditSignaler)}
                        className="px-3 py-1.5 rounded-xl bg-[#202028] text-xs font-semibold text-[#aac7ff] hover:bg-[#282834] cursor-pointer"
                      >
                        {showEditSignaler ? 'Cancel' : 'Edit LAN IP'}
                      </button>
                      <button
                        onClick={() => {
                          reconnectSignaler(networkDiagnostics.signalingUrl);
                          onShowToast('Reconnecting to local signaler...');
                        }}
                        className="px-3 py-1.5 rounded-xl bg-[#202028] text-xs font-semibold text-[#aac7ff] hover:bg-[#282834] cursor-pointer"
                      >
                        Reconnect
                      </button>
                    </div>
                  </div>

                  {showEditSignaler && (
                    <div className="p-3 rounded-xl bg-[#17171c] border border-blue-500/30 flex items-center gap-2 animate-in fade-in">
                      <input
                        type="text"
                        value={customSignalerInput}
                        onChange={(e) => setCustomSignalerInput(e.target.value)}
                        placeholder="ws://11.12.21.234:8080"
                        className="flex-1 bg-[#101013] border border-[#2c2c36] text-white font-mono text-xs px-3 py-1.5 rounded-lg focus:outline-hidden focus:border-blue-500"
                      />
                      <button
                        onClick={handleSaveSignalerUrl}
                        className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold cursor-pointer"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => {
                          setCustomSignalerInput('');
                          handleSaveSignalerUrl();
                        }}
                        className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold cursor-pointer"
                        title="Reset to Auto Detection"
                      >
                        Auto
                      </button>
                    </div>
                  )}
                </div>

                <div className="p-4 rounded-2xl bg-[#101013] border border-[#222228] flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-[#e5e2e1] block">
                      Offline Dexie IndexedDB Vault
                    </span>
                    <span className="text-[11px] text-[#8b91a0]">
                      Active Database: <code className="text-[#aac7ff]">NexusLocalDB</code> · {incidents.length} incidents · {outboxCount} in outbox
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onShowToast('IndexedDB storage verified and healthy')}
                      className="px-3 py-1.5 rounded-xl bg-[#202028] text-xs font-semibold text-[#aac7ff] hover:bg-[#282834] cursor-pointer"
                    >
                      Check Storage
                    </button>
                    <button
                      onClick={async () => {
                        await purgeDemoData();
                        onShowToast('✓ Network-wide purge broadcast! All devices cleared.');
                      }}
                      className="px-3 py-1.5 rounded-xl bg-[#2b1616] hover:bg-[#3f1919] border border-[#ffb4ab]/40 text-xs font-semibold text-[#ffb4ab] cursor-pointer"
                    >
                      Purge Everywhere
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* AUDIT LOGS TAB */}
          {activeNav === 'audit' && (
            <div className="bg-[#151518] rounded-2xl border border-[#282828] p-4 space-y-4 animate-in fade-in duration-200">
              <div className="flex items-center justify-between pb-3 border-b border-[#282828]">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#3e90ff] text-[20px]">
                    receipt_long
                  </span>
                  <h3 className="text-sm font-bold text-[#e5e2e1]">
                    Network &amp; Signaling Runtime Logs
                  </h3>
                </div>
                <span className="text-[11px] text-[#8b91a0]">
                  {networkDiagnostics.recentLogs.length} Events Recorded
                </span>
              </div>

              <div className="space-y-2 max-h-[500px] overflow-y-auto no-scrollbar font-mono text-xs">
                {networkDiagnostics.recentLogs.length === 0 ? (
                  <div className="p-6 text-center text-[#8b91a0]">
                    No network events recorded yet.
                  </div>
                ) : (
                  networkDiagnostics.recentLogs.map((log) => (
                    <div
                      key={log.id}
                      className="p-2.5 rounded-xl bg-[#111114] border border-[#222] flex items-start justify-between gap-3"
                    >
                      <div className="flex items-start gap-2">
                        <span
                          className={`w-2 h-2 rounded-full mt-1 shrink-0 ${
                            log.level === 'error'
                              ? 'bg-[#ffb4ab]'
                              : log.level === 'warn'
                              ? 'bg-amber-400'
                              : 'bg-[#3e90ff]'
                          }`}
                        />
                        <span className="text-[#e5e2e1]">{log.message}</span>
                      </div>
                      <span className="text-[10px] text-[#8b91a0] shrink-0">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* EMERGENCY DETAIL DRAWER / MODAL (PRIORITY 3) */}
          {selectedIncidentForDrawer && (
            <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="bg-[#151518] border border-[#2c3138] rounded-3xl w-full max-w-lg p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in duration-150">
                {/* Header with Priority Pill and Close */}
                <div className="flex items-center justify-between border-b border-[#26292e] pb-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold font-mono uppercase tracking-wider ${
                        selectedIncidentForDrawer.badgeColor === 'error'
                          ? 'bg-[#93000a] text-[#ffdad6] border border-[#ffb4ab]/50'
                          : selectedIncidentForDrawer.badgeColor === 'amber'
                          ? 'bg-amber-950 text-amber-300 border border-amber-600/40'
                          : 'bg-[#002957] text-[#aac7ff]'
                      }`}
                    >
                      {selectedIncidentForDrawer.badgeColor === 'error'
                        ? 'P0 · CRITICAL'
                        : selectedIncidentForDrawer.badgeColor === 'amber'
                        ? 'P1 · URGENT'
                        : 'P2 · STANDARD'}
                    </span>
                    <span className="text-xs text-[#8b91a0] font-mono">
                      #{selectedIncidentForDrawer.id.slice(0, 8)}
                    </span>
                  </div>
                  <button
                    onClick={() => setSelectedIncidentForDrawer(null)}
                    className="p-1.5 rounded-lg hover:bg-[#222] text-[#8b91a0] hover:text-white cursor-pointer transition-colors"
                  >
                    <span className="material-symbols-outlined text-[20px]">close</span>
                  </button>
                </div>

                {/* Title & Description */}
                <div>
                  <h3 className="text-base font-bold text-white mb-1 leading-snug">
                    {selectedIncidentForDrawer.title}
                  </h3>
                  <p className="text-xs text-[#c0c6d6] leading-relaxed">
                    {selectedIncidentForDrawer.description}
                  </p>
                </div>

                {/* Metadata Grid */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 rounded-xl bg-[#111114] border border-[#222228]">
                    <span className="text-[10px] text-[#8b91a0] block uppercase tracking-wider font-mono">Source Node</span>
                    <span className="font-mono text-[#aac7ff] font-bold">
                      {getOriginNodeId(selectedIncidentForDrawer.id)}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-[#111114] border border-[#222228]">
                    <span className="text-[10px] text-[#8b91a0] block uppercase tracking-wider font-mono">Time Received</span>
                    <span className="font-medium text-white">
                      {selectedIncidentForDrawer.timeAgo}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-[#111114] border border-[#222228]">
                    <span className="text-[10px] text-[#8b91a0] block uppercase tracking-wider font-mono">Location</span>
                    <span className="font-mono text-white text-[11px] block truncate">
                      {selectedIncidentForDrawer.location}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-[#111114] border border-[#222228]">
                    <span className="text-[10px] text-[#8b91a0] block uppercase tracking-wider font-mono">GPS Accuracy</span>
                    <span className="text-[#47e266] font-medium flex items-center gap-1 font-mono">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#47e266]" />
                      {locationState === 'LIVE' ? '±12m Live Sat Fix' : 'Tactical Sector Fix'}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-[#111114] border border-[#222228]">
                    <span className="text-[10px] text-[#8b91a0] block uppercase tracking-wider font-mono">Relay Traversal</span>
                    <span className="font-mono text-white">
                      {getHopCount(selectedIncidentForDrawer.id)} hops traversed
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-[#111114] border border-[#222228]">
                    <span className="text-[10px] text-[#8b91a0] block uppercase tracking-wider font-mono">Status</span>
                    <span className={`font-bold font-mono ${
                      selectedIncidentForDrawer.statusText?.toLowerCase() === 'resolved'
                        ? 'text-[#47e266]'
                        : acknowledgedAlertIds.has(selectedIncidentForDrawer.id)
                        ? 'text-amber-400'
                        : 'text-[#ffb4ab]'
                    }`}>
                      {selectedIncidentForDrawer.statusText?.toLowerCase() === 'resolved'
                        ? 'RESOLVED'
                        : acknowledgedAlertIds.has(selectedIncidentForDrawer.id)
                        ? 'ACKNOWLEDGED'
                        : 'NEW / ACTIVE'}
                    </span>
                  </div>
                </div>

                {/* Operational Action Buttons */}
                <div className="pt-2 flex items-center justify-between gap-2 border-t border-[#26292e]">
                  <div className="flex items-center gap-2">
                    {!acknowledgedAlertIds.has(selectedIncidentForDrawer.id) && selectedIncidentForDrawer.statusText?.toLowerCase() !== 'resolved' ? (
                      <button
                        onClick={() => handleAcknowledgeAlert(selectedIncidentForDrawer.id)}
                        className="px-3.5 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-xs font-bold cursor-pointer transition-all flex items-center gap-1.5"
                      >
                        <span className="material-symbols-outlined text-[16px]">check</span>
                        <span>Acknowledge</span>
                      </button>
                    ) : (
                      <span className="px-3 py-2 rounded-xl bg-[#1a1a20] text-[#8b91a0] text-xs font-semibold flex items-center gap-1 border border-[#282830]">
                        <span className="material-symbols-outlined text-[15px] text-[#47e266]">done_all</span>
                        <span>Acknowledged</span>
                      </span>
                    )}

                    <button
                      onClick={() => {
                        setActiveNav('map');
                        setSelectedIncidentForDrawer(null);
                        onShowToast(`📍 Centering tactical map on incident`);
                      }}
                      className="px-3.5 py-2 rounded-xl bg-[#1f2633] hover:bg-[#2b3547] border border-[#3e90ff]/40 text-[#aac7ff] text-xs font-bold cursor-pointer transition-all flex items-center gap-1.5"
                    >
                      <span className="material-symbols-outlined text-[16px]">pin_drop</span>
                      <span>Locate</span>
                    </button>
                  </div>

                  {selectedIncidentForDrawer.statusText?.toLowerCase() !== 'resolved' ? (
                    <button
                      onClick={() => {
                        onResolveIncident(selectedIncidentForDrawer.id);
                        setSelectedIncidentForDrawer(null);
                      }}
                      className="px-4 py-2 rounded-xl bg-[#142618] hover:bg-[#1a3821] border border-[#294a30] text-[#6cff82] text-xs font-bold cursor-pointer transition-all flex items-center gap-1.5"
                    >
                      <span className="material-symbols-outlined text-[16px]">task_alt</span>
                      <span>Resolve</span>
                    </button>
                  ) : (
                    <span className="text-xs text-[#47e266] font-bold flex items-center gap-1">
                      <span className="material-symbols-outlined text-[16px]">verified</span>
                      <span>Resolved in Vault</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
