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
        <div className="h-16 px-4 flex items-center justify-between">
          {/* Brand logo & title */}
          <div
            className="flex items-center gap-2 cursor-pointer select-none"
            onClick={() => onSelectTab('feed')}
          >
            <img
              src={currentLogo}
              alt="NEXUS logo"
              className="h-8 w-auto object-contain transition-opacity hover:opacity-90"
            />
            <div className="flex flex-col">
              <span className="font-bold text-[17px] tracking-tight text-[#e5e2e1] leading-none">
                NEXUS
              </span>
              <span className="text-[11px] text-[#aac7ff] leading-none mt-1 font-medium">
                {getTabSubtitle()}
              </span>
            </div>
          </div>

          {/* Right status & avatar */}
          <div className="flex items-center gap-2">
            {/* Interactive Internet status button */}
            <button
              id="nexus-btn-toggle-internet-topbar"
              onClick={onToggleInternet}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border transition-all cursor-pointer ${
                isInternetConnected
                  ? 'bg-[#152a1b] hover:bg-[#1a3824] border-[#2f6f3a] text-[#47e266] shadow-[0_0_10px_rgba(71,226,102,0.15)]'
                  : 'bg-[#291715] hover:bg-[#381f1b] border-[#5e2b24] text-[#ffb4ab]'
              }`}
              title={isInternetConnected ? 'Internet connection ACTIVE (Cloud Uplink) — Click to disconnect' : 'Zero Internet Mode (Offline Mesh) — Click to turn ON'}
            >
              <span className="material-symbols-outlined text-[14px]">
                {isInternetConnected ? 'wifi' : 'wifi_off'}
              </span>
              <span className="text-[11px] font-semibold tracking-tight">
                {isInternetConnected ? 'Online' : 'Offline'}
              </span>
            </button>

            {/* Interactive Offline mesh badge */}
            <button
              id="nexus-btn-mesh-status"
              onClick={() => setShowMeshDiagnostics(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-[#201f1f] hover:bg-[#2a2a2a] backdrop-blur-md border border-[#353534] shadow-inner transition-all cursor-pointer"
              title="Click to view Live Mesh Diagnostics"
            >
              <span className="w-2 h-2 rounded-full bg-[#47e266] animate-pulse" />
              <span className="text-[11px] text-[#e5e2e1] font-semibold tracking-tight">
                Mesh: {peerCount}
              </span>
            </button>

            {/* User profile avatar pill */}
            <button
              id="nexus-btn-header-profile"
              onClick={() => onSelectTab('device')}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                activeTab === 'device'
                  ? 'ring-2 ring-[#3e90ff] ring-offset-2 ring-offset-[#131313] bg-[#aac7ff]'
                  : 'bg-[#aac7ff] hover:brightness-110 active:scale-95'
              }`}
              title="Open Device & Profile Settings"
            >
              <span className="material-symbols-outlined text-[#003064] text-[19px]">
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
