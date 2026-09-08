import React, { useState, useEffect } from 'react';
import { AdminUser } from './types';
import { useNexusServices } from '../context/ServiceContext';

interface AdminHeaderProps {
  user: AdminUser;
  onLogout: () => void;
  onSwitchToFieldView: () => void;
  isInternetConnected: boolean;
  onToggleInternet: () => void;
}

export const AdminHeader: React.FC<AdminHeaderProps> = ({
  user,
  onLogout,
  onSwitchToFieldView,
  isInternetConnected,
  onToggleInternet,
}) => {
  const { isAudioMuted, toggleAudioMute } = useNexusServices();
  const [timeString, setTimeString] = useState('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeString(
        now.toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
          timeZone: 'Asia/Kolkata',
        }) + ' IST'
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="w-full bg-[#161616] border-b border-[#282828] px-4 py-3 sticky top-0 z-30 flex flex-col md:flex-row md:items-center md:justify-between gap-3 select-none">
      {/* Left: Brand & Incident Command Title */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#002957] to-[#3e90ff] flex items-center justify-center border border-[#3e90ff]/50 shadow-md shadow-[#3e90ff]/20">
          <span className="material-symbols-outlined text-[22px] text-white">
            admin_panel_settings
          </span>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[15px] font-bold text-[#e5e2e1] tracking-tight">
              Nexus Command Center
            </h1>
            <span className="px-2 py-0.5 rounded-full bg-[#93000a]/30 border border-[#ffb4ab]/40 text-[#ffdad6] text-[10px] font-bold tracking-wide">
              ADMINISTRATOR
            </span>
          </div>
          <p className="text-[11px] text-[#8b91a0] flex items-center gap-1.5 mt-0.5">
            <span>Amrita Vishwa Vidyapeetham, Vengal</span>
            <span>·</span>
            <span className="text-[#47e266] font-mono">{timeString || 'LIVE'}</span>
          </p>
        </div>
      </div>

      {/* Right: Controls & User Profile */}
      <div className="flex items-center flex-wrap gap-2 justify-between md:justify-end">
        {/* Internet Toggle */}
        <button
          onClick={onToggleInternet}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
            isInternetConnected
              ? 'bg-[#142e1d] border-[#2f6f3a] text-[#47e266]'
              : 'bg-[#291715] border-[#5e2b24] text-[#ffb4ab]'
          }`}
          title="Toggle Cloud Uplink vs Offline Mesh"
        >
          <span className="material-symbols-outlined text-[15px]">
            {isInternetConnected ? 'wifi' : 'wifi_off'}
          </span>
          <span className="hidden sm:inline">
            {isInternetConnected ? 'Cloud Online' : 'Zero-Internet Mesh'}
          </span>
          <span className="sm:hidden">{isInternetConnected ? 'Online' : 'Offline'}</span>
        </button>

        {/* Audio Alert Toggle */}
        <button
          onClick={toggleAudioMute}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
            isAudioMuted
              ? 'bg-[#222] border-[#333] text-[#8b91a0]'
              : 'bg-[#142e1d] border-[#2f6f3a] text-[#47e266]'
          }`}
          title={isAudioMuted ? 'Alert sounds muted (click to unmute)' : 'Alert sounds active (click to mute)'}
        >
          <span className="material-symbols-outlined text-[15px]">
            {isAudioMuted ? 'volume_off' : 'volume_up'}
          </span>
          <span className="hidden sm:inline">{isAudioMuted ? 'Muted' : 'Sound On'}</span>
        </button>

        {/* Switch to Field Mobile View */}
        <button
          onClick={onSwitchToFieldView}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#222] hover:bg-[#2b2b2b] border border-[#333] text-[#aac7ff] text-xs font-semibold transition-all cursor-pointer"
          title="Preview what ground field responders see"
        >
          <span className="material-symbols-outlined text-[16px]">smartphone</span>
          <span className="hidden sm:inline">Preview Field App</span>
        </button>

        {/* Admin Profile Info */}
        <div className="flex items-center gap-2 pl-2 border-l border-[#2e2e2e]">
          <div className="w-8 h-8 rounded-full bg-[#3e90ff]/20 border border-[#3e90ff]/40 text-[#aac7ff] font-bold text-xs flex items-center justify-center shadow-inner">
            {user.avatarInitials || 'AD'}
          </div>
          <div className="hidden lg:flex flex-col text-left">
            <span className="text-xs font-bold text-[#e5e2e1] leading-tight truncate max-w-[130px]">
              {user.name}
            </span>
            <span className="text-[10px] text-[#8b91a0] leading-none mt-0.5">
              {user.role}
            </span>
          </div>

          {/* Logout Button */}
          <button
            onClick={onLogout}
            className="w-8 h-8 rounded-xl bg-[#222] hover:bg-[#93000a]/30 border border-[#333] hover:border-[#ffb4ab]/40 text-[#8b91a0] hover:text-[#ffdad6] flex items-center justify-center transition-all cursor-pointer"
            title="Log Out Administrator Session"
          >
            <span className="material-symbols-outlined text-[16px]">logout</span>
          </button>
        </div>
      </div>
    </header>
  );
};
