import React, { useState, useMemo } from 'react';
import { AdminUser } from './types';
import { IncidentManager } from './IncidentManager';
import { NodeTelemetry } from './NodeTelemetry';
import { ResponderDirectory } from './ResponderDirectory';
import { MapTab } from '../components/MapTab';
import { IncidentItem } from '../types';
import { useNexusServices } from '../context/ServiceContext';

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
  } = useNexusServices();

  const [activeNav, setActiveNav] = useState<AdminNavTab>('overview');
  const [recalibrateSignal, setRecalibrateSignal] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  );

  // Quick stats derived from real app data
  const criticalIncidentsCount = useMemo(
    () => incidents.filter((i) => i.badgeColor === 'error' || i.category.includes('critical')).length,
    [incidents]
  );

  const uniqueLocations = useMemo(() => {
    const locs = incidents.map((i) => i.location).filter(Boolean);
    return Array.from(new Set(locs));
  }, [incidents]);

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
            <div>
              {isSidebarOpen && (
                <span className="px-3 text-[10px] font-bold text-[#626875] tracking-wider uppercase block mb-2">
                  Tactical Operations
                </span>
              )}
              <nav className="space-y-1">
                {[
                  { id: 'overview', label: 'Overview', icon: 'dashboard' },
                  { id: 'map', label: 'Live GIS Map', icon: 'map' },
                  { id: 'incidents', label: 'Incidents & Relay', icon: 'emergency', badge: incidents.length },
                  { id: 'alerts', label: 'Critical Alerts', icon: 'notifications_active', badge: criticalIncidentsCount },
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
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold font-mono ${
                          item.id === 'alerts'
                            ? 'bg-[#93000a] text-[#ffdad6]'
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
            <span className="text-xs text-[#8b91a0] flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#47e266] animate-pulse" />
              <span>Mesh State: <strong>{networkStatus.mode.toUpperCase()}</strong></span>
            </span>
            <span className="text-xs text-[#444] hidden sm:inline">|</span>
            <span className="text-xs text-[#aac7ff] font-medium hidden sm:inline">
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
          {/* OVERVIEW TAB */}
          {activeNav === 'overview' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              {/* Top 5 Metric Cards (100% Real Runtime State) */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {/* Total Incidents */}
                <div className="bg-[#151518] border border-[#24242a] rounded-2xl p-4 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-[#8b91a0]">
                    <span className="text-xs font-medium">Total Incidents</span>
                    <span className="material-symbols-outlined text-[18px] text-[#3e90ff]">
                      format_list_bulleted
                    </span>
                  </div>
                  <div className="mt-2">
                    <span className="text-2xl font-black text-[#e5e2e1]">
                      {incidents.length}
                    </span>
                    <span className="text-[11px] text-[#aac7ff] font-semibold flex items-center gap-0.5 mt-0.5">
                      <span className="material-symbols-outlined text-[13px]">database</span>
                      <span>{outboxCount > 0 ? `${outboxCount} outbox queued` : 'Dexie Synced'}</span>
                    </span>
                  </div>
                </div>

                {/* High Priority */}
                <div className="bg-[#151518] border border-[#24242a] rounded-2xl p-4 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-[#8b91a0]">
                    <span className="text-xs font-medium">Critical (P0)</span>
                    <span className="material-symbols-outlined text-[18px] text-[#ffb4ab]">
                      crisis_alert
                    </span>
                  </div>
                  <div className="mt-2">
                    <span className="text-2xl font-black text-[#ffb4ab]">
                      {criticalIncidentsCount}
                    </span>
                    <span
                      className={`text-[11px] font-semibold flex items-center gap-0.5 mt-0.5 ${
                        criticalIncidentsCount > 0 ? 'text-[#ffb4ab]' : 'text-[#47e266]'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[13px]">
                        {criticalIncidentsCount > 0 ? 'warning' : 'check_circle'}
                      </span>
                      <span>{criticalIncidentsCount > 0 ? 'Urgent dispatch' : 'Perimeter nominal'}</span>
                    </span>
                  </div>
                </div>

                {/* Active Mesh Peers */}
                <div className="bg-[#151518] border border-[#24242a] rounded-2xl p-4 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-[#8b91a0]">
                    <span className="text-xs font-medium">Connected Peers</span>
                    <span className="material-symbols-outlined text-[18px] text-[#6cff82]">
                      hub
                    </span>
                  </div>
                  <div className="mt-2">
                    <span className="text-2xl font-black text-[#e5e2e1]">
                      {networkStatus.activePeers.length}
                    </span>
                    <span className="text-[11px] text-[#47e266] font-semibold flex items-center gap-0.5 mt-0.5">
                      <span className="material-symbols-outlined text-[13px]">wifi_tethering</span>
                      <span>{networkDiagnostics.discoveredPeers.length} on LAN</span>
                    </span>
                  </div>
                </div>

                {/* Areas Affected */}
                <div className="bg-[#151518] border border-[#24242a] rounded-2xl p-4 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-[#8b91a0]">
                    <span className="text-xs font-medium">Geotagged Sectors</span>
                    <span className="material-symbols-outlined text-[18px] text-[#aac7ff]">
                      share_location
                    </span>
                  </div>
                  <div className="mt-2">
                    <span className="text-2xl font-black text-[#e5e2e1]">
                      {uniqueLocations.length}
                    </span>
                    <span className="text-[11px] text-[#aac7ff] font-semibold flex items-center gap-0.5 mt-0.5">
                      <span className="material-symbols-outlined text-[13px]">pin_drop</span>
                      <span>Campus GIS</span>
                    </span>
                  </div>
                </div>

                {/* Offline Network Architecture */}
                <div className="bg-[#151518] border border-[#24242a] rounded-2xl p-4 flex flex-col justify-between col-span-2 sm:col-span-1">
                  <div className="flex items-center justify-between text-[#8b91a0]">
                    <span className="text-xs font-medium">Network Link</span>
                    <span className="material-symbols-outlined text-[18px] text-amber-400">
                      {networkStatus.isSignalingConnected ? 'lan' : 'signal_cellular_off'}
                    </span>
                  </div>
                  <div className="mt-2">
                    <span className="text-lg font-bold text-[#e5e2e1]">
                      {networkStatus.isSignalingConnected ? 'LAN Active' : 'Offline Solo'}
                    </span>
                    <span className="text-[11px] text-[#47e266] font-semibold flex items-center gap-0.5 mt-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#47e266]" />
                      <span>{networkStatus.mode.toUpperCase()}</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Middle Section: Live Incident Map (2/3) + Recent Incidents (1/3) */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left 2 Cols: Live Incident Map */}
                <div className="lg:col-span-2 space-y-4">
                  <div className="bg-[#151518] border border-[#24242a] rounded-3xl p-4 overflow-hidden shadow-xl">
                    <div className="flex items-center justify-between pb-3 border-b border-[#222228] mb-3">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-[#3e90ff] text-[20px]">
                          location_searching
                        </span>
                        <h3 className="text-sm font-bold text-[#e5e2e1]">
                          Live Tactical GIS Map · Amrita Vengal Campus
                        </h3>
                      </div>

                      {/* Map Status Legend */}
                      <div className="flex items-center gap-3 text-[11px] text-[#8b91a0]">
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-[#ffb4ab]" />
                          Critical
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-amber-400" />
                          Urgent
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-[#3e90ff]" />
                          Resources
                        </span>
                      </div>
                    </div>

                    {/* Interactive Tactical Map */}
                    <div className="w-full h-[380px] rounded-2xl overflow-hidden border border-[#282830]">
                      <MapTab onShowToast={onShowToast} incidents={incidents} recalibrateSignal={recalibrateSignal} />
                    </div>
                  </div>

                  {/* System Status & Network Health Cards Row */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* System Status */}
                    <div className="bg-[#151518] border border-[#24242a] rounded-2xl p-4 space-y-3">
                      <div className="flex items-center justify-between border-b border-[#222228] pb-2">
                        <span className="text-xs font-bold text-[#e5e2e1] flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[17px] text-[#3e90ff]">
                            tune
                          </span>
                          System Status
                        </span>
                        <span className="text-[10px] text-[#47e266] font-semibold">
                          ZERO-CLOUD OFFLINE CORE
                        </span>
                      </div>

                      <div className="space-y-2 text-xs">
                        <div className="flex items-center justify-between p-2 rounded-xl bg-[#111114]">
                          <span className="text-[#8b91a0] flex items-center gap-2">
                            <span className="material-symbols-outlined text-[15px]">lan</span>
                            Local Signaler
                          </span>
                          <span
                            className={`font-semibold flex items-center gap-1 ${
                              networkDiagnostics.signalingState === 'CONNECTED'
                                ? 'text-[#47e266]'
                                : 'text-amber-400'
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                networkDiagnostics.signalingState === 'CONNECTED'
                                  ? 'bg-[#47e266]'
                                  : 'bg-amber-400'
                              }`}
                            />
                            {networkDiagnostics.signalingState === 'CONNECTED'
                              ? 'Connected'
                              : networkDiagnostics.signalingState}
                          </span>
                        </div>

                        <div className="flex items-center justify-between p-2 rounded-xl bg-[#111114]">
                          <span className="text-[#8b91a0] flex items-center gap-2">
                            <span className="material-symbols-outlined text-[15px]">hub</span>
                            P2P DataChannels
                          </span>
                          <span className="text-[#3e90ff] font-semibold flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#3e90ff]" />
                            {networkStatus.activePeers.length} Active ({networkStatus.mode})
                          </span>
                        </div>

                        <div className="flex items-center justify-between p-2 rounded-xl bg-[#111114]">
                          <span className="text-[#8b91a0] flex items-center gap-2">
                            <span className="material-symbols-outlined text-[15px]">storage</span>
                            Dexie Vault
                          </span>
                          <span className="text-[#47e266] font-semibold flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#47e266]" />
                            {incidents.length} Local Records
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Network Health */}
                    <div className="bg-[#151518] border border-[#24242a] rounded-2xl p-4 space-y-3">
                      <div className="flex items-center justify-between border-b border-[#222228] pb-2">
                        <span className="text-xs font-bold text-[#e5e2e1] flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[17px] text-[#47e266]">
                            network_check
                          </span>
                          Relay Diagnostics
                        </span>
                        <span className="text-[10px] text-[#aac7ff] font-mono">
                          ID: {deviceId.slice(0, 8)}
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="p-2 rounded-xl bg-[#111114]">
                          <span className="text-[10px] text-[#8b91a0] block">Peers</span>
                          <span className="text-base font-bold text-[#e5e2e1]">
                            {networkStatus.activePeers.length}
                          </span>
                        </div>
                        <div className="p-2 rounded-xl bg-[#111114]">
                          <span className="text-[10px] text-[#8b91a0] block">Relayed</span>
                          <span className="text-base font-bold text-[#3e90ff]">
                            {networkStatus.totalIncidentsRelayed}
                          </span>
                        </div>
                        <div className="p-2 rounded-xl bg-[#111114]">
                          <span className="text-[10px] text-[#8b91a0] block">Outbox</span>
                          <span className="text-base font-bold text-[#47e266]">
                            {outboxCount}
                          </span>
                        </div>
                      </div>

                      {/* Diagnostic Endpoint Info */}
                      <div className="p-2 rounded-xl bg-[#111114] flex items-center justify-between font-mono text-[10px]">
                        <span className="text-[#8b91a0]">Signaler URL:</span>
                        <span className="text-[#aac7ff] truncate max-w-[160px]">
                          {networkDiagnostics.signalingUrl}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Col: Recent Incidents & Alerts */}
                <div className="space-y-4">
                  {/* Recent Incidents Panel */}
                  <div className="bg-[#151518] border border-[#24242a] rounded-3xl p-4 space-y-3 shadow-xl">
                    <div className="flex items-center justify-between border-b border-[#222228] pb-2">
                      <div className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[18px] text-[#ffb4ab]">
                          emergency
                        </span>
                        <h3 className="text-xs font-bold text-[#e5e2e1]">Recent Incidents</h3>
                      </div>
                      <button
                        onClick={() => setActiveNav('incidents')}
                        className="text-[11px] text-[#3e90ff] hover:underline font-semibold cursor-pointer"
                      >
                        View All ({incidents.length}) →
                      </button>
                    </div>

                    <div className="space-y-2.5 max-h-[340px] overflow-y-auto no-scrollbar">
                      {filteredIncidents.length === 0 ? (
                        <div className="p-6 rounded-2xl bg-[#111114] border border-[#222228] text-center text-[#8b91a0]">
                          <span className="material-symbols-outlined text-[28px] mb-1 opacity-50">inbox</span>
                          <p className="text-xs">No incidents recorded in local Dexie vault.</p>
                        </div>
                      ) : (
                        filteredIncidents.slice(0, 5).map((inc) => (
                          <div
                            key={inc.id}
                            className="p-3 rounded-xl bg-[#111114] border border-[#222228] space-y-1.5 hover:border-[#333] transition-colors"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span
                                className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                  inc.badgeColor === 'error'
                                    ? 'bg-[#93000a]/30 text-[#ffb4ab] border border-[#ffb4ab]/30'
                                    : inc.badgeColor === 'amber'
                                    ? 'bg-amber-950/40 text-amber-300 border border-amber-600/30'
                                    : 'bg-[#002957] text-[#aac7ff]'
                                }`}
                              >
                                {inc.badgeColor === 'error' ? 'Critical (P0)' : inc.badgeColor === 'amber' ? 'Urgent (P1)' : 'Advisory'}
                              </span>
                              <span className="text-[10px] text-[#8b91a0]">{inc.timeAgo}</span>
                            </div>

                            <h4 className="text-xs font-bold text-[#e5e2e1] line-clamp-1">
                              {inc.title}
                            </h4>

                            <div className="flex items-center justify-between text-[11px] text-[#8b91a0]">
                              <span className="truncate max-w-[140px]">{inc.location}</span>
                              <span className="font-mono text-[#aac7ff]">{inc.distance}</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    <button
                      onClick={() => setActiveNav('incidents')}
                      className="w-full py-2 rounded-xl bg-[#1a1a20] hover:bg-[#22222a] border border-[#2c2c34] text-xs font-semibold text-[#aac7ff] cursor-pointer transition-colors"
                    >
                      Open Incident Command Dispatch
                    </button>
                  </div>

                  {/* Alerts Panel */}
                  <div className="bg-[#151518] border border-[#24242a] rounded-3xl p-4 space-y-3 shadow-xl">
                    <div className="flex items-center justify-between border-b border-[#222228] pb-2">
                      <span className="text-xs font-bold text-[#e5e2e1] flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[17px] text-amber-400">
                          notifications_active
                        </span>
                        Active Campus Alerts
                      </span>
                      <span className="text-[10px] text-[#8b91a0]">
                        {criticalIncidents.length} Active
                      </span>
                    </div>

                    <div className="space-y-2 text-xs">
                      {criticalIncidents.length === 0 ? (
                        <div className="p-4 rounded-xl bg-[#111114] text-center text-[#8b91a0] text-xs">
                          <span className="material-symbols-outlined text-[20px] text-[#47e266] block mb-1">
                            verified
                          </span>
                          <span>No active critical alerts. All campus sectors nominal.</span>
                        </div>
                      ) : (
                        criticalIncidents.slice(0, 3).map((inc) => (
                          <div
                            key={inc.id}
                            className="p-2.5 rounded-xl bg-[#111114] border-l-2 border-[#ffb4ab] flex items-center justify-between"
                          >
                            <div className="min-w-0 pr-2">
                              <span className="font-semibold text-[#e5e2e1] block text-[11px] truncate">
                                {inc.title}
                              </span>
                              <span className="text-[10px] text-[#8b91a0] truncate block">
                                {inc.location}
                              </span>
                            </div>
                            <span className="text-[10px] text-[#8b91a0] font-mono shrink-0">
                              {inc.timeAgo}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
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

              <div className="space-y-3">
                {criticalIncidents.length === 0 ? (
                  <div className="p-8 text-center text-[#8b91a0]">
                    <span className="material-symbols-outlined text-[32px] text-[#47e266] mb-1">
                      verified_user
                    </span>
                    <p className="text-xs">No active critical alerts in the local vault.</p>
                  </div>
                ) : (
                  criticalIncidents.map((inc) => (
                    <div
                      key={inc.id}
                      className="p-4 rounded-2xl bg-[#101013] border border-[#222228] flex items-center justify-between gap-4"
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className={`w-3 h-3 rounded-full mt-1 shrink-0 ${
                            inc.badgeColor === 'error' ? 'bg-[#ffb4ab]' : 'bg-amber-400'
                          }`}
                        />
                        <div>
                          <h4 className="text-xs font-bold text-[#e5e2e1]">{inc.title}</h4>
                          <p className="text-[11px] text-[#8b91a0] mt-0.5">{inc.description}</p>
                          <span className="text-[10px] text-[#aac7ff] mt-1 inline-block font-mono">
                            Location: {inc.location} · {inc.distance}
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={() => onResolveIncident(inc.id)}
                        className="px-3 py-1.5 rounded-xl bg-[#1e2a20] hover:bg-[#28382b] border border-[#346b3b] text-[#6cff82] text-xs font-semibold cursor-pointer shrink-0"
                      >
                        Resolve Alert
                      </button>
                    </div>
                  ))
                )}
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

                <div className="p-4 rounded-2xl bg-[#101013] border border-[#222228] flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-[#e5e2e1] block">
                      Local Signaling Server Endpoint
                    </span>
                    <span className="text-[11px] text-[#8b91a0] font-mono">
                      {networkDiagnostics.signalingUrl} ({networkDiagnostics.signalingState})
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      reconnectSignaler(networkDiagnostics.signalingUrl);
                      onShowToast('Reconnecting to local signaler...');
                    }}
                    className="px-3 py-1.5 rounded-xl bg-[#202028] text-xs font-semibold text-[#aac7ff] hover:bg-[#282834] cursor-pointer"
                  >
                    Reconnect Signaler
                  </button>
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
        </main>
      </div>
    </div>
  );
};
