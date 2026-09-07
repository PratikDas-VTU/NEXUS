import React, { useState } from 'react';
import { Smartphone, Maximize2, Sparkles } from 'lucide-react';

interface MobileFrameProps {
  children: React.ReactNode;
  onOpenStitchModal: () => void;
  isInternetConnected: boolean;
  onToggleInternet: () => void;
}

export const MobileFrame: React.FC<MobileFrameProps> = ({
  children,
  onOpenStitchModal,
  isInternetConnected,
  onToggleInternet,
}) => {
  const [isFramed, setIsFramed] = useState(true);
  const currentTime = '09:41';

  return (
    <div className="h-screen max-h-screen overflow-hidden bg-[#0e0e0e] text-[#e5e2e1] flex flex-col items-center justify-start p-1 sm:p-2.5">
      {/* Desktop Helper Bar */}
      <header className="w-full max-w-md sm:max-w-xl md:max-w-3xl flex items-center justify-between py-1.5 px-3 mb-1 text-xs text-[#8b91a0] shrink-0">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-[#47e266] animate-pulse" />
          <span className="font-bold text-[#e5e2e1] tracking-wide text-[11px] sm:text-xs">
            NEXUS — OFFLINE EMERGENCY MESH
          </span>
          <span className="hidden sm:inline-block px-2 py-0.5 rounded-full bg-[#201f1f] text-[#c0c6d6] text-[10px] border border-[#2a2a2a]">
            Stitch System
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Direct Internet ON/OFF Toggle */}
          <button
            id="nexus-btn-toggle-internet-frame"
            onClick={onToggleInternet}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-all text-xs font-medium cursor-pointer ${
              isInternetConnected
                ? 'bg-[#122b1b] hover:bg-[#183923] border-[#2f6f3a] text-[#47e266]'
                : 'bg-[#291715] hover:bg-[#381f1b] border-[#5e2b24] text-[#ffb4ab]'
            }`}
            title="Toggle between Zero Internet (Mesh Mode) and Connected (Internet Uplink)"
          >
            <span className="material-symbols-outlined text-[15px]">
              {isInternetConnected ? 'wifi' : 'wifi_off'}
            </span>
            <span>{isInternetConnected ? 'Internet: ON' : 'Internet: OFF'}</span>
          </button>

          <button
            id="nexus-btn-open-stitch-helper"
            onClick={onOpenStitchModal}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#201f1f] hover:bg-[#2a2a2a] border border-[#3e90ff]/30 text-[#aac7ff] transition-all text-xs font-medium cursor-pointer"
            title="View Stitch Data Details & Inject Incidents"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#3e90ff]" />
            <span>Stitch Data</span>
          </button>

          <button
            id="nexus-btn-toggle-frame"
            onClick={() => setIsFramed(!isFramed)}
            className="hidden sm:flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#1c1b1b] hover:bg-[#201f1f] border border-[#2a2a2a] text-[#c0c6d6] text-xs transition-all cursor-pointer"
            title="Toggle phone frame"
          >
            {isFramed ? (
              <>
                <Maximize2 className="w-3.5 h-3.5" />
                <span>Full View</span>
              </>
            ) : (
              <>
                <Smartphone className="w-3.5 h-3.5" />
                <span>Phone Frame</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main
        id="nexus-mobile-container"
        className={`w-full flex-1 min-h-0 transition-all duration-300 flex flex-col ${
          isFramed
            ? 'max-w-[420px] h-full max-h-[860px] rounded-[38px] border-[5px] border-[#2a2a2a] bg-[#131313] shadow-2xl shadow-black/90 overflow-hidden relative'
            : 'max-w-2xl h-full border-x border-[#201f1f] bg-[#131313] overflow-hidden relative'
        }`}
      >
        {/* Mobile Device Status Bar */}
        {isFramed && (
          <div className="h-8 w-full bg-[#131313]/95 backdrop-blur-md px-5 flex items-center justify-between text-xs text-[#e5e2e1] select-none z-50 shrink-0 border-b border-[#201f1f]/50">
            <span className="font-semibold tracking-tight text-[12px]">{currentTime}</span>

            {/* Dynamic Island pill with Internet status */}
            <div className="h-4 px-2.5 bg-[#0e0e0e] rounded-full border border-[#2a2a2a] flex items-center justify-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${isInternetConnected ? 'bg-[#47e266]' : 'bg-[#ffb4ab]'} animate-pulse`} />
              <span className="text-[8.5px] text-[#c0c6d6] font-mono tracking-tighter">
                {isInternetConnected ? 'ONLINE · CLOUD' : 'ZERO INTERNET · MESH'}
              </span>
            </div>

            {/* Clickable Internet Toggle Pill in Mobile Status Bar */}
            <div className="flex items-center gap-2 text-[#c0c6d6]">
              <button
                onClick={onToggleInternet}
                className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full border text-[10px] font-medium transition-all cursor-pointer ${
                  isInternetConnected
                    ? 'bg-[#152a1b] border-[#2f6f3a] text-[#47e266]'
                    : 'bg-[#291715] border-[#5e2b24] text-[#ffb4ab]'
                }`}
                title="Click to turn Internet ON / OFF"
              >
                <span className="material-symbols-outlined text-[12px]">
                  {isInternetConnected ? 'wifi' : 'wifi_off'}
                </span>
                <span>{isInternetConnected ? '4G' : 'OFF'}</span>
              </button>
              <span className="material-symbols-outlined text-[15px] text-[#47e266]">battery_charging_full</span>
            </div>
          </div>
        )}

        {/* Scrollable Mobile Viewport */}
        <div className="flex-1 min-h-0 w-full flex flex-col overflow-hidden relative bg-[#131313]">
          {children}
        </div>

        {/* iOS / Mobile Home Indicator Bar (When framed) */}
        {isFramed && (
          <div className="h-3.5 w-full bg-[#131313] flex items-center justify-center shrink-0 z-50">
            <div className="w-28 h-1 bg-[#353534] rounded-full" />
          </div>
        )}
      </main>
    </div>
  );
};
