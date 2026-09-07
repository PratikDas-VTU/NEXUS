import React, { useState } from 'react';
import { NavTab } from '../types';
import { NEXUS_BRAND_LOGOS } from '../data/mockData';

interface TopBarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  peerCount?: number;
  isInternetConnected?: boolean;
  onToggleInternet?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  activeTab,
  onSelectTab,
  peerCount = 4,
  isInternetConnected = false,
  onToggleInternet,
}) => {
  const [showMeshDiagnostics, setShowMeshDiagnostics] = useState(false);

  const getTabSubtitle = () => {
    switch (activeTab) {
      case 'feed': return 'Emergency Feed';
      case 'map': return 'Tactical Map';
      case 'network': return 'Mesh Nodes';
      case 'device': return 'Node Settings';
    }
  };

  const currentLogo = NEXUS_BRAND_LOGOS[activeTab] || NEXUS_BRAND_LOGOS.feed;

  return (
    <>
      <header className="sticky top-0 w-full z-40 shrink-0 bg-[#131313]/95 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.3)] border-b border-[#201f1f]/80">
        <div className="h-12 px-3 flex items-center justify-between">
          {/* Brand logo & title */}
          <div
            className="flex items-center gap-1.5 cursor-pointer select-none shrink-0"
            onClick={() => onSelectTab('feed')}
          >
            <img
              src={currentLogo}
              alt="NEXUS logo"
              className="h-6 w-auto object-contain transition-opacity hover:opacity-90"
            />
            <div className="flex flex-col">
              <span className="font-bold text-[15px] tracking-tight text-[#e5e2e1] leading-none">
                NEXUS
              </span>
              <span className="text-[10px] text-[#aac7ff] leading-none mt-0.5 font-medium hidden sm:inline">
                {getTabSubtitle()}
              </span>
            </div>
          </div>

          {/* Right status & controls */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Consolidated Authoritative Connection Status */}
            <button
              id="nexus-btn-mesh-status"
              onClick={() => setShowMeshDiagnostics(true)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium transition-all cursor-pointer ${
                isInternetConnected
                  ? 'bg-[#152a1b] border-[#2f6f3a] text-[#47e266]'
                  : 'bg-[#1c1b1b] border-[#2a2a2a] text-[#e5e2e1] hover:border-[#353534]'
              }`}
              title="Connection status · Click for diagnostics"
            >
              <span className={`w-2 h-2 rounded-full ${isInternetConnected ? 'bg-[#47e266]' : 'bg-[#47e266] animate-pulse'}`} />
              <span className="font-semibold">{isInternetConnected ? 'Online' : 'Offline'}</span>
              <span className="text-[#8b91a0]">·</span>
              <span className="text-[#c0c6d6]">Mesh ({peerCount})</span>
            </button>

            {/* Interactive Internet toggle button */}
            <button
              id="nexus-btn-toggle-internet-topbar"
              onClick={onToggleInternet}
              className={`w-7 h-7 rounded-full flex items-center justify-center border transition-all cursor-pointer ${
                isInternetConnected
                  ? 'bg-[#152a1b] hover:bg-[#1a3824] border-[#2f6f3a] text-[#47e266]'
                  : 'bg-[#201f1f] hover:bg-[#2a2a2a] border-[#2a2a2a] text-[#8b91a0] hover:text-[#e5e2e1]'
              }`}
              title={isInternetConnected ? 'Internet Uplink ON — Click to go Offline' : 'Zero Internet (Offline Mesh) — Click to turn ON'}
            >
              <span className="material-symbols-outlined text-[14px]">
                {isInternetConnected ? 'wifi' : 'wifi_off'}
              </span>
            </button>

            {/* User profile avatar button */}
            <button
              id="nexus-btn-header-profile"
              onClick={() => onSelectTab('device')}
              className={`w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                activeTab === 'device'
                  ? 'ring-2 ring-[#3e90ff] ring-offset-1 ring-offset-[#131313] bg-[#aac7ff]'
                  : 'bg-[#aac7ff] hover:brightness-110 active:scale-95'
              }`}
              title="Open Device & Profile Settings"
            >
              <span className="material-symbols-outlined text-[#003064] text-[15px]">
                person
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Mesh Diagnostics Dialog */}
      {showMeshDiagnostics && (
        <div className="absolute inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#1c1b1b] border border-[#2a2a2a] rounded-3xl w-full max-w-xs p-5 shadow-2xl flex flex-col gap-3.5 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between border-b border-[#2a2a2a] pb-2.5">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#47e266] animate-pulse" />
                <span className="text-[14px] font-bold text-[#e5e2e1]">Mesh Network Status</span>
              </div>
              <button
                onClick={() => setShowMeshDiagnostics(false)}
                className="w-7 h-7 rounded-full bg-[#2a2a2a] hover:bg-[#353534] flex items-center justify-center text-[#c0c6d6] cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            </div>

            <div className="flex flex-col gap-2 text-xs">
              {/* Internet Uplink Toggle Row */}
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#131313] border border-[#2a2a2a]">
                <div className="flex flex-col">
                  <span className="text-[#e5e2e1] font-semibold text-[12px]">Internet Connection</span>
                  <span className="text-[#8b91a0] text-[10px]">
                    {isInternetConnected ? 'Cloud dispatch uplink active' : 'Zero Internet (offline mesh only)'}
                  </span>
                </div>
                <button
                  onClick={onToggleInternet}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                    isInternetConnected
                      ? 'bg-[#47e266] text-[#003912] hover:bg-[#3cd35a]'
                      : 'bg-[#353534] text-[#e5e2e1] hover:bg-[#414754]'
                  }`}
                >
                  {isInternetConnected ? 'Turn OFF' : 'Turn ON'}
                </button>
              </div>

              <div className="flex items-center justify-between p-2 rounded-xl bg-[#131313]">
                <span className="text-[#8b91a0]">Connection Mode</span>
                <span className={isInternetConnected ? 'text-[#47e266] font-semibold' : 'text-[#ffb4ab] font-semibold'}>
                  {isInternetConnected ? 'Internet Gateway + Mesh' : 'Zero Internet (P2P Mesh)'}
                </span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-xl bg-[#131313]">
                <span className="text-[#8b91a0]">Direct BLE Peers</span>
                <span className="text-[#e5e2e1] font-semibold">{peerCount} nodes in range</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-xl bg-[#131313]">
                <span className="text-[#8b91a0]">Multi-Hop Reach</span>
                <span className="text-[#aac7ff] font-semibold">Up to 4 hops (3.2 km)</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-xl bg-[#131313]">
                <span className="text-[#8b91a0]">Encryption Protocol</span>
                <span className="text-[#e5e2e1] font-mono">AES-256-GCM Ephemeral</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-xl bg-[#131313]">
                <span className="text-[#8b91a0]">Mesh Duty Cycle</span>
                <span className="text-[#47e266]">100% (Continuous Sync)</span>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => {
                  setShowMeshDiagnostics(false);
                  onSelectTab('network');
                }}
                className="flex-1 py-2.5 rounded-xl bg-[#3e90ff] text-[#002957] font-semibold text-xs flex items-center justify-center gap-1 cursor-pointer hover:bg-[#3e90ff]/90"
              >
                <span className="material-symbols-outlined text-[16px]">hub</span>
                <span>Open Radar View</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
