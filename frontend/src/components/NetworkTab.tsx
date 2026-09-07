import React, { useState } from 'react';
import { MeshPeer } from '../types';
import { meshPeers } from '../data/mockData';
import type { RelayNetworkStatus } from '../../../shared/interfaces';
import { useNexusServices } from '../context/ServiceContext';

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
  } = useNexusServices();

  const networkStatus = propNetworkStatus || ctxNetworkStatus;
  const [peers] = useState<MeshPeer[]>(meshPeers);
  const [isAutoScanning, setIsAutoScanning] = useState<boolean>(true);
  const [backgroundDiscovery, setBackgroundDiscovery] = useState<boolean>(true);
  const [highlightedPeerId, setHighlightedPeerId] = useState<string | null>(null);
  const [showLiveConsole, setShowLiveConsole] = useState<boolean>(true);
  const [isReconnecting, setIsReconnecting] = useState<boolean>(false);

  const realPeerCount = networkStatus?.activePeers?.length ?? 0;
  const isSignalingConnected = networkDiagnostics.signalingState === 'CONNECTED';

  const handleToggleAutoScan = () => {
    const next = !isAutoScanning;
    setIsAutoScanning(next);
    onShowToast(next ? 'Mesh radio scanning enabled' : 'Mesh radio scanning paused');
  };

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

  const handleSelectPeer = (peer: MeshPeer) => {
    setHighlightedPeerId(peer.id);
    onShowToast(`Pinging ${peer.name} (${peer.distance}) via BLE mesh`);
    setTimeout(() => {
      setHighlightedPeerId(null);
    }, 2500);
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
      {/* Top Intro Bar */}
      <div className="flex items-center justify-between pt-1 shrink-0">
        <div className="flex flex-col">
          <h1 className="text-[20px] font-bold text-[#e5e2e1] tracking-tight">Nearby Mesh</h1>
          <p className="text-[13px] text-[#c0c6d6]">
            {realPeerCount === 0
              ? '0 peers connected · Standby for local WebRTC mesh'
              : `${realPeerCount} peer${realPeerCount > 1 ? 's' : ''} connected via WebRTC & Local Mesh`}
          </p>
        </div>
        <button
          onClick={handleToggleAutoScan}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all cursor-pointer ${
            isAutoScanning
              ? 'bg-[#201f1f] text-[#aac7ff] border-[#3e90ff]/40'
              : 'bg-[#1c1b1b] text-[#8b91a0] border-[#2a2a2a]'
          }`}
        >
          <span
            className={`material-symbols-outlined text-[16px] ${
              isAutoScanning ? 'animate-spin' : ''
            }`}
            style={{ animationDuration: '3s' }}
          >
            autorenew
          </span>
          <span className="text-[11px] font-medium tracking-tight">
            {isAutoScanning ? 'Scanning' : 'Paused'}
          </span>
        </button>
      </div>

      {/* ─── REAL RUNTIME MESH DIAGNOSTICS HERO CARD ──────────────────────────── */}
      <div className="p-4 rounded-3xl bg-[#181818] border border-[#2e2e2e] shadow-xl flex flex-col gap-3.5 shrink-0">
        <div className="flex items-center justify-between border-b border-[#262626] pb-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-[#3e90ff]">
              wifi_tethering
            </span>
            <span className="text-[14px] font-bold text-[#e5e2e1] tracking-tight">
              Local Hardware Radio & Signaling
            </span>
          </div>
          <span
            className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1.5 ${
              isSignalingConnected
                ? 'bg-[#142e1d] text-[#47e266] border border-[#2f6f3a]'
                : networkDiagnostics.signalingState === 'CONNECTING'
                ? 'bg-[#1b253b] text-[#aac7ff] border border-[#2d4370]'
                : 'bg-[#331818] text-[#ffb4ab] border border-[#6b2c2c]'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isSignalingConnected
                  ? 'bg-[#47e266] animate-pulse'
                  : networkDiagnostics.signalingState === 'CONNECTING'
                  ? 'bg-[#aac7ff] animate-ping'
                  : 'bg-[#ffb4ab]'
              }`}
            />
            {networkDiagnostics.signalingState}
          </span>
        </div>

        {/* Signaling Server URL & Device Node ID Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          <div className="p-2.5 rounded-2xl bg-[#121212] border border-[#262626] flex flex-col gap-1">
            <span className="text-[10px] text-[#8b91a0] uppercase font-semibold tracking-wider">
              Local Signaler Endpoint
            </span>
            <div className="flex items-center justify-between gap-1">
              <span className="font-mono text-[11px] text-[#aac7ff] truncate">
                {networkDiagnostics.signalingUrl}
              </span>
              <button
                onClick={handleManualReconnect}
                disabled={isReconnecting}
                className="p-1 rounded-md bg-[#222] hover:bg-[#333] text-[#c0c6d6] cursor-pointer"
                title="Reconnect Signaling"
              >
                <span className={`material-symbols-outlined text-[14px] ${isReconnecting ? 'animate-spin' : ''}`}>
                  refresh
                </span>
              </button>
            </div>
          </div>

          <div className="p-2.5 rounded-2xl bg-[#121212] border border-[#262626] flex flex-col gap-1">
            <span className="text-[10px] text-[#8b91a0] uppercase font-semibold tracking-wider">
              Your Local Node Identity
            </span>
            <div className="flex items-center justify-between gap-1">
              <span className="font-mono text-[11px] text-[#e5e2e1] font-bold truncate">
                {deviceId}
              </span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(deviceId);
                  onShowToast('Device ID copied to clipboard');
                }}
                className="p-1 rounded-md bg-[#222] hover:bg-[#333] text-[#c0c6d6] cursor-pointer"
                title="Copy Device ID"
              >
                <span className="material-symbols-outlined text-[14px]">content_copy</span>
              </button>
            </div>
          </div>
        </div>

        {/* Discovered / Connected Real Peers on LAN */}
        <div className="flex flex-col gap-2 pt-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-[#8b91a0] uppercase tracking-wider">
              Real LAN Peers ({networkDiagnostics.discoveredPeers.length} Discovered · {realPeerCount} Active Transport)
            </span>
          </div>

          {networkDiagnostics.discoveredPeers.length === 0 ? (
            <div className="p-3 rounded-2xl bg-[#121212] border border-[#262626] text-center flex flex-col items-center justify-center py-4">
              <span className="material-symbols-outlined text-[20px] text-[#8b91a0] mb-1">
                radar
              </span>
              <span className="text-[12px] text-[#c0c6d6] font-medium">
                Searching local Wi-Fi for companion nodes...
              </span>
              <span className="text-[10px] text-[#8b91a0] mt-0.5">
                Open <span className="font-mono text-[#aac7ff]">http://&lt;your-ip&gt;:3000</span> on another phone on this Wi-Fi
              </span>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {networkDiagnostics.discoveredPeers.map((peer) => {
                const diag = networkDiagnostics.peerDiagnostics.find((p) => p.peerId === peer.peerId);
                const isRtcConnected = diag?.connectionState === 'connected';
                const isDataChannelOpen = diag?.dataChannelState === 'open';
                const hasActiveTransport = diag?.transportType && diag.transportType !== 'none';

                return (
                  <div
                    key={peer.peerId}
                    className="p-3 rounded-2xl bg-[#121212] border border-[#2a2a2a] flex flex-col gap-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            hasActiveTransport ? 'bg-[#47e266] animate-pulse' : 'bg-[#aac7ff]'
                          }`}
                        />
                        <span className="font-mono text-[12px] font-bold text-[#e5e2e1]">
                          {peer.peerId.length > 18 ? `${peer.peerId.slice(0, 16)}...` : peer.peerId}
                        </span>
                      </div>
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          diag?.transportType === 'webrtc'
                            ? 'bg-[#47e266]/15 text-[#47e266]'
                            : diag?.transportType === 'websocket'
                            ? 'bg-[#3e90ff]/15 text-[#aac7ff]'
                            : 'bg-[#2a2a2a] text-[#8b91a0]'
                        }`}
                      >
                        {diag?.transportType === 'webrtc'
                          ? 'WebRTC P2P'
                          : diag?.transportType === 'websocket'
                          ? 'Hotspot Mesh'
                          : 'Connecting...'}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5 text-[10px] font-mono pt-1 border-t border-[#1c1c1c]">
                      <div className="flex flex-col">
                        <span className="text-[#8b91a0]">WebRTC</span>
                        <span
                          className={`font-semibold ${
                            isRtcConnected
                              ? 'text-[#47e266]'
                              : diag?.connectionState === 'connecting'
                              ? 'text-[#aac7ff]'
                              : diag?.connectionState === 'failed'
                              ? 'text-[#ffb4ab]'
                              : 'text-[#8b91a0]'
                          }`}
                        >
                          {diag?.connectionState || 'new'}
                        </span>
                      </div>

                      <div className="flex flex-col">
                        <span className="text-[#8b91a0]">Channel</span>
                        <span
                          className={`font-semibold ${
                            isDataChannelOpen
                              ? 'text-[#47e266]'
                              : diag?.dataChannelState === 'connecting'
                              ? 'text-[#ffb84e]'
                              : 'text-[#8b91a0]'
                          }`}
                        >
                          {diag?.dataChannelState || 'none'}
                        </span>
                      </div>

                      <div className="flex flex-col">
                        <span className="text-[#8b91a0]">Relay Status</span>
                        <span className={hasActiveTransport ? 'text-[#47e266] font-semibold' : 'text-[#8b91a0]'}>
                          {hasActiveTransport ? 'RELAYING' : 'PENDING'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Live Diagnostics Console Toggle & Log Display */}
        <div className="flex flex-col gap-1.5 pt-1 border-t border-[#262626]">
          <button
            onClick={() => setShowLiveConsole(!showLiveConsole)}
            className="flex items-center justify-between text-[11px] text-[#aac7ff] font-semibold hover:text-[#fff] cursor-pointer py-1"
          >
            <span className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[15px]">terminal</span>
              <span>Live Mesh Event Log ({networkDiagnostics.recentLogs.length})</span>
            </span>
            <span className="material-symbols-outlined text-[16px]">
              {showLiveConsole ? 'expand_less' : 'expand_more'}
            </span>
          </button>

          {showLiveConsole && (
            <div className="max-h-36 overflow-y-auto no-scrollbar rounded-xl bg-[#0d0d0d] p-2.5 font-mono text-[10px] flex flex-col gap-1 border border-[#222]">
              {networkDiagnostics.recentLogs.length === 0 ? (
                <span className="text-[#666]">Listening for mesh network events...</span>
              ) : (
                networkDiagnostics.recentLogs.slice(0, 15).map((log) => (
                  <div key={log.id} className="flex items-start gap-1.5 leading-tight">
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

      {/* ─── KINETIC RADAR VISUALIZATION (DEMO REFERENCE) ────────────────────── */}
      <div className="relative w-full aspect-square max-w-[320px] min-h-[250px] mx-auto rounded-3xl bg-[#1c1b1b] border border-[#2a2a2a] p-4 flex items-center justify-center overflow-hidden shadow-2xl shrink-0">
        {/* Honest Simulation Label Badge */}
        <div className="absolute top-2.5 inset-x-3 flex justify-center pointer-events-none z-20">
          <span className="px-2.5 py-0.5 rounded-full bg-[#131313]/90 border border-[#2a2a2a] text-[10px] font-medium text-[#8b91a0]">
            Mesh topology visualization (Simulated Reference)
          </span>
        </div>

        {/* Concentric Circles & Grid */}
        <div className="absolute inset-4 rounded-full border border-[#2a2a2a]/40" />
        <div className="absolute inset-14 rounded-full border border-[#2a2a2a]/60" />
        <div className="absolute inset-24 rounded-full border border-[#3e90ff]/20" />
        <div className="absolute inset-0 bg-radial from-[#3e90ff]/10 via-transparent to-transparent opacity-30 pointer-events-none" />

        {/* Rotating Radar Sweep Beam */}
        {isAutoScanning && (
          <div
            className="absolute inset-0 w-full h-full rounded-full pointer-events-none origin-center animate-spin"
            style={{
              animationDuration: '7s',
              background: 'conic-gradient(from 0deg, rgba(62, 144, 255, 0.18) 0deg, rgba(62, 144, 255, 0) 65deg, transparent 360deg)',
            }}
          />
        )}

        {/* Center Anchor: You */}
        <div className="relative z-10 flex flex-col items-center">
          <div className="relative flex items-center justify-center">
            <span className="animate-ping absolute h-8 w-8 rounded-full bg-[#47e266] opacity-30" />
            <div className="w-9 h-9 rounded-full bg-[#00a73e] flex items-center justify-center shadow-[0_0_15px_#47e266] border-2 border-[#131313]">
              <span className="material-symbols-outlined text-[18px] text-[#003910]">
                radio_button_checked
              </span>
            </div>
          </div>
          <span className="text-[11px] text-[#e5e2e1] font-semibold mt-1 bg-[#131313]/90 px-2 py-0.5 rounded-full border border-[#2a2a2a]">
            You
          </span>
        </div>

        {/* Peer 1 on Radar */}
        <div
          onClick={() => handleSelectPeer(peers[0])}
          style={{ top: peers[0].radarPos.top, right: peers[0].radarPos.right }}
          className="absolute z-10 flex flex-col items-center cursor-pointer transition-transform hover:scale-110 active:scale-95 group"
        >
          <div className="w-7 h-7 rounded-full bg-[#1c1b1b] border-2 border-[#47e266] flex items-center justify-center shadow-lg group-hover:bg-[#47e266]/20">
            <span className="material-symbols-outlined text-[14px] text-[#47e266]">
              medical_services
            </span>
          </div>
          <span className="text-[9px] text-[#c0c6d6] font-medium bg-[#131313]/95 px-1.5 py-0.5 rounded-md mt-0.5 border border-[#2a2a2a] whitespace-nowrap shadow-xs">
            {peers[0].radarLabel}
          </span>
        </div>

        {/* Peer 2 on Radar */}
        <div
          onClick={() => handleSelectPeer(peers[1])}
          style={{ bottom: peers[1].radarPos.bottom, left: peers[1].radarPos.left }}
          className="absolute z-10 flex flex-col items-center cursor-pointer transition-transform hover:scale-110 active:scale-95 group"
        >
          <div className="w-7 h-7 rounded-full bg-[#1c1b1b] border-2 border-[#3e90ff] flex items-center justify-center shadow-lg group-hover:bg-[#3e90ff]/20">
            <span className="material-symbols-outlined text-[14px] text-[#aac7ff]">
              emergency
            </span>
          </div>
          <span className="text-[9px] text-[#c0c6d6] font-medium bg-[#131313]/95 px-1.5 py-0.5 rounded-md mt-0.5 border border-[#2a2a2a] whitespace-nowrap shadow-xs">
            {peers[1].radarLabel}
          </span>
        </div>

        {/* Peer 3 on Radar */}
        <div
          onClick={() => handleSelectPeer(peers[2])}
          style={{ bottom: peers[2].radarPos.bottom, right: peers[2].radarPos.right }}
          className="absolute z-10 flex flex-col items-center cursor-pointer transition-transform hover:scale-110 active:scale-95 group"
        >
          <div className="w-6 h-6 rounded-full bg-[#1c1b1b] border border-[#8b91a0] flex items-center justify-center shadow-md">
            <span className="material-symbols-outlined text-[13px] text-[#8b91a0]">
              sensors
            </span>
          </div>
          <span className="text-[9px] text-[#8b91a0] bg-[#131313]/95 px-1 rounded-md mt-0.5 border border-[#2a2a2a] whitespace-nowrap shadow-xs">
            {peers[2].radarLabel}
          </span>
        </div>

        {/* Peer 4 on Radar */}
        <div
          onClick={() => handleSelectPeer(peers[3])}
          style={{ top: peers[3].radarPos.top, left: peers[3].radarPos.left }}
          className="absolute z-10 flex flex-col items-center cursor-pointer transition-transform hover:scale-110 active:scale-95 group"
        >
          <div className="w-6 h-6 rounded-full bg-[#1c1b1b] border border-[#c6c6c7] flex items-center justify-center shadow-md">
            <span className="material-symbols-outlined text-[13px] text-[#c6c6c7]">
              cell_tower
            </span>
          </div>
          <span className="text-[9px] text-[#c6c6c7] bg-[#131313]/95 px-1 rounded-md mt-0.5 border border-[#2a2a2a] whitespace-nowrap shadow-xs">
            {peers[3].radarLabel}
          </span>
        </div>
      </div>

      {/* Live Telemetry Pill */}
      <div className="flex justify-center shrink-0">
        <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#1c1b1b] border border-[#2a2a2a] text-[#c0c6d6] text-[11px] shadow-sm">
          <span className="material-symbols-outlined text-[14px] text-[#47e266]">
            {realPeerCount > 0 ? 'check_circle' : 'sensors'}
          </span>
          <span className="text-[#e5e2e1] font-medium">
            {realPeerCount > 0 ? `${realPeerCount} Peer Connection${realPeerCount > 1 ? 's' : ''} Active` : 'WebRTC Mesh Standby'}
          </span>
          <span className="text-[#8b91a0]">·</span>
          <span>Store-Carry-Forward Engine Active</span>
        </div>
      </div>

      {/* Simulated Mesh Nodes (Demo Topology) */}
      <div className="flex flex-col gap-2.5 shrink-0">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-[15px] font-semibold text-[#e5e2e1] tracking-tight">
            Mesh Topology Reference Nodes
          </h2>
          <span className="text-[10.5px] text-[#8b91a0]">
            Simulated
          </span>
        </div>

        {peers.map((peer) => {
          const isHighlighted = highlightedPeerId === peer.id;

          return (
            <div
              key={peer.id}
              onClick={() => handleSelectPeer(peer)}
              className={`p-3.5 rounded-2xl bg-[#1c1b1b] border flex items-center justify-between cursor-pointer transition-all active:scale-[0.99] shrink-0 ${
                isHighlighted
                  ? 'border-[#47e266] shadow-[0_0_20px_rgba(71,226,102,0.2)] bg-[#201f1f]'
                  : 'border-[#2a2a2a] hover:border-[#353534]'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  peer.typeBadge === 'Direct'
                    ? 'bg-[#47e266]/15 text-[#47e266]'
                    : peer.typeBadge === 'Relay'
                    ? 'bg-[#3e90ff]/15 text-[#aac7ff]'
                    : 'bg-[#2a2a2a] text-[#c0c6d6]'
                }`}>
                  <span className="material-symbols-outlined text-[20px]">{peer.icon}</span>
                </div>

                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-semibold text-[#e5e2e1]">{peer.name}</span>
                    <span className={`text-[9.5px] px-2 py-0.5 rounded-full font-semibold ${
                      peer.typeBadge === 'Direct'
                        ? 'bg-[#47e266]/15 text-[#47e266]'
                        : peer.typeBadge === 'Relay'
                        ? 'bg-[#3e90ff]/15 text-[#aac7ff]'
                        : 'bg-[#2a2a2a] text-[#c0c6d6]'
                    }`}>
                      {peer.typeBadge}
                    </span>
                  </div>
                  <span className="text-[11.5px] text-[#c0c6d6] mt-0.5">
                    {peer.role} · {peer.distance}
                  </span>
                  <span className="text-[10.5px] text-[#8b91a0] mt-0.5">{peer.syncTime}</span>
                </div>
              </div>

              {/* Signal Bar Visualizer */}
              <div className="flex flex-col items-end gap-1">
                {renderSignalBars(peer.signalBars)}
                <span className="text-[10px] text-[#8b91a0] font-medium">{peer.signalStrength}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Background Mesh Discovery Switch */}
      <div className="p-4 rounded-2xl bg-[#1c1b1b] border border-[#2a2a2a] flex items-center justify-between shrink-0">
        <div className="flex flex-col pr-4">
          <span className="text-[14px] font-medium text-[#e5e2e1]">
            Background Mesh Discovery
          </span>
          <span className="text-[12px] text-[#c0c6d6] mt-0.5">
            Continuously discover peers when screen is locked
          </span>
        </div>
        <button
          onClick={() => {
            const next = !backgroundDiscovery;
            setBackgroundDiscovery(next);
            onShowToast(next ? 'Background discovery enabled' : 'Background discovery disabled');
          }}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
            backgroundDiscovery ? 'bg-[#3e90ff]' : 'bg-[#414754]'
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
              backgroundDiscovery ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {/* Human-Centered Guarantee Card */}
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
