import React, { useState } from 'react';
import { AdminUser } from './types';
import { IncidentManager } from './IncidentManager';
import { NodeTelemetry } from './NodeTelemetry';
import { ResponderDirectory } from './ResponderDirectory';
import { MapTab } from '../components/MapTab';
import { IncidentItem } from '../types';

interface AdminDashboardProps {
  adminUser: AdminUser;
  incidents: IncidentItem[];
  onAddIncident: (data: {
    title: string;
    description: string;
    location: string;
    category: string;
    badgeColor?: 'error' | 'amber' | 'primary';
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
  const [activeNav, setActiveNav] = useState<AdminNavTab>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  );

  // Quick stats derived from real app data
  const criticalIncidentsCount = incidents.filter(
    (i) => i.badgeColor === 'error' || i.category.includes('critical')
  ).length;

  const filteredIncidents = incidents.filter(
    (i) =>
      i.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      i.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
      i.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen w-full bg-[#0c0c0d] text-[#e5e2e1] flex overflow-x-hidden font-sans select-none">
      {/* 1. LEFT SIDEBAR (Matching the Command Dashboard architecture in the diagrams) */}
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
                    COMMAND v4.2
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
                  Main
                </span>
              )}
              <nav className="space-y-1">
                {[
                  { id: 'overview', label: 'Overview', icon: 'dashboard' },
                  { id: 'map', label: 'Live Map', icon: 'map' },
                  { id: 'incidents', label: 'Incidents', icon: 'emergency', badge: incidents.length },
                  { id: 'alerts', label: 'Alerts', icon: 'notifications_active', badge: criticalIncidentsCount },
                  { id: 'responders', label: 'Responders', icon: 'groups' },
                  { id: 'analytics', label: 'Analytics & Nodes', icon: 'show_chart' },
                ].map((item) => {
                  const isActive = activeNav === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveNav(item.id as AdminNavTab)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                        isActive
                          ? 'bg-[#3e90ff] text-[#002957] font-bold shadow-md shadow-[#3e90ff]/20'
                          : 'text-[#9ea3ae] hover:text-[#e5e2e1] hover:bg-[#1a1a1e]'
                      }`}
                      title={item.label}
                    >
                      <span className="material-symbols-outlined text-[19px] shrink-0">
                        {item.icon}
                      </span>
                      {isSidebarOpen && <span className="truncate">{item.label}</span>}
                      {isSidebarOpen && item.badge !== undefined && item.badge > 0 && (
                        <span
                          className={`ml-auto px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                            isActive
                              ? 'bg-[#002957] text-[#aac7ff]'
                              : 'bg-[#29292e] text-[#aac7ff]'
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* MANAGEMENT SECTION */}
            <div>
              {isSidebarOpen && (
                <span className="px-3 text-[10px] font-bold text-[#626875] tracking-wider uppercase block mb-2">
                  Management
                </span>
              )}
              <nav className="space-y-1">
                {[
                  { id: 'users', label: 'Users & Roles', icon: 'badge' },
                  { id: 'settings', label: 'System Settings', icon: 'tune' },
                  { id: 'audit', label: 'Audit Logs', icon: 'verified_user' },
                ].map((item) => {
                  const isActive = activeNav === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveNav(item.id as AdminNavTab)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                        isActive
                          ? 'bg-[#3e90ff] text-[#002957] font-bold shadow-md shadow-[#3e90ff]/20'
                          : 'text-[#9ea3ae] hover:text-[#e5e2e1] hover:bg-[#1a1a1e]'
                      }`}
                      title={item.label}
                    >
                      <span className="material-symbols-outlined text-[19px] shrink-0">
                        {item.icon}
                      </span>
                      {isSidebarOpen && <span className="truncate">{item.label}</span>}
                    </button>
                  );
                })}
              </nav>
            </div>
          </div>
        </div>

        {/* Sidebar Footer Controls */}
        <div className="p-3 border-t border-[#202024] space-y-2 bg-[#0e0e10]">
          {/* Offline Mode Switcher */}
          <div
            onClick={onToggleInternet}
            className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition-colors ${
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

          {/* Switch to Field Mobile App Preview */}
          <button
            onClick={onSwitchToFieldView}
            className="w-full flex items-center justify-center gap-2 p-2 rounded-xl bg-[#1a1a1f] hover:bg-[#24242a] border border-[#2b2b32] text-xs text-[#aac7ff] cursor-pointer transition-all active:scale-[0.98]"
            title="Preview Mobile Field Responder App"
          >
            <span className="material-symbols-outlined text-[17px]">smartphone</span>
            {isSidebarOpen && <span>Field App View</span>}
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
              <span>Last Sync: <strong>Just now</strong></span>
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
                placeholder="Search incidents, nodes, responders..."
                className="w-64 bg-[#18181c] border border-[#28282e] focus:border-[#3e90ff] rounded-xl py-1.5 pl-8 pr-3 text-xs text-[#e5e2e1] outline-none transition-all placeholder-[#555]"
              />
            </div>

            {/* Quick Refresh */}
            <button
              onClick={() => onShowToast('System synchronized with Amrita Vengal Gateway')}
              className="p-2 rounded-xl bg-[#18181c] hover:bg-[#222228] border border-[#28282e] text-[#c0c6d6] cursor-pointer"
              title="Sync Mesh Telemetry"
            >
              <span className="material-symbols-outlined text-[18px]">refresh</span>
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
              {/* Top 5 Metric Cards matching the diagram */}
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
                      {120 + incidents.length}
                    </span>
                    <span className="text-[11px] text-[#47e266] font-semibold flex items-center gap-0.5 mt-0.5">
                      <span className="material-symbols-outlined text-[13px]">trending_up</span>
                      <span>+18% vs last 24h</span>
                    </span>
                  </div>
                </div>

                {/* High Priority */}
                <div className="bg-[#151518] border border-[#24242a] rounded-2xl p-4 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-[#8b91a0]">
                    <span className="text-xs font-medium">High Priority</span>
                    <span className="material-symbols-outlined text-[18px] text-[#ffb4ab]">
                      crisis_alert
                    </span>
                  </div>
                  <div className="mt-2">
                    <span className="text-2xl font-black text-[#ffb4ab]">
                      {20 + criticalIncidentsCount}
                    </span>
                    <span className="text-[11px] text-[#47e266] font-semibold flex items-center gap-0.5 mt-0.5">
                      <span className="material-symbols-outlined text-[13px]">trending_down</span>
                      <span>-8% vs last 24h</span>
                    </span>
                  </div>
                </div>

                {/* Active Responders */}
                <div className="bg-[#151518] border border-[#24242a] rounded-2xl p-4 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-[#8b91a0]">
                    <span className="text-xs font-medium">Active Responders</span>
                    <span className="material-symbols-outlined text-[18px] text-[#6cff82]">
                      groups
                    </span>
                  </div>
                  <div className="mt-2">
                    <span className="text-2xl font-black text-[#e5e2e1]">56</span>
                    <span className="text-[11px] text-[#47e266] font-semibold flex items-center gap-0.5 mt-0.5">
                      <span className="material-symbols-outlined text-[13px]">trending_up</span>
                      <span>+12% vs last 24h</span>
                    </span>
                  </div>
                </div>

                {/* Areas Affected */}
                <div className="bg-[#151518] border border-[#24242a] rounded-2xl p-4 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-[#8b91a0]">
                    <span className="text-xs font-medium">Areas Affected</span>
                    <span className="material-symbols-outlined text-[18px] text-[#aac7ff]">
                      share_location
                    </span>
                  </div>
                  <div className="mt-2">
                    <span className="text-2xl font-black text-[#e5e2e1]">12</span>
                    <span className="text-[11px] text-[#ffb4ab] font-semibold flex items-center gap-0.5 mt-0.5">
                      <span className="material-symbols-outlined text-[13px]">trending_up</span>
                      <span>+5% vs last 24h</span>
                    </span>
                  </div>
                </div>

                {/* Offline Nodes */}
                <div className="bg-[#151518] border border-[#24242a] rounded-2xl p-4 flex flex-col justify-between col-span-2 sm:col-span-1">
                  <div className="flex items-center justify-between text-[#8b91a0]">
                    <span className="text-xs font-medium">Offline Nodes</span>
                    <span className="material-symbols-outlined text-[18px] text-amber-400">
                      signal_cellular_off
                    </span>
                  </div>
                  <div className="mt-2">
                    <span className="text-2xl font-black text-[#e5e2e1]">
                      {isInternetConnected ? '0' : '7'}
                    </span>
                    <span className="text-[11px] text-[#47e266] font-semibold flex items-center gap-0.5 mt-0.5">
                      <span className="material-symbols-outlined text-[13px]">trending_down</span>
                      <span>-3 vs last 24h</span>
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
                          Live Incident Map · Amrita Vengal Campus
                        </h3>
                      </div>

                      {/* Map Status Legend */}
                      <div className="flex items-center gap-3 text-[11px] text-[#8b91a0]">
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-[#ffb4ab]" />
                          High
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-amber-400" />
                          Medium
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-[#47e266]" />
                          Low
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-[#3e90ff]" />
                          Responders
                        </span>
                      </div>
                    </div>

                    {/* Interactive Leaflet Map Container */}
                    <div className="w-full h-[380px] rounded-2xl overflow-hidden border border-[#282830]">
                      <MapTab onShowToast={onShowToast} incidents={incidents} />
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
                        <span className="text-[10px] text-[#47e266] font-semibold">ALL OPERATIONAL</span>
                      </div>

                      <div className="space-y-2 text-xs">
                        <div className="flex items-center justify-between p-2 rounded-xl bg-[#111114]">
                          <span className="text-[#8b91a0] flex items-center gap-2">
                            <span className="material-symbols-outlined text-[15px]">lan</span>
                            Local Network
                          </span>
                          <span className="text-[#47e266] font-semibold flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#47e266]" />
                            Connected
                          </span>
                        </div>

                        <div className="flex items-center justify-between p-2 rounded-xl bg-[#111114]">
                          <span className="text-[#8b91a0] flex items-center gap-2">
                            <span className="material-symbols-outlined text-[15px]">cloud_sync</span>
                            Cloud Sync
                          </span>
                          <span
                            className={`font-semibold flex items-center gap-1 ${
                              isInternetConnected ? 'text-[#47e266]' : 'text-amber-400'
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                isInternetConnected ? 'bg-[#47e266]' : 'bg-amber-400'
                              }`}
                            />
                            {isInternetConnected ? 'Connected' : 'Offline Cached'}
                          </span>
                        </div>

                        <div className="flex items-center justify-between p-2 rounded-xl bg-[#111114]">
                          <span className="text-[#8b91a0] flex items-center gap-2">
                            <span className="material-symbols-outlined text-[15px]">hub</span>
                            Relay Network
                          </span>
                          <span className="text-[#3e90ff] font-semibold flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#3e90ff]" />
                            Active (5 Relays)
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
                          Network Health
                        </span>
                        <span className="text-[10px] text-[#aac7ff] font-mono">98.6% RELIABLE</span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="p-2 rounded-xl bg-[#111114]">
                          <span className="text-[10px] text-[#8b91a0] block">Peers</span>
                          <span className="text-base font-bold text-[#e5e2e1]">24</span>
                        </div>
                        <div className="p-2 rounded-xl bg-[#111114]">
                          <span className="text-[10px] text-[#8b91a0] block">Relayed (24h)</span>
                          <span className="text-base font-bold text-[#3e90ff]">1,248</span>
                        </div>
                        <div className="p-2 rounded-xl bg-[#111114]">
                          <span className="text-[10px] text-[#8b91a0] block">Success Rate</span>
                          <span className="text-base font-bold text-[#47e266]">98.6%</span>
                        </div>
                      </div>

                      {/* Sparkline visualization */}
                      <div className="p-2 rounded-xl bg-[#111114] flex items-center justify-between">
                        <span className="text-[11px] text-[#8b91a0]">Packet Throughput</span>
                        <div className="flex items-end gap-1 h-6">
                          {[30, 45, 60, 50, 75, 90, 85, 95, 80, 100].map((val, idx) => (
                            <div
                              key={idx}
                              style={{ height: `${val}%` }}
                              className="w-1.5 bg-[#3e90ff] rounded-t-xs"
                            />
                          ))}
                        </div>
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
                        View All →
                      </button>
                    </div>

                    <div className="space-y-2.5 max-h-[340px] overflow-y-auto no-scrollbar">
                      {filteredIncidents.slice(0, 5).map((inc) => (
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
                              {inc.badgeColor === 'error' ? 'High' : inc.badgeColor === 'amber' ? 'Medium' : 'Low'}
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
                      ))}
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
                        Live Campus Alerts
                      </span>
                      <span className="text-[10px] text-[#8b91a0]">3 New</span>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="p-2.5 rounded-xl bg-[#111114] border-l-2 border-[#ffb4ab] flex items-center justify-between">
                        <div>
                          <span className="font-semibold text-[#e5e2e1] block text-[11px]">
                            High priority incident reported
                          </span>
                          <span className="text-[10px] text-[#8b91a0]">Zone North Perimeter</span>
                        </div>
                        <span className="text-[10px] text-[#8b91a0] font-mono">2 min ago</span>
                      </div>

                      <div className="p-2.5 rounded-xl bg-[#111114] border-l-2 border-amber-400 flex items-center justify-between">
                        <div>
                          <span className="font-semibold text-[#e5e2e1] block text-[11px]">
                            Relay path unstable: Agastya Block
                          </span>
                          <span className="text-[10px] text-[#8b91a0]">Routing over fallback BLE</span>
                        </div>
                        <span className="text-[10px] text-[#8b91a0] font-mono">5 min ago</span>
                      </div>

                      <div className="p-2.5 rounded-xl bg-[#111114] border-l-2 border-[#3e90ff] flex items-center justify-between">
                        <div>
                          <span className="font-semibold text-[#e5e2e1] block text-[11px]">
                            Responder Unit Alpha on scene
                          </span>
                          <span className="text-[10px] text-[#8b91a0]">Medical Post Vengal PHC</span>
                        </div>
                        <span className="text-[10px] text-[#8b91a0] font-mono">12 min ago</span>
                      </div>
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
                  onClick={() => onShowToast('GPS perimeter recalculated: Accuracy ±2m')}
                  className="px-3 py-1.5 rounded-xl bg-[#1f1f26] hover:bg-[#282832] text-xs font-semibold text-[#aac7ff] border border-[#333] cursor-pointer"
                >
                  Recalibrate GIS
                </button>
              </div>

              <div className="w-full h-[620px] rounded-3xl overflow-hidden border border-[#26262e] shadow-2xl">
                <MapTab onShowToast={onShowToast} incidents={incidents} />
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
                      badgeColor: 'amber',
                    });
                    onShowToast('Emergency Weather Alert pushed across mesh');
                  }}
                  className="px-4 py-2 rounded-xl bg-[#ffb4ab] text-[#93000a] font-bold text-xs cursor-pointer hover:bg-white transition-colors"
                >
                  Dispatch Campus Precaution Alert
                </button>
              </div>

              <div className="space-y-3">
                {incidents.map((inc) => (
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
                ))}
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
                  <h2 className="text-lg font-bold text-[#e5e2e1]">User &amp; Role Directory</h2>
                  <p className="text-xs text-[#8b91a0]">
                    Manage access privileges for Command Staff, Field Responders, and Volunteers
                  </p>
                </div>
                <span className="px-3 py-1 rounded-full bg-[#202028] text-xs text-[#aac7ff] font-bold">
                  24 Registered Mesh Nodes
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-4 rounded-2xl bg-[#101013] border border-[#222228] space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-[#002957] text-[#aac7ff] flex items-center justify-center font-bold text-xs">
                        RK
                      </div>
                      <div>
                        <span className="text-xs font-bold text-[#e5e2e1] block">
                          Dr. Rajesh K.
                        </span>
                        <span className="text-[10px] text-[#8b91a0]">
                          Incident Commander · Command Staff
                        </span>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#3e90ff]/20 text-[#aac7ff]">
                      ADMIN
                    </span>
                  </div>
                  <div className="text-[11px] text-[#8b91a0] pt-2 border-t border-[#1c1c22] flex justify-between">
                    <span>Node: CMD-AMRITA-VENGAL-01</span>
                    <span className="text-[#47e266]">Active Session</span>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-[#101013] border border-[#222228] space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-[#003910] text-[#6cff82] flex items-center justify-center font-bold text-xs">
                        RM
                      </div>
                      <div>
                        <span className="text-xs font-bold text-[#e5e2e1] block">
                          Rahul M.
                        </span>
                        <span className="text-[10px] text-[#8b91a0]">
                          Student Responder · Field Operations
                        </span>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#47e266]/20 text-[#6cff82]">
                      RESPONDER
                    </span>
                  </div>
                  <div className="text-[11px] text-[#8b91a0] pt-2 border-t border-[#1c1c22] flex justify-between">
                    <span>Node: NEXUS-NODE-8942</span>
                    <span className="text-[#47e266]">Mesh Peer Online</span>
                  </div>
                </div>
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
                      AES-256 Mesh Encryption Key
                    </span>
                    <span className="text-[11px] text-[#8b91a0]">
                      Key fingerprint: 0x9F4C...B288 (Rotated every 24h)
                    </span>
                  </div>
                  <button
                    onClick={() => onShowToast('Mesh keys rotated across all 5 repeaters')}
                    className="px-3 py-1.5 rounded-xl bg-[#202028] text-xs font-semibold text-[#aac7ff] hover:bg-[#282834] cursor-pointer"
                  >
                    Rotate Keys
                  </button>
                </div>

                <div className="p-4 rounded-2xl bg-[#101013] border border-[#222228] flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-[#e5e2e1] block">
                      Offline Incident Cache Buffer
                    </span>
                    <span className="text-[11px] text-[#8b91a0]">
                      IndexedDB local storage: 1.4 MB / 50 MB
                    </span>
                  </div>
                  <button
                    onClick={() => onShowToast('Local IndexedDB verified and compacted')}
                    className="px-3 py-1.5 rounded-xl bg-[#202028] text-xs font-semibold text-[#aac7ff] hover:bg-[#282834] cursor-pointer"
                  >
                    Compact Cache
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* AUDIT LOGS TAB */}
          {activeNav === 'audit' && (
            <div className="animate-in fade-in duration-200">
              <ResponderDirectory onShowToast={onShowToast} />
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
