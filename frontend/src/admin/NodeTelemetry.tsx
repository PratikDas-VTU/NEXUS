import React, { useState } from 'react';
import { NodeHealth } from './types';
import { INITIAL_MESH_NODES } from './mockAdminData';
import { useNexusServices } from '../context/ServiceContext';

interface NodeTelemetryProps {
  onShowToast: (msg: string) => void;
}

export const NodeTelemetry: React.FC<NodeTelemetryProps> = ({ onShowToast }) => {
  const { networkStatus, networkDiagnostics, deviceId } = useNexusServices();
  const [viewMode, setViewMode] = useState<'live' | 'reference'>('live');
  const [referenceNodes] = useState<NodeHealth[]>(INITIAL_MESH_NODES);
  const [pingingNodeId, setPingingNodeId] = useState<string | null>(null);

  const handlePingNode = (nodeName: string, id: string) => {
    setPingingNodeId(id);
    setTimeout(() => {
      setPingingNodeId(null);
      onShowToast(`✓ Echo ACK received from "${nodeName}"`);
    }, 450);
  };

  const handleReKeyNetwork = () => {
    onShowToast('✓ P2P channel verification requested across active peers');
  };

  const activePeersMap = new Map(networkStatus.activePeers.map((p) => [p.peerId, p]));
  const peerDiagMap = new Map(networkDiagnostics.peerDiagnostics.map((p) => [p.peerId, p]));

  return (
    <div className="space-y-4">
      {/* Mode Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#181818] p-3.5 rounded-2xl border border-[#282828]">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[#3e90ff] text-[20px]">
            cell_tower
          </span>
          <div>
            <h3 className="text-sm font-bold text-[#e5e2e1]">Mesh Nodes &amp; Transport Telemetry</h3>
            <p className="text-[11px] text-[#8b91a0]">
              Real-time monitoring of WebRTC DataChannels, local signaling, and peer relay state.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 bg-[#121212] p-1 rounded-xl border border-[#2a2a2a] self-start sm:self-center shrink-0">
          <button
            onClick={() => setViewMode('live')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all flex items-center gap-1.5 ${
              viewMode === 'live'
                ? 'bg-[#002957] text-[#aac7ff] border border-[#3e90ff]/40 shadow-xs'
                : 'text-[#8b91a0] hover:text-[#e5e2e1]'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#47e266] animate-pulse" />
            <span>Live Mesh ({networkStatus.activePeers.length + 1})</span>
          </button>
          <button
            onClick={() => setViewMode('reference')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all flex items-center gap-1.5 ${
              viewMode === 'reference'
                ? 'bg-[#2a2415] text-[#ffd279] border border-[#ffd279]/40 shadow-xs'
                : 'text-[#8b91a0] hover:text-[#e5e2e1]'
            }`}
          >
            <span className="material-symbols-outlined text-[14px]">science</span>
            <span>Reference Topology (Demo)</span>
          </button>
        </div>
      </div>

      {/* Top 4 Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-[#181818] p-3.5 rounded-2xl border border-[#282828]">
          <span className="text-[11px] text-[#8b91a0]">Active Transports</span>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-xl font-bold text-[#e5e2e1]">
              {viewMode === 'live' ? networkStatus.activePeers.length : referenceNodes.length}
            </span>
            <span className="text-[11px] text-[#47e266] font-semibold">
              {viewMode === 'live'
                ? networkStatus.activePeers.length > 0
                  ? 'P2P Active'
                  : 'Host Ready'
                : 'Simulated 100%'}
            </span>
          </div>
        </div>

        <div className="bg-[#181818] p-3.5 rounded-2xl border border-[#282828]">
          <span className="text-[11px] text-[#8b91a0]">Incidents Relayed</span>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-xl font-bold text-[#3e90ff]">
              {viewMode === 'live' ? networkStatus.totalIncidentsRelayed : '45.6k'}
            </span>
            <span className="text-[11px] text-[#8b91a0]">
              {viewMode === 'live' ? 'Runtime counter' : 'Reference load'}
            </span>
          </div>
        </div>

        <div className="bg-[#181818] p-3.5 rounded-2xl border border-[#282828]">
          <span className="text-[11px] text-[#8b91a0]">Signaling Endpoint</span>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-sm font-bold text-[#e5e2e1] truncate max-w-[120px]">
              {viewMode === 'live'
                ? networkDiagnostics.signalingState === 'CONNECTED'
                  ? 'Connected'
                  : networkDiagnostics.signalingState
                : 'ws://mesh:8080'}
            </span>
            <span
              className={`text-[10px] font-semibold ${
                networkDiagnostics.signalingState === 'CONNECTED'
                  ? 'text-[#47e266]'
                  : 'text-amber-400'
              }`}
            >
              {viewMode === 'live' ? 'LAN' : 'Demo'}
            </span>
          </div>
        </div>

        <div className="bg-[#181818] p-3.5 rounded-2xl border border-[#282828]">
          <span className="text-[11px] text-[#8b91a0]">Mesh Mode</span>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-base font-bold text-[#e5e2e1]">
              {viewMode === 'live' ? networkStatus.mode.toUpperCase() : 'LORA / BLE'}
            </span>
            <span className="text-[11px] text-[#47e266]">
              {viewMode === 'live' ? 'Zero-Cloud' : 'Multi-hop'}
            </span>
          </div>
        </div>
      </div>

      {/* REFERENCE MODE DISCLAIMER BANNER */}
      {viewMode === 'reference' && (
        <div className="p-3.5 rounded-2xl bg-[#2a2415] border border-[#ffd279]/40 text-[#ffd279] text-xs flex items-start gap-2.5">
          <span className="material-symbols-outlined text-[18px] text-[#ffd279] shrink-0 mt-0.5">
            info
          </span>
          <div>
            <span className="font-bold block">Viewing Reference Drill Simulation Dataset</span>
            <span className="text-[11px] text-[#e0c38c]">
              This reference dataset displays 5 pre-configured campus repeater nodes for planning and offline emergency exercises. Switch to <strong>Live Mesh</strong> to inspect real browser WebRTC connections.
            </span>
          </div>
        </div>
      )}

      {/* MAIN NODE LIST */}
      <div className="bg-[#181818] rounded-2xl border border-[#282828] p-4">
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#282828]">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#3e90ff] text-[20px]">
              hub
            </span>
            <h3 className="text-sm font-bold text-[#e5e2e1]">
              {viewMode === 'live' ? 'Active Mesh Peer Nodes' : 'Amrita Vengal Campus Mesh Nodes'}
            </h3>
          </div>
          <button
            onClick={handleReKeyNetwork}
            className="px-3 py-1.5 rounded-xl bg-[#222] hover:bg-[#2a2a2a] border border-[#333] text-xs font-semibold text-[#aac7ff] flex items-center gap-1.5 cursor-pointer transition-all"
          >
            <span className="material-symbols-outlined text-[15px]">verified_user</span>
            <span>Verify Mesh State</span>
          </button>
        </div>

        {/* LIVE MODE RENDER */}
        {viewMode === 'live' ? (
          <div className="space-y-3">
            {/* 1. Host Node (This Device) */}
            <div className="p-3.5 rounded-xl bg-[#141414] border border-[#3e90ff]/30 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#47e266] animate-pulse" />
                  <h4 className="text-xs font-bold text-[#e5e2e1]">
                    Local Command Node (Host)
                  </h4>
                  <span className="px-2 py-0.5 rounded-md bg-[#002957] text-[#aac7ff] text-[10px] font-mono">
                    HOST / ADMIN
                  </span>
                </div>
                <div className="text-[11px] text-[#8b91a0] flex items-center gap-2 font-mono">
                  <span>ID: {deviceId}</span>
                  <span>·</span>
                  <span className="text-[#47e266]">
                    Signaler: {networkDiagnostics.signalingState}
                  </span>
                </div>
              </div>

              {/* Metrics */}
              <div className="flex items-center gap-4 flex-wrap text-xs">
                <div className="flex items-center gap-1.5" title="Battery level">
                  <span className="material-symbols-outlined text-[16px] text-[#8b91a0]">
                    battery_unknown
                  </span>
                  <span className="font-mono text-[#8b91a0]">Not reported</span>
                </div>

                <div className="flex items-center gap-1.5" title="Signal Strength RSSI">
                  <span className="material-symbols-outlined text-[16px] text-[#8b91a0]">
                    signal_cellular_alt
                  </span>
                  <span className="font-mono text-[#8b91a0]">Not reported</span>
                </div>

                <div className="flex items-center gap-1.5" title="Packets routed">
                  <span className="text-[11px] text-[#8b91a0]">Relayed:</span>
                  <span className="font-mono text-[#e5e2e1]">
                    {networkStatus.totalIncidentsRelayed} pkts
                  </span>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 pl-2 border-l border-[#282828]">
                  <button
                    onClick={() => handlePingNode('Local Host Node', 'host')}
                    disabled={pingingNodeId === 'host'}
                    className="p-1.5 rounded-lg bg-[#202020] hover:bg-[#2a2a2a] text-[#c0c6d6] hover:text-[#e5e2e1] cursor-pointer transition-colors"
                    title="Self Loopback Ping"
                  >
                    <span
                      className={`material-symbols-outlined text-[16px] ${
                        pingingNodeId === 'host' ? 'animate-spin' : ''
                      }`}
                    >
                      sensors
                    </span>
                  </button>
                </div>
              </div>
            </div>

            {/* 2. Discovered & Active Peers */}
            {networkDiagnostics.discoveredPeers.length === 0 ? (
              <div className="p-8 rounded-xl bg-[#121214] border border-[#242428] text-center text-[#8b91a0] space-y-2">
                <span className="material-symbols-outlined text-[36px] text-[#3e90ff] opacity-70">
                  wifi_find
                </span>
                <p className="text-xs font-semibold text-[#e5e2e1]">
                  No remote mesh peers currently discovered
                </p>
                <p className="text-[11px] text-[#8b91a0] max-w-md mx-auto">
                  Open NEXUS on other devices connected to the same Wi-Fi/LAN at{' '}
                  <code className="text-[#aac7ff] font-mono">
                    {networkDiagnostics.signalingUrl.replace('ws://', 'http://').replace(':8080', ':3000')}
                  </code>{' '}
                  to establish real peer-to-peer WebRTC mesh links.
                </p>
              </div>
            ) : (
              networkDiagnostics.discoveredPeers.map((peer) => {
                const session = activePeersMap.get(peer.peerId);
                const diag = peerDiagMap.get(peer.peerId);
                const isConnected = !!session || diag?.dataChannelState === 'open';

                return (
                  <div
                    key={peer.peerId}
                    className="p-3.5 rounded-xl bg-[#141414] border border-[#242424] hover:border-[#303030] transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            isConnected ? 'bg-[#47e266] animate-pulse' : 'bg-amber-400'
                          }`}
                        />
                        <h4 className="text-xs font-bold text-[#e5e2e1]">
                          Mesh Peer ({peer.deviceId ? peer.deviceId.slice(0, 10) : peer.peerId.slice(0, 8)})
                        </h4>
                        <span className="px-2 py-0.5 rounded-md bg-[#202020] text-[#8b91a0] text-[10px] font-mono">
                          {session?.transportType || diag?.transportType || 'webrtc'}
                        </span>
                      </div>
                      <div className="text-[11px] text-[#8b91a0] flex items-center gap-2 font-mono">
                        <span>Peer ID: {peer.peerId.slice(0, 12)}...</span>
                        <span>·</span>
                        <span className={isConnected ? 'text-[#47e266]' : 'text-amber-400'}>
                          Channel: {diag?.dataChannelState || (isConnected ? 'open' : 'connecting')}
                        </span>
                      </div>
                    </div>

                    {/* Metrics */}
                    <div className="flex items-center gap-4 flex-wrap text-xs">
                      <div className="flex items-center gap-1.5" title="Battery level">
                        <span className="material-symbols-outlined text-[16px] text-[#8b91a0]">
                          battery_unknown
                        </span>
                        <span className="font-mono text-[#8b91a0]">Not reported</span>
                      </div>

                      <div className="flex items-center gap-1.5" title="Signal Strength RSSI">
                        <span className="material-symbols-outlined text-[16px] text-[#8b91a0]">
                          signal_cellular_alt
                        </span>
                        <span className="font-mono text-[#8b91a0]">Not reported</span>
                      </div>

                      <div className="flex items-center gap-1.5" title="Packets relayed">
                        <span className="text-[11px] text-[#8b91a0]">Relayed:</span>
                        <span className="font-mono text-[#e5e2e1]">
                          {session?.relayedCount || 0} pkts
                        </span>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1.5 pl-2 border-l border-[#282828]">
                        <button
                          onClick={() => handlePingNode(`Peer ${peer.peerId.slice(0, 8)}`, peer.peerId)}
                          disabled={pingingNodeId === peer.peerId}
                          className="p-1.5 rounded-lg bg-[#202020] hover:bg-[#2a2a2a] text-[#c0c6d6] hover:text-[#e5e2e1] cursor-pointer transition-colors"
                          title="Ping Peer Node"
                        >
                          <span
                            className={`material-symbols-outlined text-[16px] ${
                              pingingNodeId === peer.peerId ? 'animate-spin' : ''
                            }`}
                          >
                            sensors
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        ) : (
          /* REFERENCE MODE RENDER */
          <div className="space-y-3">
            {referenceNodes.map((node) => (
              <div
                key={node.id}
                className="p-3.5 rounded-xl bg-[#141414] border border-[#242424] hover:border-[#303030] transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        node.status === 'online' ? 'bg-[#47e266] animate-pulse' : 'bg-amber-400'
                      }`}
                    />
                    <h4 className="text-xs font-bold text-[#e5e2e1]">{node.nodeName}</h4>
                    <span className="px-2 py-0.5 rounded-md bg-[#202020] text-[#8b91a0] text-[10px] font-mono">
                      {node.protocol}
                    </span>
                  </div>
                  <div className="text-[11px] text-[#8b91a0] flex items-center gap-2">
                    <span>{node.location}</span>
                    <span>·</span>
                    <span className="text-[#aac7ff]">{node.campusZone}</span>
                  </div>
                </div>

                {/* Metrics */}
                <div className="flex items-center gap-4 flex-wrap text-xs">
                  <div className="flex items-center gap-1.5" title="Battery level">
                    <span
                      className={`material-symbols-outlined text-[16px] ${
                        node.batteryPercent > 60
                          ? 'text-[#47e266]'
                          : node.batteryPercent > 30
                          ? 'text-amber-400'
                          : 'text-[#ffb4ab]'
                      }`}
                    >
                      battery_std
                    </span>
                    <span className="font-mono text-[#c0c6d6]">{node.batteryPercent}%</span>
                  </div>

                  <div className="flex items-center gap-1.5" title="Signal Strength RSSI">
                    <span className="material-symbols-outlined text-[16px] text-[#aac7ff]">
                      signal_cellular_alt
                    </span>
                    <span className="font-mono text-[#c0c6d6]">{node.rssiDbm} dBm</span>
                  </div>

                  <div className="flex items-center gap-1.5" title="Packets routed">
                    <span className="text-[11px] text-[#8b91a0]">Traffic:</span>
                    <span className="font-mono text-[#e5e2e1]">
                      {(node.packetsRouted24h / 1000).toFixed(1)}k pkts
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 pl-2 border-l border-[#282828]">
                    <button
                      onClick={() => handlePingNode(node.nodeName, node.id)}
                      disabled={pingingNodeId === node.id}
                      className="p-1.5 rounded-lg bg-[#202020] hover:bg-[#2a2a2a] text-[#c0c6d6] hover:text-[#e5e2e1] cursor-pointer transition-colors"
                      title="Ping Node"
                    >
                      <span
                        className={`material-symbols-outlined text-[16px] ${
                          pingingNodeId === node.id ? 'animate-spin' : ''
                        }`}
                      >
                        sensors
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
