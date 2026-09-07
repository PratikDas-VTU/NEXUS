import React, { useState } from 'react';
import { MeshPeer } from '../types';
import { meshPeers } from '../data/mockData';

interface NetworkTabProps {
  onShowToast: (msg: string) => void;
  isInternetConnected?: boolean;
  onToggleInternet?: () => void;
}

export const NetworkTab: React.FC<NetworkTabProps> = ({
  onShowToast,
  isInternetConnected = false,
  onToggleInternet,
}) => {
  const [peers, setPeers] = useState<MeshPeer[]>(meshPeers);
  const [isAutoScanning, setIsAutoScanning] = useState<boolean>(true);
  const [backgroundDiscovery, setBackgroundDiscovery] = useState<boolean>(true);
  const [highlightedPeerId, setHighlightedPeerId] = useState<string | null>(null);

  const handleToggleAutoScan = () => {
    const next = !isAutoScanning;
    setIsAutoScanning(next);
    onShowToast(next ? 'Mesh radio scanning enabled' : 'Mesh radio scanning paused');
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
            {peers.length} devices connected via Bluetooth &amp; Wi-Fi Direct
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

      {/* Kinetic Radar Visualization */}
      <div className="relative w-full aspect-square max-w-[320px] min-h-[250px] mx-auto rounded-3xl bg-[#1c1b1b] border border-[#2a2a2a] p-4 flex items-center justify-center overflow-hidden shadow-2xl shrink-0">
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

        {/* Peer 1 on Radar: Alpha Medic */}
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

        {/* Peer 2 on Radar: Rescue Unit 09 */}
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

        {/* Peer 3 on Radar: Civilian Relay */}
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

        {/* Peer 4 on Radar: Basecamp Gateway */}
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

      {/* Live Telemetry Pill - Dedicated clean placement outside radar */}
      <div className="flex justify-center shrink-0">
        <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#1c1b1b] border border-[#2a2a2a] text-[#c0c6d6] text-[11px] shadow-sm">
          <span className="material-symbols-outlined text-[14px] text-[#47e266]">check_circle</span>
          <span className="text-[#e5e2e1] font-medium">Mesh density optimal</span>
          <span className="text-[#8b91a0]">·</span>
          <span>Instant peer hopping</span>
        </div>
      </div>

      {/* Active Mesh Peers List */}
      <div className="flex flex-col gap-3 shrink-0">
        <h2 className="text-[15px] font-semibold text-[#e5e2e1] px-1 tracking-tight">
          Active Mesh Peers
        </h2>

        {peers.map((peer) => {
          const isHighlighted = highlightedPeerId === peer.id;

          return (
            <div
              key={peer.id}
              onClick={() => handleSelectPeer(peer)}
              className={`p-4 rounded-2xl bg-[#1c1b1b] border flex items-center justify-between cursor-pointer transition-all active:scale-[0.99] shrink-0 ${
                isHighlighted
                  ? 'border-[#47e266] shadow-[0_0_20px_rgba(71,226,102,0.2)] bg-[#201f1f]'
                  : 'border-[#2a2a2a] hover:border-[#353534]'
              }`}
            >
              <div className="flex items-center gap-3.5">
                <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${
                  peer.typeBadge === 'Direct'
                    ? 'bg-[#47e266]/15 text-[#47e266]'
                    : peer.typeBadge === 'Relay'
                    ? 'bg-[#3e90ff]/15 text-[#aac7ff]'
                    : 'bg-[#2a2a2a] text-[#c0c6d6]'
                }`}>
                  <span className="material-symbols-outlined text-[22px]">{peer.icon}</span>
                </div>

                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span className="text-[15px] font-semibold text-[#e5e2e1]">{peer.name}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                      peer.typeBadge === 'Direct'
                        ? 'bg-[#47e266]/15 text-[#47e266]'
                        : peer.typeBadge === 'Relay'
                        ? 'bg-[#3e90ff]/15 text-[#aac7ff]'
                        : 'bg-[#2a2a2a] text-[#c0c6d6]'
                    }`}>
                      {peer.typeBadge}
                    </span>
                  </div>
                  <span className="text-[12px] text-[#c0c6d6] mt-0.5">
                    {peer.role} · {peer.distance}
                  </span>
                  <span className="text-[11px] text-[#8b91a0] mt-0.5">{peer.syncTime}</span>
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
