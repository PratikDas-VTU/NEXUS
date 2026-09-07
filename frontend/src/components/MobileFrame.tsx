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
  const [isFramed, setIsFramed] = useState(false);
  const currentTime = '09:41';

  return (
    <div className="w-full h-full min-h-[100dvh] flex flex-col items-center justify-start bg-[#131313] md:bg-[#0c0d0e] text-[#e5e2e1] p-0 md:p-3 overflow-x-hidden">
      {/* Desktop Development & Control Bar - ONLY visible on desktop (hidden on mobile) */}
      <header className="hidden md:flex w-full max-w-3xl lg:max-w-4xl items-center justify-between py-2 px-3 mb-1 text-xs text-[#8b91a0] shrink-0">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-[#47e266] animate-pulse" />
          <span className="font-bold text-[#e5e2e1] tracking-wide text-xs">
            NEXUS — OFFLINE EMERGENCY MESH
          </span>
          <span className="px-2 py-0.5 rounded-full bg-[#201f1f] text-[#c0c6d6] text-[10px] border border-[#2a2a2a]">
            Field Application
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
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#1c1b1b] hover:bg-[#201f1f] border border-[#2a2a2a] text-[#c0c6d6] text-xs transition-all cursor-pointer"
            title="Toggle between full responsive view and mobile phone preview frame"
          >
            {isFramed ? (
              <>
                <Maximize2 className="w-3.5 h-3.5" />
                <span>Full View</span>
              </>
            ) : (
              <>
                <Smartphone className="w-3.5 h-3.5" />
                <span>Phone Preview</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main
        id="nexus-mobile-container"
        className={`w-full flex-1 min-h-0 transition-all duration-200 flex flex-col bg-[#131313] ${
          isFramed
            ? 'h-full md:max-w-[410px] md:h-[840px] md:max-h-[calc(100vh-3.5rem)] md:rounded-[40px] md:border-[6px] md:border-[#2a2a2a] md:shadow-2xl md:shadow-black/90 overflow-hidden relative'
            : 'h-full md:max-w-3xl lg:max-w-4xl md:h-[calc(100vh-3.5rem)] md:rounded-2xl md:border md:border-[#201f1f] md:shadow-2xl md:shadow-black/60 overflow-hidden relative'
        }`}
      >
        {/* Mobile Device Status Bar — ONLY on desktop when explicitly in phone preview frame */}
        {isFramed && (
          <div className="hidden md:flex h-6 w-full bg-[#131313]/95 backdrop-blur-md px-4 items-center justify-between text-xs text-[#8b91a0] select-none z-50 shrink-0 border-b border-[#201f1f]/50">
            <span className="font-semibold tracking-tight text-[11px]">{currentTime}</span>

            {/* Subtle Island indicator */}
            <div className="flex items-center gap-1.5 text-[#8b91a0]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#47e266]" />
              <span className="text-[10px] font-mono tracking-wider">NEXUS MESH</span>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[13px] text-[#8b91a0]">
                {isInternetConnected ? 'wifi' : 'wifi_off'}
              </span>
              <span className="material-symbols-outlined text-[14px] text-[#47e266]">battery_full</span>
            </div>
          </div>
        )}

        {/* Scrollable Viewport */}
        <div className="flex-1 min-h-0 w-full flex flex-col overflow-hidden relative bg-[#131313]">
          {children}
        </div>

        {/* iOS / Mobile Home Indicator Bar — ONLY on desktop when explicitly in phone preview frame */}
        {isFramed && (
          <div className="hidden md:flex h-3.5 w-full bg-[#131313] items-center justify-center shrink-0 z-50">
            <div className="w-28 h-1 bg-[#353534] rounded-full" />
          </div>
        )}
      </main>
    </div>
  );
};
