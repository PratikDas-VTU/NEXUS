import React, { useState } from 'react';
import { NodeHealth } from './types';
import { INITIAL_MESH_NODES } from './mockAdminData';

interface NodeTelemetryProps {
  onShowToast: (msg: string) => void;
}

export const NodeTelemetry: React.FC<NodeTelemetryProps> = ({ onShowToast }) => {
  const [nodes, setNodes] = useState<NodeHealth[]>(INITIAL_MESH_NODES);
  const [pingingNodeId, setPingingNodeId] = useState<string | null>(null);

  const handlePingNode = (node: NodeHealth) => {
    setPingingNodeId(node.id);
    setTimeout(() => {
      setPingingNodeId(null);
      onShowToast(`✓ Echo ACK received from "${node.nodeName}": Latency ${node.hopLatencyMs}ms`);
    }, 600);
  };

  const handleRebootRepeater = (nodeName: string) => {
    onShowToast(`Soft-restart triggered for relay "${nodeName}"`);
  };

  const handleReKeyNetwork = () => {
    onShowToast('✓ AES-256 Mesh Keys rotated across all 5 Amrita Vengal nodes');
  };

  return (
    <div className="space-y-4">
      {/* Overview Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-[#181818] p-3.5 rounded-2xl border border-[#282828]">
          <span className="text-[11px] text-[#8b91a0]">Active Relays</span>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-xl font-bold text-[#e5e2e1]">5</span>
            <span className="text-[11px] text-[#47e266] font-semibold">100% Operational</span>
          </div>
        </div>

        <div className="bg-[#181818] p-3.5 rounded-2xl border border-[#282828]">
          <span className="text-[11px] text-[#8b91a0]">Packets / 24h</span>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-xl font-bold text-[#e5e2e1]">45.6k</span>
            <span className="text-[11px] text-[#aac7ff]">Zero Loss</span>
          </div>
        </div>

        <div className="bg-[#181818] p-3.5 rounded-2xl border border-[#282828]">
          <span className="text-[11px] text-[#8b91a0]">Avg Hop Latency</span>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-xl font-bold text-[#e5e2e1]">27ms</span>
            <span className="text-[11px] text-[#8b91a0]">Fast P2P</span>
          </div>
        </div>

        <div className="bg-[#181818] p-3.5 rounded-2xl border border-[#282828]">
          <span className="text-[11px] text-[#8b91a0]">Perimeter Coverage</span>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-xl font-bold text-[#e5e2e1]">4.2 km²</span>
            <span className="text-[11px] text-[#47e266]">Vengal Sector</span>
          </div>
        </div>
      </div>

      {/* Main Node List */}
      <div className="bg-[#181818] rounded-2xl border border-[#282828] p-4">
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#282828]">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#3e90ff] text-[20px]">
              hub
            </span>
            <h3 className="text-sm font-bold text-[#e5e2e1]">
              Amrita Vengal Campus Mesh Nodes
            </h3>
          </div>
          <button
            onClick={handleReKeyNetwork}
            className="px-3 py-1.5 rounded-xl bg-[#222] hover:bg-[#2a2a2a] border border-[#333] text-xs font-semibold text-[#aac7ff] flex items-center gap-1.5 cursor-pointer transition-all"
          >
            <span className="material-symbols-outlined text-[15px]">key</span>
            <span>Rotate AES-256 Keys</span>
          </button>
        </div>

        <div className="space-y-3">
          {nodes.map((node) => (
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
                    onClick={() => handlePingNode(node)}
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

                  <button
                    onClick={() => handleRebootRepeater(node.nodeName)}
                    className="p-1.5 rounded-lg bg-[#202020] hover:bg-[#2a2a2a] text-[#c0c6d6] hover:text-[#e5e2e1] cursor-pointer transition-colors"
                    title="Soft Restart"
                  >
                    <span className="material-symbols-outlined text-[16px]">restart_alt</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
