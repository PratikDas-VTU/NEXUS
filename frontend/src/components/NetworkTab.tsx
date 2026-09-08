import React, { useState } from 'react';
import { MeshPeer } from '../types';
import { meshPeers } from '../data/mockData';
import type { RelayNetworkStatus } from '../../../shared/interfaces';
import { useNexusServices } from '../context/ServiceContext';
import { useNearbyMesh, type NearbyNode } from '../hooks/useNearbyMesh';
import { normalizeSignalingUrl } from '../services/api/config';

interface NetworkTabProps {
  onShowToast: (msg: string) => void;
  isInternetConnected?: boolean;
  onToggleInternet?: () => void;
  networkStatus?: RelayNetworkStatus;
}

export const NetworkTab: React.FC<NetworkTabProps> = ({
  onShowToast,
  isInternetConnected = false,
  onToggleInternet,
  networkStatus: propNetworkStatus,
}) => {
  const {
    networkStatus: ctxNetworkStatus,
    networkDiagnostics,
    reconnectSignaler,
    deviceId,
    createIncident,
  } = useNexusServices();

  const networkStatus = propNetworkStatus || ctxNetworkStatus;
  const [peers] = useState<MeshPeer[]>(meshPeers);
  const [highlightedPeerId, setHighlightedPeerId] = useState<string | null>(null);
  const [showLiveConsole, setShowLiveConsole] = useState<boolean>(false);
  const [isReconnecting, setIsReconnecting] = useState<boolean>(false);
  const [showSimulatedReference, setShowSimulatedReference] = useState<boolean>(false);
  const [showEditSignaler, setShowEditSignaler] = useState<boolean>(false);
  const [customSignalerInput, setCustomSignalerInput] = useState<string>(() => {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem('nexus_custom_signaling_url') || '';
    }
    return '';
  });

  // Real Android Nearby Connections hook
  const nearby = useNearbyMesh({
    localDeviceId: deviceId,
    onToast: onShowToast,
  });

  const realPeerCount = networkStatus?.activePeers?.length ?? 0;
  const isSignalingConnected = networkDiagnostics.signalingState === 'CONNECTED';

  const handleManualReconnect = async () => {
    setIsReconnecting(true);
    onShowToast('Reconnecting to local LAN signaling server...');
    try {
      await reconnectSignaler();
      setTimeout(() => setIsReconnecting(false), 800);
    } catch {
      setIsReconnecting(false);
    }
  };

  const handleSaveSignalerUrl = async () => {
    let target = customSignalerInput.trim();
    setIsReconnecting(true);
    if (target) {
      target = normalizeSignalingUrl(target);
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
    setTimeout(() => setIsReconnecting(false), 800);
    setShowEditSignaler(false);
  };

  const handleSelectSimulatedPeer = (peer: MeshPeer) => {
    setHighlightedPeerId(peer.id);
    onShowToast(`Simulated demo ping: ${peer.name} (Demo reference only)`);
    setTimeout(() => {
      setHighlightedPeerId(null);
    }, 2000);
  };

  const handleSendTestNearbyIncident = async (node: NearbyNode) => {
    try {
      await createIncident({
        type: 'safety',
        priority: 'P1',
        latitude: 13.2384,
        longitude: 80.0094,
        peopleAffected: 1,
        description: `Nearby test ping from ${deviceId.slice(0, 8)} to ${node.endpointName} (${node.endpointId})`,
      });
      onShowToast(`Dispatched test incident via RelayEngine to ${node.endpointName}`);
    } catch (err: any) {
      onShowToast(`Failed to dispatch test incident: ${err?.message}`);
    }
  };

  const renderSignalBars = (filledCount: number) => {
    return (
      <div className="flex items-end gap-0.5 h-3">
        {[1, 2, 3, 4].map((barIndex) => {
          const isFilled = barIndex <= filledCount;
          const heightClass =
            barIndex === 1 ? 'h-1' : barIndex === 2 ? 'h-1.5' : barIndex === 3 ? 'h-2.5' : 'h-3';
          return (
            <span
              key={barIndex}
              className={`w-1 rounded-xs transition-colors ${
                isFilled ? 'bg-emerald-400' : 'bg-zinc-700'
              } ${heightClass}`}
            />
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex-1 min-h-0 w-full flex flex-col px-3.5 sm:px-4 pt-2.5 pb-8 gap-3.5 overflow-y-auto no-scrollbar">
      {/* ─── HEADER & NETWORK HEALTH OVERVIEW ─────────────────────────────────── */}
      <div className="flex items-center justify-between pt-0.5 shrink-0">
        <div className="flex flex-col">
          <h1 className="text-[17px] font-bold text-zinc-100 tracking-tight">Nearby Mesh Network</h1>
          <p className="text-[11.5px] text-zinc-400">
            {nearby.connectedCount > 0
              ? `${nearby.connectedCount} Physical Nearby Node${nearby.connectedCount > 1 ? 's' : ''} Connected`
              : nearby.isScanning
              ? `Scanning Nearby radio · ${nearby.discoveredCount} detected`
              : 'Standby · Ready for physical Android discovery'}
          </p>
        </div>

        {/* Quick status badge */}
        <span
          className={`px-2.5 py-1 rounded-full text-[10.5px] font-bold font-mono flex items-center gap-1.5 border ${
            nearby.connectedCount > 0
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
              : nearby.isScanning
              ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
              : 'bg-zinc-800/80 text-zinc-400 border-zinc-700/60'
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              nearby.connectedCount > 0
                ? 'bg-emerald-400 animate-pulse'
                : nearby.isScanning
                ? 'bg-blue-400 animate-pulse'
                : 'bg-zinc-500'
            }`}
          />
          {nearby.connectedCount > 0
            ? 'MESH ACTIVE'
            : nearby.isScanning
            ? 'SCANNING'
            : 'STANDBY'}
        </span>
      </div>

      {/* ─── SECTION 1: REAL NEARBY CONNECTIONS HERO CONTROL ───────────────────── */}
      <div className="p-3.5 sm:p-4 rounded-2xl bg-[#15171a] border border-[#22262b] shadow-sm flex flex-col gap-3 shrink-0">
        {/* Title & Radio Badge */}
        <div className="flex items-center justify-between border-b border-[#22262b] pb-2.5">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[19px] text-blue-400">
              nearby
            </span>
            <div className="flex flex-col">
              <span className="text-[13.5px] font-bold text-zinc-200 tracking-tight leading-tight">
                Real Android Nearby Connections
              </span>
              <span className="text-[10px] text-zinc-400 font-mono leading-tight">
                Google Play Services · P2P Cluster · nexus-mesh-v1
              </span>
            </div>
          </div>

          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1.5 border ${
              nearby.isScanning
                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                : nearby.preflightState === 'READY'
                ? 'bg-blue-500/15 text-blue-300 border-blue-500/30'
                : nearby.preflightState === 'PERMISSIONS_MISSING'
                ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                : 'bg-zinc-800 text-zinc-400 border-zinc-700'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                nearby.isScanning
                  ? 'bg-emerald-400 animate-pulse'
                  : nearby.preflightState === 'READY'
                  ? 'bg-blue-400'
                  : nearby.preflightState === 'PERMISSIONS_MISSING'
                  ? 'bg-amber-400 animate-ping'
                  : 'bg-zinc-500'
              }`}
            />
            {nearby.isScanning
              ? 'SCANNING'
              : nearby.preflightState === 'READY'
              ? 'READY'
              : nearby.preflightState === 'PERMISSIONS_MISSING'
              ? 'PERM REQ'
              : nearby.preflightState}
          </span>
        </div>

        {/* ─── PROMINENT SCAN NEARBY CONTROL BUTTON ─── */}
        <button
          id="nexus-btn-scan-nearby"
          onClick={nearby.isScanning ? nearby.stopScan : nearby.startScan}
          disabled={nearby.isStarting || nearby.isStopping}
          className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.99] cursor-pointer ${
            nearby.isScanning
              ? 'bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/40'
              : 'bg-blue-600 hover:bg-blue-500 text-white shadow-xs'
          }`}
        >
          <span
            className={`material-symbols-outlined text-[18px] ${
              nearby.isScanning || nearby.isStarting ? 'animate-spin' : ''
            }`}
          >
            {nearby.isScanning ? 'stop_circle' : nearby.isStarting ? 'sync' : 'radar'}
          </span>
          <span>
            {nearby.isStarting
              ? 'STARTING SCAN...'
              : nearby.isStopping
              ? 'STOPPING SCAN...'
              : nearby.isScanning
              ? 'DIAGNOSTIC: STOP SCAN'
              : 'DIAGNOSTIC: SCAN NEARBY'}
          </span>
        </button>

        {/* Real Radio Telemetry Grid */}
        <div className="grid grid-cols-3 gap-2 text-xs font-mono">
          <div className="p-2 rounded-xl bg-[#111316] border border-[#1f2328] flex flex-col items-center justify-center text-center">
            <span className="text-[9.5px] text-zinc-400 uppercase font-sans">Advertising</span>
            <span className={`text-[11px] font-bold mt-0.5 ${nearby.advertising ? 'text-emerald-400' : 'text-zinc-500'}`}>
              {nearby.advertising ? '● ON' : '○ OFF'}
            </span>
          </div>

          <div className="p-2 rounded-xl bg-[#111316] border border-[#1f2328] flex flex-col items-center justify-center text-center">
            <span className="text-[9.5px] text-zinc-400 uppercase font-sans">Discovery</span>
            <span className={`text-[11px] font-bold mt-0.5 ${nearby.discovery ? 'text-emerald-400' : 'text-zinc-500'}`}>
              {nearby.discovery ? '● ON' : '○ OFF'}
            </span>
          </div>

          <div className="p-2 rounded-xl bg-[#111316] border border-[#1f2328] flex flex-col items-center justify-center text-center">
            <span className="text-[9.5px] text-zinc-400 uppercase font-sans">Nearby Link</span>
            <span className={`text-[11px] font-bold mt-0.5 ${nearby.connectedCount > 0 ? 'text-emerald-400' : 'text-zinc-400'}`}>
              {nearby.connectedCount > 0 ? `${nearby.connectedCount} Connected` : `${nearby.discoveredCount} Found`}
            </span>
          </div>
        </div>

        {/* ─── PRE-FLIGHT DIAGNOSTICS & PERMISSION CARDS ─── */}
        {nearby.preflightState === 'PERMISSIONS_MISSING' && (
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex flex-col gap-2 animate-in fade-in">
            <div className="flex items-center gap-2 text-amber-300">
              <span className="material-symbols-outlined text-[17px]">verified_user</span>
              <span className="font-bold text-[12px]">Android Nearby Permissions Required</span>
            </div>
            <p className="text-[11px] text-zinc-300 leading-relaxed">
              NEXUS requires Android Nearby Devices permissions (Bluetooth & Local Wi-Fi) to discover and connect with companion phones without Internet.
            </p>
            <button
              onClick={nearby.requestPermissions}
              className="self-start px-3 py-1.5 rounded-lg bg-amber-400 text-zinc-950 font-bold text-xs hover:bg-amber-300 active:scale-95 cursor-pointer"
            >
              Allow Nearby Access
            </button>
          </div>
        )}

        {nearby.preflightState === 'BLUETOOTH_UNSUPPORTED' && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-2.5">
            <span className="material-symbols-outlined text-[18px] text-red-300 shrink-0 mt-0.5">bluetooth_disabled</span>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-red-300">Bluetooth Radio Unavailable</span>
              <p className="text-[11px] text-zinc-400 leading-relaxed mt-0.5">
                Bluetooth hardware is required for Nearby Connections. Please ensure Bluetooth is enabled in your device settings.
              </p>
            </div>
          </div>
        )}

        {nearby.preflightState === 'BROWSER_UNSUPPORTED' && (
          <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-start gap-2.5">
            <span className="material-symbols-outlined text-[18px] text-blue-300 shrink-0 mt-0.5">devices</span>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-blue-300">Browser Environment (Fallback Mesh Active)</span>
              <p className="text-[11px] text-zinc-400 leading-relaxed mt-0.5">
                Google Nearby Connections radio runs natively on Android APK. Standard web browsers operate using WebRTC P2P and local signaling shown below.
              </p>
            </div>
          </div>
        )}

        {nearby.errorMessage &&
          nearby.preflightState !== 'PERMISSIONS_MISSING' &&
          nearby.preflightState !== 'BLUETOOTH_UNSUPPORTED' &&
          nearby.preflightState !== 'BROWSER_UNSUPPORTED' && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-2.5">
              <span className="material-symbols-outlined text-[18px] text-red-300 shrink-0 mt-0.5">
                error
              </span>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-red-300">Nearby Radio Error</span>
                <p className="text-[11px] text-zinc-400 leading-relaxed mt-0.5 font-mono">
                  {nearby.errorMessage}
                </p>
              </div>
            </div>
          )}
      </div>

      {/* ─── SECTION 2: REAL NEARBY NODES LIST ─────────────────────────────────── */}
      <div className="flex flex-col gap-2 shrink-0">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <h2 className="text-[14.5px] font-bold text-zinc-200 tracking-tight">
              Real Nearby NEXUS Nodes
            </h2>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-blue-500/10 text-blue-300 border border-blue-500/20">
              {nearby.nodes.length}
            </span>
          </div>
          <span className="text-[10.5px] text-emerald-400 font-mono">
            {nearby.isScanning ? '● Listening' : '○ Standby'}
          </span>
        </div>

        {nearby.nodes.length === 0 ? (
          <div className="p-5 rounded-2xl bg-[#15171a] border border-[#22262b] text-center flex flex-col items-center justify-center gap-2">
            <span className="material-symbols-outlined text-[26px] text-zinc-500">
              {nearby.isScanning ? 'cell_tower' : 'search_off'}
            </span>
            <span className="text-[13px] font-semibold text-zinc-200">
              {nearby.isScanning ? 'Scanning for companion NEXUS nodes...' : 'No Nearby Nodes Discovered'}
            </span>
            <p className="text-[11px] text-zinc-400 max-w-xs leading-relaxed">
              {nearby.isScanning
                ? 'Bring Phone B nearby with NEXUS open and "Scan Nearby" enabled to detect and connect over radio.'
                : 'Press "Scan Nearby" above to start radio discovery.'}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-[11px] text-blue-300">
              <span className="material-symbols-outlined text-[15px] shrink-0">hub</span>
              <span>Autonomous Mesh Active: Nodes auto-connect upon discovery using deterministic tie-breaking.</span>
            </div>
            {nearby.nodes.map((node) => {
              const isConnected = node.status === 'CONNECTED';
              const isConnecting = node.status === 'CONNECTING';

              return (
                <div
                  key={node.endpointId}
                  className={`p-3.5 rounded-xl transition-all flex flex-col gap-2.5 ${
                    isConnected
                      ? 'border border-emerald-500/30 bg-emerald-950/15'
                      : isConnecting
                      ? 'border border-blue-500/30 bg-blue-950/15'
                      : 'border border-[#22262b] bg-[#15171a]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                          isConnected
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : isConnecting
                            ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                            : 'bg-zinc-800 text-amber-400 border border-zinc-700'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[17px]">
                          {isConnected ? 'hub' : isConnecting ? 'sync' : 'cell_tower'}
                        </span>
                      </div>

                      <div className="flex flex-col">
                        <span className="text-[13.5px] font-bold text-zinc-200 leading-tight">
                          {node.endpointName}
                        </span>
                        <span className="text-[10px] font-mono text-zinc-400 leading-tight mt-0.5">
                          ID: {node.endpointId} · {node.serviceId}
                        </span>
                      </div>
                    </div>

                    {/* Node Status Badge */}
                    <div className="flex items-center gap-1.5">
                      {isConnected && node.handshakeState && (
                        <span
                          className={`px-2 py-0.5 rounded-full text-[9px] font-mono font-bold border ${
                            node.handshakeState === 'SYNCED'
                              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                              : 'bg-blue-500/15 text-blue-300 border-blue-500/30'
                          }`}
                        >
                          {node.handshakeState === 'SYNCED'
                            ? `✔ SYNCED (${node.relayedCount || 0})`
                            : node.handshakeState}
                        </span>
                      )}
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                          isConnected
                            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                            : isConnecting
                            ? 'bg-blue-500/15 text-blue-300 border-blue-500/30 animate-pulse'
                            : node.status === 'DISCONNECTED'
                            ? 'bg-zinc-800 text-zinc-400 border-zinc-700'
                            : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                        }`}
                      >
                        {node.status}
                      </span>
                    </div>
                  </div>

                  {/* Actions & Connection Info */}
                  <div className="flex items-center justify-between pt-1 border-t border-[#22262b] text-xs">
                    <span className="text-[10px] text-zinc-400 font-mono">
                      {isConnected
                        ? 'Transport: Nearby P2P Cluster'
                        : `Last seen: ${new Date(node.lastSeenAt).toLocaleTimeString()}`}
                    </span>

                    <div className="flex items-center gap-1.5">
                      {isConnected ? (
                        <>
                          <button
                            onClick={() => handleSendTestNearbyIncident(node)}
                            className="px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-[10.5px] font-bold cursor-pointer transition-all active:scale-95"
                            title="Send test emergency incident through RelayEngine"
                          >
                            Send Test Ping
                          </button>
                          <button
                            onClick={() => nearby.disconnect(node.endpointId)}
                            className="px-2.5 py-1 rounded-lg bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-300 text-[10.5px] font-medium cursor-pointer transition-all active:scale-95"
                          >
                            Disconnect
                          </button>
                        </>
                      ) : isConnecting ? (
                        <span className="text-[11px] text-blue-300 font-medium animate-pulse flex items-center gap-1">
                          <span className="material-symbols-outlined text-[13px] animate-spin">progress_activity</span>
                          Connecting...
                        </span>
                      ) : (
                        <button
                          onClick={() => nearby.connect(node.endpointId)}
                          disabled={nearby.nodes.some((n) => n.status === 'CONNECTING')}
                          className={`px-3 py-1 rounded-lg text-white text-[11px] font-bold transition-all ${
                            nearby.nodes.some((n) => n.status === 'CONNECTING')
                              ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed opacity-50'
                              : 'bg-blue-600 hover:bg-blue-500 cursor-pointer active:scale-95'
                          }`}
                        >
                          Manual Connect
                        </button>
                      )}
                    </div>
                  </div>

                  {node.connectionError && (
                    <div className="text-[10px] text-red-300 bg-red-500/10 p-1.5 rounded-lg border border-red-500/20">
                      Error: {node.connectionError}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── SECTION 3: REAL NEXUS TOPOLOGY VISUALIZATION ──────────────────────── */}
      <div className="p-3.5 sm:p-4 rounded-2xl bg-[#15171a] border border-[#22262b] shadow-sm flex flex-col gap-3 shrink-0">
        <div className="flex items-center justify-between border-b border-[#22262b] pb-2">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-emerald-400">
              hub
            </span>
            <span className="text-[13px] font-bold text-zinc-200">
              Real Nexus Topology
            </span>
          </div>
          <span className="text-[10px] text-zinc-400 font-mono">
            Hardware Radio State
          </span>
        </div>

        {/* Real Dynamic Node Graph */}
        <div className="min-h-[130px] rounded-xl bg-[#111316] border border-[#1f2328] p-4 flex flex-col items-center justify-center relative overflow-hidden">
          {/* Center: YOU */}
          <div className="flex flex-col items-center z-10">
            <div className="w-9 h-9 rounded-full bg-emerald-600 flex items-center justify-center border-2 border-emerald-400 shadow-sm">
              <span className="material-symbols-outlined text-[18px] text-white">
                radio_button_checked
              </span>
            </div>
            <span className="text-[10px] font-bold text-zinc-200 mt-1 bg-[#181b1f] px-2 py-0.5 rounded-full border border-[#262b32]">
              YOU ({deviceId.slice(0, 8)})
            </span>
          </div>

          {/* Connected/Discovered Physical Nodes */}
          {nearby.nodes.length === 0 ? (
            <span className="text-[11px] text-zinc-500 font-mono mt-3">
              No physical peers connected
            </span>
          ) : (
            <div className="w-full flex flex-wrap items-center justify-around gap-3 mt-4 pt-3 border-t border-[#1f2328] z-10">
              {nearby.nodes.map((node) => {
                const isConn = node.status === 'CONNECTED';
                return (
                  <div key={node.endpointId} className="flex flex-col items-center">
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center border-2 ${
                        isConn
                          ? 'bg-emerald-950/60 border-emerald-400 text-emerald-400'
                          : 'bg-zinc-800 border-amber-400 text-amber-400'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[13px]">
                        {isConn ? 'check' : 'sensors'}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-zinc-300 mt-0.5 font-semibold">
                      {node.endpointName}
                    </span>
                    <span className={`text-[9px] font-bold ${isConn ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {isConn ? 'Nearby P2P' : node.status}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <p className="text-[10px] text-zinc-400 italic text-center">
          Note: This topology reflects exclusively real hardware Nearby Connections events. Distances and hops are established via confirmed store-carry-forward relay handshakes.
        </p>
      </div>

      {/* ─── SECTION 4: LOCAL WI-FI / WEBRTC SIGNALING (FALLBACK TRANSPORT) ────── */}
      <div className="p-3.5 sm:p-4 rounded-2xl bg-[#15171a] border border-[#22262b] shadow-sm flex flex-col gap-3 shrink-0">
        <div className="flex items-center justify-between border-b border-[#22262b] pb-2">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-blue-400">
              wifi_tethering
            </span>
            <span className="text-[13px] font-bold text-zinc-200">
              Local LAN & WebRTC Fallback Transport
            </span>
          </div>

          <span
            className={`px-2 py-0.5 rounded-full text-[9.5px] font-bold flex items-center gap-1 border ${
              isSignalingConnected
                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                : 'bg-red-500/15 text-red-300 border-red-500/30'
            }`}
          >
            {networkDiagnostics.signalingState}
          </span>
        </div>

        {/* Signaling Endpoint info */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="p-2 rounded-xl bg-[#111316] border border-[#1f2328] flex flex-col gap-0.5">
            <span className="text-[9.5px] text-zinc-400 uppercase font-semibold">Signaler Endpoint</span>
            <div className="flex items-center justify-between gap-1">
              <span className="font-mono text-[10.5px] text-blue-300 truncate" title={networkDiagnostics.signalingUrl}>
                {networkDiagnostics.signalingUrl}
              </span>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => setShowEditSignaler(!showEditSignaler)}
                  className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 cursor-pointer"
                  title="Configure Signaler LAN IP"
                >
                  <span className="material-symbols-outlined text-[13px]">
                    edit
                  </span>
                </button>
                <button
                  onClick={handleManualReconnect}
                  disabled={isReconnecting}
                  className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 cursor-pointer"
                  title="Reconnect Signaler"
                >
                  <span className={`material-symbols-outlined text-[13px] ${isReconnecting ? 'animate-spin' : ''}`}>
                    refresh
                  </span>
                </button>
              </div>
            </div>
          </div>

          <div className="p-2 rounded-xl bg-[#111316] border border-[#1f2328] flex flex-col gap-0.5">
            <span className="text-[9.5px] text-zinc-400 uppercase font-semibold">Active Transports</span>
            <span className="font-mono text-[10.5px] text-emerald-400 font-bold">
              {networkDiagnostics.activeTransportsCount} Transport Channels
            </span>
          </div>
        </div>

        {/* Inline Signaler LAN IP Configurator */}
        {showEditSignaler && (
          <div className="p-2.5 rounded-xl bg-[#0f1114] border border-blue-500/30 flex flex-col gap-2 animate-in fade-in">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-blue-300">
                Configure Signaling Host (LAN / Companion Phone)
              </span>
              <span className="text-[10px] text-zinc-400 font-mono">e.g. 11.12.21.234:8080</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={customSignalerInput}
                onChange={(e) => setCustomSignalerInput(e.target.value)}
                placeholder="ws://11.12.21.234:8080"
                className="flex-1 bg-[#181a1f] border border-[#2a2e36] text-white font-mono text-[11px] px-2.5 py-1.5 rounded-lg focus:outline-hidden focus:border-blue-500"
              />
              <button
                onClick={handleSaveSignalerUrl}
                disabled={isReconnecting}
                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold cursor-pointer transition-all"
              >
                Save & Connect
              </button>
              <button
                onClick={() => {
                  setCustomSignalerInput('');
                  handleSaveSignalerUrl();
                }}
                disabled={isReconnecting}
                className="px-2 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] font-semibold cursor-pointer"
                title="Reset to Auto Detection"
              >
                Auto
              </button>
            </div>
          </div>
        )}

        {/* Live Diagnostics Console Toggle & Log Display */}
        <div className="flex flex-col gap-1.5 pt-1 border-t border-[#22262b]">
          <button
            onClick={() => setShowLiveConsole(!showLiveConsole)}
            className="flex items-center justify-between text-[11px] text-blue-400 font-semibold hover:text-blue-300 cursor-pointer py-1"
          >
            <span className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[14px]">terminal</span>
              <span>Live Mesh Event Log ({networkDiagnostics.recentLogs.length})</span>
            </span>
            <span className="material-symbols-outlined text-[15px]">
              {showLiveConsole ? 'expand_less' : 'expand_more'}
            </span>
          </button>

          {showLiveConsole && (
            <div className="max-h-32 overflow-y-auto no-scrollbar rounded-xl bg-[#0e1012] p-2.5 font-mono text-[9.5px] flex flex-col gap-1 border border-[#1f2328]">
              {networkDiagnostics.recentLogs.length === 0 ? (
                <span className="text-zinc-500">Listening for mesh network events...</span>
              ) : (
                networkDiagnostics.recentLogs.slice(0, 10).map((log) => (
                  <div key={log.id} className="flex items-start gap-1 leading-tight">
                    <span className="text-zinc-500 shrink-0">
                      {new Date(log.timestamp).toLocaleTimeString().slice(3)}
                    </span>
                    <span
                      className={`shrink-0 font-bold ${
                        log.level === 'error'
                          ? 'text-red-300'
                          : log.level === 'warn'
                          ? 'text-amber-300'
                          : 'text-emerald-400'
                      }`}
                    >
                      [{log.level.toUpperCase()}]
                    </span>
                    <span className="text-zinc-300 break-all">{log.message}</span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* ─── SECTION 5: SIMULATED REFERENCE TOPOLOGY (DEMO ONLY) ───────────────── */}
      <div className="p-3.5 rounded-2xl bg-[#15171a]/70 border border-purple-900/30 flex flex-col gap-2.5 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px] text-purple-400">
              science
            </span>
            <div className="flex flex-col">
              <span className="text-[12px] font-bold text-zinc-300">
                Simulated Reference Topology (Demo Mock)
              </span>
              <span className="text-[10px] text-purple-300 font-semibold">
                ⚠️ Not physical Android nodes · Reference visualization only
              </span>
            </div>
          </div>

          <button
            onClick={() => setShowSimulatedReference(!showSimulatedReference)}
            className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10.5px] font-semibold transition-all cursor-pointer"
          >
            {showSimulatedReference ? 'Hide Demo' : 'Show Demo'}
          </button>
        </div>

        {showSimulatedReference && (
          <div className="flex flex-col gap-3 pt-2 border-t border-[#22262b] animate-in fade-in duration-150">
            {/* Kinetic Radar (Simulated Reference) */}
            <div className="relative w-full aspect-square max-w-[240px] mx-auto rounded-2xl bg-[#0e1012] border border-purple-500/20 p-3 flex items-center justify-center overflow-hidden shadow-inner">
              <div className="absolute top-2 inset-x-2 flex justify-center pointer-events-none z-20">
                <span className="px-2 py-0.5 rounded-full bg-purple-950/80 border border-purple-500/30 text-[9px] font-bold text-purple-300">
                  DEMO MOCK RADAR
                </span>
              </div>

              {/* Concentric Circles */}
              <div className="absolute inset-4 rounded-full border border-purple-500/10" />
              <div className="absolute inset-12 rounded-full border border-purple-500/15" />
              <div className="absolute inset-20 rounded-full border border-purple-500/20" />

              {/* Center: You */}
              <div className="relative z-10 flex flex-col items-center">
                <div className="w-7 h-7 rounded-full bg-emerald-600 flex items-center justify-center border border-emerald-400">
                  <span className="material-symbols-outlined text-[15px] text-white">
                    radio_button_checked
                  </span>
                </div>
                <span className="text-[9.5px] text-zinc-200 font-semibold mt-0.5 bg-[#15171a] px-1.5 py-0.2 rounded border border-[#22262b]">
                  You
                </span>
              </div>

              {/* Simulated Peers on Radar */}
              {peers.map((peer, idx) => (
                <div
                  key={peer.id}
                  onClick={() => handleSelectSimulatedPeer(peer)}
                  style={
                    idx === 0
                      ? { top: peer.radarPos.top, right: peer.radarPos.right }
                      : idx === 1
                      ? { bottom: peer.radarPos.bottom, left: peer.radarPos.left }
                      : idx === 2
                      ? { bottom: peer.radarPos.bottom, right: peer.radarPos.right }
                      : { top: peer.radarPos.top, left: peer.radarPos.left }
                  }
                  className="absolute z-10 flex flex-col items-center cursor-pointer transition-transform hover:scale-110 active:scale-95"
                >
                  <div className="w-6 h-6 rounded-full bg-purple-950/80 border border-dashed border-purple-400 flex items-center justify-center shadow-xs">
                    <span className="material-symbols-outlined text-[12px] text-purple-300">
                      {peer.icon}
                    </span>
                  </div>
                  <span className="text-[8.5px] text-purple-300 font-medium bg-[#0e1012]/90 px-1 py-0.2 rounded mt-0.5 border border-purple-500/30 whitespace-nowrap">
                    {peer.radarLabel} (Sim)
                  </span>
                </div>
              ))}
            </div>

            {/* Simulated Nodes List */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider px-1">
                Simulated Reference Nodes
              </span>
              {peers.map((peer) => {
                const isHighlighted = highlightedPeerId === peer.id;
                return (
                  <div
                    key={peer.id}
                    onClick={() => handleSelectSimulatedPeer(peer)}
                    className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all active:scale-[0.99] ${
                      isHighlighted
                        ? 'border-purple-500 bg-purple-950/30'
                        : 'border-[#22262b] bg-[#15171a] hover:border-purple-500/40'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-purple-950/50 border border-dashed border-purple-500/40 text-purple-300 flex items-center justify-center">
                        <span className="material-symbols-outlined text-[15px]">{peer.icon}</span>
                      </div>
                      <div className="flex flex-col">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[12px] font-semibold text-zinc-200">{peer.name}</span>
                          <span className="text-[8.5px] px-1.5 py-0.2 rounded bg-purple-950/60 text-purple-300 border border-purple-500/30">
                            Simulated
                          </span>
                        </div>
                        <span className="text-[10px] text-zinc-400">
                          {peer.role} · {peer.distance} (Mock)
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-0.5">
                      {renderSignalBars(peer.signalBars)}
                      <span className="text-[9px] text-zinc-500">{peer.signalStrength}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ─── SECTION 6: STORE & FORWARD GUARANTEE CARD ───────────────────────── */}
      <div className="p-3.5 sm:p-4 rounded-2xl bg-[#15171a] border border-[#22262b] flex items-start justify-between gap-3 shrink-0">
        <div className="flex items-start gap-3">
          <span className={`material-symbols-outlined text-[20px] shrink-0 mt-0.5 ${
            isInternetConnected ? 'text-emerald-400' : 'text-blue-400'
          }`}>
            {isInternetConnected ? 'cloud_done' : 'sync_saved_locally'}
          </span>
          <div className="flex flex-col">
            <span className="text-[13px] font-medium text-zinc-200">
              {isInternetConnected ? 'Internet Gateway Synchronized' : 'Store & Forward Active (Zero Internet)'}
            </span>
            <p className="text-[11.5px] text-zinc-400 leading-relaxed mt-0.5">
              {isInternetConnected
                ? 'Device has an active Internet connection. Mesh incidents and telemetry are bridging live to Central Command.'
                : 'Messages and incident updates bounce securely between trusted offline nodes until an internet uplink is reached.'}
            </p>
          </div>
        </div>

        {onToggleInternet && (
          <button
            onClick={onToggleInternet}
            className={`shrink-0 px-2.5 py-1.5 rounded-xl border text-[11px] font-semibold transition-all cursor-pointer ${
              isInternetConnected
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25'
                : 'bg-zinc-800 border-zinc-700 text-zinc-200 hover:bg-zinc-700'
            }`}
          >
            {isInternetConnected ? 'Cut Uplink' : 'Connect'}
          </button>
        )}
      </div>
    </div>
  );
};
