import React, { useState } from 'react';
import { MeshPeer } from '../types';
import { meshPeers } from '../data/mockData';
import type { RelayNetworkStatus } from '../../../shared/interfaces';
import { useNexusServices } from '../context/ServiceContext';
import { useNearbyMesh, type NearbyNode } from '../hooks/useNearbyMesh';

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
                isFilled ? 'bg-[#47e266]' : 'bg-[#414754]'
              } ${heightClass}`}
            />
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex-1 min-h-0 w-full flex flex-col px-4 pt-3 pb-8 gap-4 overflow-y-auto no-scrollbar">
      {/* ─── HEADER BAR ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between pt-1 shrink-0">
        <div className="flex flex-col">
          <h1 className="text-[20px] font-bold text-[#e5e2e1] tracking-tight">Nearby Mesh Network</h1>
          <p className="text-[12px] text-[#c0c6d6]">
            {nearby.connectedCount > 0
              ? `${nearby.connectedCount} Physical Nearby Node${nearby.connectedCount > 1 ? 's' : ''} Connected`
              : nearby.isScanning
              ? `Scanning Nearby radio · ${nearby.discoveredCount} detected`
              : 'Standby · Ready for physical Android discovery'}
          </p>
        </div>
      </div>

      {/* ─── SECTION 1: REAL NEARBY CONNECTIONS HERO CONTROL ───────────────────── */}
      <div className="p-4 rounded-3xl bg-[#181818] border border-[#2e2e2e] shadow-xl flex flex-col gap-3.5 shrink-0">
        {/* Title & Radio Badge */}
        <div className="flex items-center justify-between border-b border-[#262626] pb-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-[#3e90ff]">
              nearby
            </span>
            <div className="flex flex-col">
              <span className="text-[14px] font-bold text-[#e5e2e1] tracking-tight leading-tight">
                Real Android Nearby Connections
              </span>
              <span className="text-[10.5px] text-[#8b91a0] font-mono leading-tight">
                Google Play Services · P2P Cluster · nexus-mesh-v1
              </span>
            </div>
          </div>

          <span
            className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1.5 ${
              nearby.isScanning
                ? 'bg-[#142e1d] text-[#47e266] border border-[#2f6f3a]'
                : nearby.preflightState === 'READY'
                ? 'bg-[#1b253b] text-[#aac7ff] border border-[#2d4370]'
                : nearby.preflightState === 'PERMISSIONS_MISSING'
                ? 'bg-[#332512] text-[#ffb84e] border border-[#7a531b]'
                : 'bg-[#222] text-[#8b91a0] border border-[#333]'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                nearby.isScanning
                  ? 'bg-[#47e266] animate-pulse'
                  : nearby.preflightState === 'READY'
                  ? 'bg-[#aac7ff]'
                  : nearby.preflightState === 'PERMISSIONS_MISSING'
                  ? 'bg-[#ffb84e] animate-ping'
                  : 'bg-[#8b91a0]'
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
        <div className="flex flex-col gap-2">
          <button
            id="nexus-btn-scan-nearby"
            onClick={nearby.isScanning ? nearby.stopScan : nearby.startScan}
            disabled={nearby.isStarting || nearby.isStopping}
            className={`w-full py-3 px-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2.5 shadow-lg transition-all active:scale-[0.98] cursor-pointer ${
              nearby.isScanning
                ? 'bg-[#93000a]/30 hover:bg-[#93000a]/50 text-[#ffb4ab] border border-[#ffb4ab]/40 shadow-red-950/30'
                : 'bg-[#3e90ff] hover:bg-[#3478d4] text-white shadow-blue-900/40'
            }`}
          >
            <span
              className={`material-symbols-outlined text-[20px] ${
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
        </div>

        {/* Real Radio Telemetry Grid */}
        <div className="grid grid-cols-3 gap-2 text-xs font-mono">
          <div className="p-2 rounded-xl bg-[#121212] border border-[#262626] flex flex-col items-center justify-center text-center">
            <span className="text-[9.5px] text-[#8b91a0] uppercase font-sans">Advertising</span>
            <span className={`text-[11px] font-bold mt-0.5 ${nearby.advertising ? 'text-[#47e266]' : 'text-[#8b91a0]'}`}>
              {nearby.advertising ? '● ON' : '○ OFF'}
            </span>
          </div>

          <div className="p-2 rounded-xl bg-[#121212] border border-[#262626] flex flex-col items-center justify-center text-center">
            <span className="text-[9.5px] text-[#8b91a0] uppercase font-sans">Discovery</span>
            <span className={`text-[11px] font-bold mt-0.5 ${nearby.discovery ? 'text-[#47e266]' : 'text-[#8b91a0]'}`}>
              {nearby.discovery ? '● ON' : '○ OFF'}
            </span>
          </div>

          <div className="p-2 rounded-xl bg-[#121212] border border-[#262626] flex flex-col items-center justify-center text-center">
            <span className="text-[9.5px] text-[#8b91a0] uppercase font-sans">Nearby Link</span>
            <span className={`text-[11px] font-bold mt-0.5 ${nearby.connectedCount > 0 ? 'text-[#47e266]' : 'text-[#8b91a0]'}`}>
              {nearby.connectedCount > 0 ? `${nearby.connectedCount} Connected` : `${nearby.discoveredCount} Found`}
            </span>
          </div>
        </div>

        {/* ─── PRE-FLIGHT DIAGNOSTICS & PERMISSION CARDS ─── */}
        {nearby.preflightState === 'PERMISSIONS_MISSING' && (
          <div className="p-3.5 rounded-2xl bg-[#291e12] border border-[#6b471c] flex flex-col gap-2 animate-in fade-in">
            <div className="flex items-center gap-2 text-[#ffb84e]">
              <span className="material-symbols-outlined text-[18px]">verified_user</span>
              <span className="font-bold text-[12px]">Android Nearby Permissions Required</span>
            </div>
            <p className="text-[11.5px] text-[#e5e2e1] leading-relaxed">
              NEXUS requires Android Nearby Devices permissions (Bluetooth & Local Wi-Fi) to discover and connect with companion phones without Internet.
            </p>
            <button
              onClick={nearby.requestPermissions}
              className="self-start px-3.5 py-1.5 rounded-xl bg-[#ffb84e] text-[#291e12] font-bold text-xs hover:brightness-110 active:scale-95 cursor-pointer shadow-sm"
            >
              Allow Nearby Access
            </button>
          </div>
        )}

        {nearby.preflightState === 'BLUETOOTH_UNSUPPORTED' && (
          <div className="p-3 rounded-2xl bg-[#2e1818] border border-[#6b2c2c] flex items-start gap-2.5">
            <span className="material-symbols-outlined text-[18px] text-[#ffb4ab] shrink-0 mt-0.5">bluetooth_disabled</span>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-[#ffb4ab]">Bluetooth Radio Unavailable</span>
              <p className="text-[11px] text-[#c0c6d6] leading-relaxed mt-0.5">
                Bluetooth hardware is required for Nearby Connections. Please ensure Bluetooth is enabled in your device settings.
              </p>
            </div>
          </div>
        )}

        {nearby.preflightState === 'BROWSER_UNSUPPORTED' && (
          <div className="p-3 rounded-2xl bg-[#161c28] border border-[#2b4162] flex items-start gap-2.5">
            <span className="material-symbols-outlined text-[18px] text-[#aac7ff] shrink-0 mt-0.5">devices</span>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-[#aac7ff]">Browser Environment (Fallback Mesh Active)</span>
              <p className="text-[11px] text-[#c0c6d6] leading-relaxed mt-0.5">
                Google Nearby Connections radio runs natively on Android APK. Standard web browsers operate using WebRTC P2P and local signaling shown below.
              </p>
            </div>
          </div>
        )}

        {nearby.errorMessage &&
          nearby.preflightState !== 'PERMISSIONS_MISSING' &&
          nearby.preflightState !== 'BLUETOOTH_UNSUPPORTED' &&
          nearby.preflightState !== 'BROWSER_UNSUPPORTED' && (
            <div className="p-3 rounded-2xl bg-[#2e1818] border border-[#6b2c2c] flex items-start gap-2.5">
              <span className="material-symbols-outlined text-[18px] text-[#ffb4ab] shrink-0 mt-0.5">
                error
              </span>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-[#ffb4ab]">Nearby Radio Error</span>
                <p className="text-[11px] text-[#c0c6d6] leading-relaxed mt-0.5 font-mono">
                  {nearby.errorMessage}
                </p>
              </div>
            </div>
          )}
      </div>

      {/* ─── SECTION 2: REAL NEARBY NODES LIST ─────────────────────────────────── */}
      <div className="flex flex-col gap-2.5 shrink-0">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-bold text-[#e5e2e1] tracking-tight">
              Real Nearby NEXUS Nodes
            </h2>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#1f293d] text-[#aac7ff] border border-[#2d4370]">
              {nearby.nodes.length}
            </span>
          </div>
          <span className="text-[10.5px] text-[#47e266] font-mono">
            {nearby.isScanning ? '● Listening' : '○ Standby'}
          </span>
        </div>

        {nearby.nodes.length === 0 ? (
          <div className="p-5 rounded-2xl bg-[#181818] border border-[#2a2a2a] text-center flex flex-col items-center justify-center gap-2">
            <span className="material-symbols-outlined text-[28px] text-[#8b91a0]">
              {nearby.isScanning ? 'cell_tower' : 'search_off'}
            </span>
            <span className="text-[13px] font-semibold text-[#e5e2e1]">
              {nearby.isScanning ? 'Scanning for companion NEXUS nodes...' : 'No Nearby Nodes Discovered'}
            </span>
            <p className="text-[11px] text-[#8b91a0] max-w-xs leading-relaxed">
              {nearby.isScanning
                ? 'Bring Phone B nearby with NEXUS open and "Scan Nearby" enabled to detect and connect over radio.'
                : 'Press "Scan Nearby" above to start radio discovery.'}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#162030]/80 border border-[#2b3a55]/60 text-[11px] text-[#aac7ff]">
              <span className="material-symbols-outlined text-[15px] text-[#3e90ff] shrink-0">hub</span>
              <span>Autonomous Mesh Active: Nodes auto-connect upon discovery using deterministic tie-breaking.</span>
            </div>
            {nearby.nodes.map((node) => {
              const isConnected = node.status === 'CONNECTED';
              const isConnecting = node.status === 'CONNECTING';

              return (
                <div
                  key={node.endpointId}
                  className={`p-3.5 rounded-2xl bg-[#181818] border transition-all flex flex-col gap-2.5 ${
                    isConnected
                      ? 'border-[#2f6f3a] bg-[#122317]/50 shadow-[0_0_15px_rgba(71,226,102,0.1)]'
                      : isConnecting
                      ? 'border-[#3e90ff]/50 bg-[#161c28]/50'
                      : 'border-[#2a2a2a]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                          isConnected
                            ? 'bg-[#142e1d] text-[#47e266] border border-[#2f6f3a]'
                            : isConnecting
                            ? 'bg-[#1b253b] text-[#aac7ff] border border-[#2d4370]'
                            : 'bg-[#201f1f] text-[#ffb84e] border border-[#3a3020]'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[18px]">
                          {isConnected ? 'hub' : isConnecting ? 'sync' : 'cell_tower'}
                        </span>
                      </div>

                      <div className="flex flex-col">
                        <span className="text-[14px] font-bold text-[#e5e2e1] leading-tight">
                          {node.endpointName}
                        </span>
                        <span className="text-[10px] font-mono text-[#8b91a0] leading-tight mt-0.5">
                          ID: {node.endpointId} · {node.serviceId}
                        </span>
                      </div>
                    </div>

                    {/* Node Status Badge */}
                    <div className="flex items-center gap-1.5">
                      {isConnected && node.handshakeState && (
                        <span
                          className={`px-2 py-0.5 rounded-full text-[9px] font-mono font-bold ${
                            node.handshakeState === 'SYNCED'
                              ? 'bg-[#142e1d] text-[#47e266] border border-[#2f6f3a]'
                              : 'bg-[#1e2738] text-[#aac7ff] border border-[#354c75]'
                          }`}
                        >
                          {node.handshakeState === 'SYNCED'
                            ? `✔ SYNCED (${node.relayedCount || 0})`
                            : node.handshakeState}
                        </span>
                      )}
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          isConnected
                            ? 'bg-[#142e1d] text-[#47e266] border border-[#2f6f3a]'
                            : isConnecting
                            ? 'bg-[#1b253b] text-[#aac7ff] border border-[#2d4370] animate-pulse'
                            : node.status === 'DISCONNECTED'
                            ? 'bg-[#222] text-[#8b91a0] border border-[#333]'
                            : 'bg-[#2b1f14] text-[#ffb84e] border border-[#554019]'
                        }`}
                      >
                        {node.status}
                      </span>
                    </div>
                  </div>

                  {/* Actions & Connection Info */}
                  <div className="flex items-center justify-between pt-1 border-t border-[#222] text-xs">
                    <span className="text-[10px] text-[#8b91a0] font-mono">
                      {isConnected
                        ? 'Transport: Nearby P2P Cluster'
                        : `Last seen: ${new Date(node.lastSeenAt).toLocaleTimeString()}`}
                    </span>

                    <div className="flex items-center gap-1.5">
                      {isConnected ? (
                        <>
                          <button
                            onClick={() => handleSendTestNearbyIncident(node)}
                            className="px-2.5 py-1 rounded-lg bg-[#1a2d1d] hover:bg-[#233d27] border border-[#2f6f3a] text-[#47e266] text-[10.5px] font-bold cursor-pointer transition-all"
                            title="Send test emergency incident through RelayEngine"
                          >
                            Send Test Ping
                          </button>
                          <button
                            onClick={() => nearby.disconnect(node.endpointId)}
                            className="px-2.5 py-1 rounded-lg bg-[#291715] hover:bg-[#381f1b] border border-[#5e2b24] text-[#ffb4ab] text-[10.5px] font-medium cursor-pointer transition-all"
                          >
                            Disconnect
                          </button>
                        </>
                      ) : isConnecting ? (
                        <span className="text-[11px] text-[#aac7ff] font-medium animate-pulse flex items-center gap-1">
                          <span className="material-symbols-outlined text-[13px] animate-spin">progress_activity</span>
                          Connecting...
                        </span>
                      ) : (
                        <button
                          onClick={() => nearby.connect(node.endpointId)}
                          disabled={nearby.nodes.some((n) => n.status === 'CONNECTING')}
                          className={`px-3 py-1 rounded-lg text-white text-[11px] font-bold transition-all shadow-xs ${
                            nearby.nodes.some((n) => n.status === 'CONNECTING')
                              ? 'bg-[#252830] text-[#6b7280] cursor-not-allowed opacity-50'
                              : 'bg-[#3e90ff] hover:bg-[#3478d4] cursor-pointer active:scale-95'
                          }`}
                        >
                          Manual Connect
                        </button>
                      )}
                    </div>
                  </div>

                  {node.connectionError && (
                    <div className="text-[10px] text-[#ffb4ab] bg-[#291715]/60 p-1.5 rounded-lg border border-[#5e2b24]/50">
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
      <div className="p-4 rounded-3xl bg-[#181818] border border-[#2e2e2e] shadow-xl flex flex-col gap-3 shrink-0">
        <div className="flex items-center justify-between border-b border-[#262626] pb-2">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-[#47e266]">
              hub
            </span>
            <span className="text-[13px] font-bold text-[#e5e2e1]">
              Real Nexus Topology
            </span>
          </div>
          <span className="text-[10px] text-[#8b91a0] font-mono">
            Hardware Radio State
          </span>
        </div>

        {/* Real Dynamic Node Graph */}
        <div className="min-h-[140px] rounded-2xl bg-[#101010] border border-[#222] p-4 flex flex-col items-center justify-center relative overflow-hidden">
          {/* Center: YOU */}
          <div className="flex flex-col items-center z-10">
            <div className="w-10 h-10 rounded-full bg-[#00a73e] flex items-center justify-center shadow-[0_0_15px_#47e266] border-2 border-[#131313]">
              <span className="material-symbols-outlined text-[20px] text-[#003910]">
                radio_button_checked
              </span>
            </div>
            <span className="text-[10.5px] font-bold text-[#e5e2e1] mt-1 bg-[#181818] px-2 py-0.5 rounded-full border border-[#2a2a2a]">
              YOU ({deviceId.slice(0, 8)})
            </span>
          </div>

          {/* Connected/Discovered Physical Nodes */}
          {nearby.nodes.length === 0 ? (
            <span className="text-[11px] text-[#666] font-mono mt-3">
              No physical peers connected
            </span>
          ) : (
            <div className="w-full flex flex-wrap items-center justify-around gap-3 mt-4 pt-3 border-t border-[#1c1c1c] z-10">
              {nearby.nodes.map((node) => {
                const isConn = node.status === 'CONNECTED';
                return (
                  <div key={node.endpointId} className="flex flex-col items-center">
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center border-2 ${
                        isConn
                          ? 'bg-[#142e1d] border-[#47e266] text-[#47e266]'
                          : 'bg-[#201f1f] border-[#ffb84e] text-[#ffb84e]'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[13px]">
                        {isConn ? 'check' : 'sensors'}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-[#c0c6d6] mt-0.5 font-semibold">
                      {node.endpointName}
                    </span>
                    <span className={`text-[9px] font-bold ${isConn ? 'text-[#47e266]' : 'text-[#ffb84e]'}`}>
                      {isConn ? 'Nearby P2P' : node.status}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <p className="text-[10px] text-[#8b91a0] italic text-center">
          Note: This topology reflects exclusively real hardware Nearby Connections events. Distances and hops are established via confirmed store-carry-forward relay handshakes.
        </p>
      </div>

      {/* ─── SECTION 4: LOCAL WI-FI / WEBRTC SIGNALING (FALLBACK TRANSPORT) ────── */}
      <div className="p-4 rounded-3xl bg-[#181818] border border-[#2e2e2e] shadow-xl flex flex-col gap-3 shrink-0">
        <div className="flex items-center justify-between border-b border-[#262626] pb-2">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-[#aac7ff]">
              wifi_tethering
            </span>
            <span className="text-[13px] font-bold text-[#e5e2e1]">
              Local LAN & WebRTC Fallback Transport
            </span>
          </div>

          <span
            className={`px-2 py-0.5 rounded-full text-[9.5px] font-bold flex items-center gap-1 ${
              isSignalingConnected
                ? 'bg-[#142e1d] text-[#47e266] border border-[#2f6f3a]'
                : 'bg-[#331818] text-[#ffb4ab] border border-[#6b2c2c]'
            }`}
          >
            {networkDiagnostics.signalingState}
          </span>
        </div>

        {/* Signaling Endpoint info */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="p-2 rounded-xl bg-[#121212] border border-[#262626] flex flex-col gap-0.5">
            <span className="text-[9.5px] text-[#8b91a0] uppercase font-semibold">Signaler Endpoint</span>
            <div className="flex items-center justify-between gap-1">
              <span className="font-mono text-[10.5px] text-[#aac7ff] truncate">
                {networkDiagnostics.signalingUrl}
              </span>
              <button
                onClick={handleManualReconnect}
                disabled={isReconnecting}
                className="p-0.5 rounded bg-[#222] hover:bg-[#333] text-[#c0c6d6] cursor-pointer"
                title="Reconnect Signaler"
              >
                <span className={`material-symbols-outlined text-[13px] ${isReconnecting ? 'animate-spin' : ''}`}>
                  refresh
                </span>
              </button>
            </div>
          </div>

          <div className="p-2 rounded-xl bg-[#121212] border border-[#262626] flex flex-col gap-0.5">
            <span className="text-[9.5px] text-[#8b91a0] uppercase font-semibold">Active Transports</span>
            <span className="font-mono text-[10.5px] text-[#47e266] font-bold">
              {networkDiagnostics.activeTransportsCount} Transport Channels
            </span>
          </div>
        </div>

        {/* Live Diagnostics Console Toggle & Log Display */}
        <div className="flex flex-col gap-1.5 pt-1 border-t border-[#262626]">
          <button
            onClick={() => setShowLiveConsole(!showLiveConsole)}
            className="flex items-center justify-between text-[11px] text-[#aac7ff] font-semibold hover:text-[#fff] cursor-pointer py-1"
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
            <div className="max-h-32 overflow-y-auto no-scrollbar rounded-xl bg-[#0d0d0d] p-2 font-mono text-[9.5px] flex flex-col gap-1 border border-[#222]">
              {networkDiagnostics.recentLogs.length === 0 ? (
                <span className="text-[#666]">Listening for mesh network events...</span>
              ) : (
                networkDiagnostics.recentLogs.slice(0, 10).map((log) => (
                  <div key={log.id} className="flex items-start gap-1 leading-tight">
                    <span className="text-[#555] shrink-0">
                      {new Date(log.timestamp).toLocaleTimeString().slice(3)}
                    </span>
                    <span
                      className={`shrink-0 font-bold ${
                        log.level === 'error'
                          ? 'text-[#ffb4ab]'
                          : log.level === 'warn'
                          ? 'text-[#ffb84e]'
                          : 'text-[#47e266]'
                      }`}
                    >
                      [{log.level.toUpperCase()}]
                    </span>
                    <span className="text-[#c0c6d6] break-all">{log.message}</span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* ─── SECTION 5: SIMULATED REFERENCE TOPOLOGY (DEMO ONLY) ───────────────── */}
      <div className="p-3.5 rounded-3xl bg-[#141414] border border-[#252525] flex flex-col gap-3 shrink-0 opacity-90">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px] text-[#ffb84e]">
              science
            </span>
            <div className="flex flex-col">
              <span className="text-[12px] font-bold text-[#e5e2e1]">
                Simulated Reference Topology (Demo Mock)
              </span>
              <span className="text-[10px] text-[#ffb84e] font-semibold">
                ⚠️ Not physical Android nodes · Reference visualization only
              </span>
            </div>
          </div>

          <button
            onClick={() => setShowSimulatedReference(!showSimulatedReference)}
            className="px-2.5 py-1 rounded-xl bg-[#222] hover:bg-[#2e2e2e] text-[#c0c6d6] text-[10.5px] font-semibold transition-all cursor-pointer"
          >
            {showSimulatedReference ? 'Hide Demo' : 'Show Demo'}
          </button>
        </div>

        {showSimulatedReference && (
          <div className="flex flex-col gap-3 pt-2 border-t border-[#202020] animate-in fade-in duration-150">
            {/* Kinetic Radar (Simulated Reference) */}
            <div className="relative w-full aspect-square max-w-[260px] mx-auto rounded-2xl bg-[#111] border border-[#222] p-3 flex items-center justify-center overflow-hidden shadow-inner">
              <div className="absolute top-2 inset-x-2 flex justify-center pointer-events-none z-20">
                <span className="px-2 py-0.5 rounded-full bg-[#181818]/90 border border-[#333] text-[9px] font-bold text-[#ffb84e]">
                  DEMO MOCK RADAR
                </span>
              </div>

              {/* Concentric Circles */}
              <div className="absolute inset-4 rounded-full border border-[#222]" />
              <div className="absolute inset-12 rounded-full border border-[#222]" />
              <div className="absolute inset-20 rounded-full border border-[#3e90ff]/20" />

              {/* Center: You */}
              <div className="relative z-10 flex flex-col items-center">
                <div className="w-7 h-7 rounded-full bg-[#00a73e] flex items-center justify-center border border-[#131313]">
                  <span className="material-symbols-outlined text-[15px] text-[#003910]">
                    radio_button_checked
                  </span>
                </div>
                <span className="text-[9.5px] text-[#e5e2e1] font-semibold mt-0.5 bg-[#181818] px-1.5 py-0.5 rounded-md border border-[#2a2a2a]">
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
                  <div className="w-6 h-6 rounded-full bg-[#1c1b1b] border border-[#888] flex items-center justify-center shadow-sm">
                    <span className="material-symbols-outlined text-[12px] text-[#aaa]">
                      {peer.icon}
                    </span>
                  </div>
                  <span className="text-[8.5px] text-[#aaa] font-medium bg-[#111]/90 px-1 py-0.2 rounded mt-0.5 border border-[#222] whitespace-nowrap">
                    {peer.radarLabel} (Sim)
                  </span>
                </div>
              ))}
            </div>

            {/* Simulated Nodes List */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-bold text-[#888] uppercase tracking-wider px-1">
                Simulated Reference Nodes
              </span>
              {peers.map((peer) => {
                const isHighlighted = highlightedPeerId === peer.id;
                return (
                  <div
                    key={peer.id}
                    onClick={() => handleSelectSimulatedPeer(peer)}
                    className={`p-2.5 rounded-xl bg-[#181818] border flex items-center justify-between cursor-pointer transition-all active:scale-[0.99] ${
                      isHighlighted ? 'border-[#ffb84e] bg-[#242018]' : 'border-[#242424] hover:border-[#333]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-[#222] text-[#888] flex items-center justify-center">
                        <span className="material-symbols-outlined text-[16px]">{peer.icon}</span>
                      </div>
                      <div className="flex flex-col">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[12.5px] font-semibold text-[#ccc]">{peer.name}</span>
                          <span className="text-[8.5px] px-1.5 py-0.2 rounded bg-[#222] text-[#ffb84e] border border-[#333]">
                            Simulated
                          </span>
                        </div>
                        <span className="text-[10.5px] text-[#777]">
                          {peer.role} · {peer.distance} (Mock)
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-0.5">
                      {renderSignalBars(peer.signalBars)}
                      <span className="text-[9px] text-[#666]">{peer.signalStrength}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ─── SECTION 6: STORE & FORWARD GUARANTEE CARD ───────────────────────── */}
      <div className="p-4 rounded-2xl bg-[#201f1f]/60 border border-[#2a2a2a]/60 flex items-start justify-between gap-3 shrink-0">
        <div className="flex items-start gap-3">
          <span className={`material-symbols-outlined text-[20px] shrink-0 mt-0.5 ${
            isInternetConnected ? 'text-[#47e266]' : 'text-[#aac7ff]'
          }`}>
            {isInternetConnected ? 'cloud_done' : 'sync_saved_locally'}
          </span>
          <div className="flex flex-col">
            <span className="text-[13px] font-medium text-[#e5e2e1]">
              {isInternetConnected ? 'Internet Gateway Synchronized' : 'Store & Forward Active (Zero Internet)'}
            </span>
            <p className="text-[12px] text-[#c0c6d6] leading-relaxed mt-0.5">
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
                ? 'bg-[#142e1d] border-[#2f6f3a] text-[#47e266] hover:bg-[#1a3824]'
                : 'bg-[#2a2a2a] border-[#353534] text-[#e5e2e1] hover:bg-[#353534]'
            }`}
          >
            {isInternetConnected ? 'Cut Uplink' : 'Connect'}
          </button>
        )}
      </div>
    </div>
  );
};
