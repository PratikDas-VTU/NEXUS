import React, { useState } from 'react';
import { NavTab } from '../types';
import { NEXUS_BRAND_LOGOS } from '../data/mockData';
import { GeolocationCoordinates, LocationState } from '../services/api/geolocation';
import { LocationDetailsModal } from './LocationDetailsModal';
import { useNexusServices } from '../context/ServiceContext';

interface TopBarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  peerCount?: number;
  isInternetConnected?: boolean;
  onToggleInternet?: () => void;
  location?: GeolocationCoordinates | null;
  locationState?: LocationState;
  locationError?: string | null;
  onRefreshGps?: () => Promise<any>;
  onSetManualLocation?: (lat: number, lng: number) => void;
  onOpenAdmin?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  activeTab,
  onSelectTab,
  peerCount = 4,
  isInternetConnected = false,
  onToggleInternet,
  location = null,
  locationState = 'IDLE',
  locationError = null,
  onRefreshGps,
  onSetManualLocation,
  onOpenAdmin,
}) => {
  const { isAudioMuted, toggleAudioMute } = useNexusServices();
  const [showMeshDiagnostics, setShowMeshDiagnostics] = useState(false);
  const [showLocationDetails, setShowLocationDetails] = useState(false);

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
      <header className="sticky top-0 w-full z-40 shrink-0 bg-[#121417]/95 backdrop-blur-xl border-b border-[#22262b] pt-safe-top">
        <div className="h-13 px-3 flex items-center justify-between gap-2 max-w-5xl mx-auto">
          {/* Brand logo & title */}
          <div
            className="flex items-center gap-2 cursor-pointer select-none shrink-0"
            onClick={() => onSelectTab('feed')}
          >
            <img
              src={currentLogo}
              alt="NEXUS logo"
              className="h-6 w-auto object-contain"
            />
            <div className="flex flex-col">
              <span className="font-bold text-sm tracking-tight text-[#e6e8eb] leading-tight">
                NEXUS
              </span>
              <span className="text-[10px] text-[#9da4b0] font-medium leading-none hidden sm:inline">
                {getTabSubtitle()}
              </span>
            </div>
          </div>

          {/* Right status & controls */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Compact Tactical Location Status Indicator */}
            <button
              id="nexus-btn-location-indicator"
              onClick={() => setShowLocationDetails(true)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] font-mono transition-colors cursor-pointer ${
                locationState === 'LIVE'
                  ? 'bg-[#122a1b] border-[#245831] text-[#47e266]'
                  : locationState === 'CACHED'
                  ? 'bg-[#291e10] border-[#593d19] text-[#ffb84e]'
                  : locationState === 'MANUAL'
                  ? 'bg-[#162030] border-[#293d5c] text-[#aac7ff]'
                  : locationState === 'ACQUIRING'
                  ? 'bg-[#182232] border-[#283b54] text-[#3e90ff]'
                  : 'bg-[#1a1d21] border-[#26292e] text-[#9da4b0]'
              }`}
              title="Tactical GPS Status · Click to view details / manual override"
            >
              <span className="material-symbols-outlined text-[13px] shrink-0">
                {locationState === 'LIVE'
                  ? 'location_on'
                  : locationState === 'CACHED'
                  ? 'inventory_2'
                  : locationState === 'MANUAL'
                  ? 'edit_location'
                  : locationState === 'ACQUIRING'
                  ? 'sync'
                  : 'location_off'}
              </span>
              <span className="font-semibold truncate max-w-[70px] xs:max-w-[100px] sm:max-w-none">
                {locationState === 'LIVE' && location
                  ? `${location.latitude.toFixed(3)}, ${location.longitude.toFixed(3)}`
                  : locationState === 'CACHED' && location
                  ? `${location.latitude.toFixed(3)}, ${location.longitude.toFixed(3)}`
                  : locationState === 'MANUAL' && location
                  ? `${location.latitude.toFixed(3)}, ${location.longitude.toFixed(3)}`
                  : locationState === 'ACQUIRING'
                  ? 'Acquiring...'
                  : 'No GPS'}
              </span>
            </button>

            {/* Consolidated Connection Status */}
            <button
              id="nexus-btn-mesh-status"
              onClick={() => setShowMeshDiagnostics(true)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium transition-colors cursor-pointer ${
                isInternetConnected
                  ? 'bg-[#122a1b] border-[#245831] text-[#47e266]'
                  : 'bg-[#1a1d21] border-[#26292e] text-[#e6e8eb] hover:border-[#373e48]'
              }`}
              title="Connection status · Click for diagnostics"
            >
              <span className={`w-2 h-2 rounded-full ${isInternetConnected ? 'bg-[#47e266]' : 'bg-[#47e266]'}`} />
              <span className="font-semibold text-[11px] hidden xs:inline">{isInternetConnected ? 'Online' : 'Offline'}</span>
              <span className="text-[#6b7280] hidden xs:inline">·</span>
              <span className="text-[#9da4b0]">Mesh ({peerCount})</span>
            </button>

            {/* Interactive Internet toggle button */}
            <button
              id="nexus-btn-toggle-internet-topbar"
              onClick={onToggleInternet}
              className={`w-7.5 h-7.5 rounded-lg flex items-center justify-center border transition-colors cursor-pointer ${
                isInternetConnected
                  ? 'bg-[#122a1b] hover:bg-[#183924] border-[#245831] text-[#47e266]'
                  : 'bg-[#1a1d21] hover:bg-[#22262b] border-[#26292e] text-[#9da4b0] hover:text-[#e6e8eb]'
              }`}
              title={isInternetConnected ? 'Internet Uplink ON — Click to go Offline' : 'Zero Internet (Offline Mesh) — Click to turn ON'}
            >
              <span className="material-symbols-outlined text-[15px]">
                {isInternetConnected ? 'wifi' : 'wifi_off'}
              </span>
            </button>

            {/* Audio Alert Mute / Unmute Toggle */}
            <button
              id="nexus-btn-toggle-audio-topbar"
              onClick={toggleAudioMute}
              className={`w-7.5 h-7.5 rounded-lg flex items-center justify-center border transition-colors cursor-pointer ${
                isAudioMuted
                  ? 'bg-[#1a1d21] hover:bg-[#22262b] border-[#26292e] text-[#6b7280]'
                  : 'bg-[#122a1b] hover:bg-[#183924] border-[#245831] text-[#47e266]'
              }`}
              title={isAudioMuted ? 'Emergency alert sounds muted (click to unmute)' : 'Emergency alert sounds active (click to mute)'}
            >
              <span className="material-symbols-outlined text-[15px]">
                {isAudioMuted ? 'volume_off' : 'volume_up'}
              </span>
            </button>

            {/* User profile avatar button */}
            <button
              id="nexus-btn-header-profile"
              onClick={() => onSelectTab('device')}
              className={`w-7.5 h-7.5 rounded-lg flex items-center justify-center border transition-colors cursor-pointer ${
                activeTab === 'device'
                  ? 'bg-[#002957] border-[#3e90ff] text-[#aac7ff]'
                  : 'bg-[#1a1d21] hover:bg-[#22262b] border-[#26292e] text-[#9da4b0] hover:text-[#e6e8eb]'
              }`}
              title="Open Device & Profile Settings"
            >
              <span className="material-symbols-outlined text-[16px]">
                person
              </span>
            </button>

            {/* Admin Command Hub Portal button */}
            {onOpenAdmin && (
              <button
                id="nexus-btn-header-admin"
                onClick={onOpenAdmin}
                className="w-7.5 h-7.5 rounded-lg flex items-center justify-center border transition-colors cursor-pointer bg-[#1a1d21] hover:bg-[#22262b] border-[#26292e] text-[#9da4b0] hover:text-[#aac7ff]"
                title="Amrita Disaster Command Hub (Admin Portal)"
              >
                <span className="material-symbols-outlined text-[16px]">
                  admin_panel_settings
                </span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Location Details Modal */}
      <LocationDetailsModal
        isOpen={showLocationDetails}
        onClose={() => setShowLocationDetails(false)}
        location={location}
        locationState={locationState}
        locationError={locationError}
        onRefreshGps={onRefreshGps || (async () => {})}
        onSetManualLocation={onSetManualLocation || (() => {})}
      />

      {/* Mesh Diagnostics Dialog */}
      {showMeshDiagnostics && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#1a1d21] border border-[#2c3138] rounded-2xl w-full max-w-xs p-4 shadow-xl flex flex-col gap-3 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between border-b border-[#26292e] pb-2.5">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#47e266]" />
                <span className="text-sm font-bold text-[#e6e8eb]">Mesh Network Status</span>
              </div>
              <button
                onClick={() => setShowMeshDiagnostics(false)}
                className="w-6 h-6 rounded-lg bg-[#22262b] hover:bg-[#2c3138] flex items-center justify-center text-[#9da4b0] hover:text-[#e6e8eb] cursor-pointer"
              >
                <span className="material-symbols-outlined text-[15px]">close</span>
              </button>
            </div>

            <div className="flex flex-col gap-2 text-xs">
              {/* Internet Uplink Toggle Row */}
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#15171a] border border-[#26292e]">
                <div className="flex flex-col">
                  <span className="text-[#e6e8eb] font-semibold text-xs">Internet Connection</span>
                  <span className="text-[#9da4b0] text-[10px]">
                    {isInternetConnected ? 'Cloud dispatch uplink active' : 'Zero Internet (offline mesh only)'}
                  </span>
                </div>
                <button
                  onClick={onToggleInternet}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                    isInternetConnected
                      ? 'bg-[#122a1b] text-[#47e266] border border-[#245831]'
                      : 'bg-[#22262b] text-[#e6e8eb] border border-[#373e48]'
                  }`}
                >
                  {isInternetConnected ? 'Turn OFF' : 'Turn ON'}
                </button>
              </div>

              <div className="flex items-center justify-between p-2 rounded-lg bg-[#15171a]">
                <span className="text-[#9da4b0]">Connection Mode</span>
                <span className={isInternetConnected ? 'text-[#47e266] font-semibold' : 'text-[#ffb4ab] font-semibold'}>
                  {isInternetConnected ? 'Internet Gateway + Mesh' : 'Zero Internet (P2P Mesh)'}
                </span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-[#15171a]">
                <span className="text-[#9da4b0]">Direct WebRTC Peers</span>
                <span className="text-[#e6e8eb] font-semibold">{peerCount} nodes in range</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-[#15171a]">
                <span className="text-[#9da4b0]">Multi-Hop Reach</span>
                <span className="text-[#aac7ff] font-semibold">Store-Carry-Forward (3 hops)</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-[#15171a]">
                <span className="text-[#9da4b0]">Encryption Protocol</span>
                <span className="text-[#e6e8eb] font-mono">WebRTC DTLS-SRTP</span>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => {
                  setShowMeshDiagnostics(false);
                  onSelectTab('network');
                }}
                className="flex-1 py-2 rounded-xl bg-[#3e90ff] text-[#002957] font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer hover:bg-[#559eff]"
              >
                <span className="material-symbols-outlined text-[16px]">hub</span>
                <span>Open Network View</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
