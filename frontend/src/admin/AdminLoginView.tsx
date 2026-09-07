import React, { useState } from 'react';
import { AdminUser } from './types';
import { DEFAULT_ADMIN_USER } from './mockAdminData';

interface AdminLoginViewProps {
  onLoginSuccess: (user: AdminUser) => void;
  onCancel: () => void;
  onShowToast: (msg: string) => void;
  isInternetConnected: boolean;
  onToggleInternet: () => void;
}

export const AdminLoginView: React.FC<AdminLoginViewProps> = ({
  onLoginSuccess,
  onCancel,
  onShowToast,
  isInternetConnected,
  onToggleInternet,
}) => {
  const [email, setEmail] = useState('admin@amrita.edu');
  const [password, setPassword] = useState('amrita2026');
  const [stationKey, setStationKey] = useState('VENGAL-CMD-01');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!email.trim() || !password.trim()) {
      setErrorMessage('Please provide both administrator email and authentication passkey.');
      return;
    }

    setIsLoading(true);

    setTimeout(() => {
      setIsLoading(false);
      // Allow demo credentials or any admin email
      if (
        (email.toLowerCase().includes('admin') || email.toLowerCase().includes('amrita')) &&
        (password === 'amrita2026' || password.length >= 4)
      ) {
        onShowToast('✓ Administrator credentials validated. Welcome Dr. Rajesh K.');
        onLoginSuccess({
          ...DEFAULT_ADMIN_USER,
          email: email.trim(),
          station: `Amrita Vishwa Vidyapeetham Command Hub, Vengal (${stationKey})`,
        });
      } else {
        setErrorMessage('Invalid credentials. Use demo email: admin@amrita.edu and passkey: amrita2026');
      }
    }, 700);
  };

  const handleQuickDemoLogin = () => {
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      onShowToast('✓ Instant Demo Admin Sign-In: Incident Commander profile active');
      onLoginSuccess(DEFAULT_ADMIN_USER);
    }, 400);
  };

  return (
    <div className="min-h-screen w-full bg-[#0e0e0e] text-[#e5e2e1] flex flex-col justify-between p-4 sm:p-6 select-none relative overflow-y-auto">
      {/* Background ambient lighting */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-[#3e90ff]/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-80 h-80 bg-[#47e266]/5 rounded-full blur-3xl pointer-events-none" />

      {/* Top Bar inside Login View */}
      <div className="relative z-10 flex items-center justify-between max-w-md w-full mx-auto pb-4 border-b border-[#252525]">
        <button
          onClick={onCancel}
          className="flex items-center gap-1.5 text-xs text-[#c0c6d6] hover:text-white transition-colors cursor-pointer px-2.5 py-1.5 rounded-xl bg-[#1c1b1b] border border-[#2a2a2a]"
          title="Return to standard responder view"
        >
          <span className="material-symbols-outlined text-[16px]">arrow_back</span>
          <span>Field App</span>
        </button>

        <div className="flex items-center gap-2">
          {/* Internet Toggle in Login */}
          <button
            onClick={onToggleInternet}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium transition-all cursor-pointer ${
              isInternetConnected
                ? 'bg-[#142e1d] border-[#2f6f3a] text-[#47e266]'
                : 'bg-[#1c1b1b] border-[#2a2a2a] text-[#8b91a0]'
            }`}
          >
            <span className="material-symbols-outlined text-[14px]">
              {isInternetConnected ? 'wifi' : 'wifi_off'}
            </span>
            <span>{isInternetConnected ? 'Cloud Online' : 'Offline Mesh'}</span>
          </button>
        </div>
      </div>

      {/* Main Login Card */}
      <div className="relative z-10 w-full max-w-md mx-auto my-auto py-6">
        <div className="bg-[#181818]/95 border border-[#2b2b2b] rounded-3xl p-6 sm:p-7 shadow-2xl backdrop-blur-xl">
          {/* Header & Logo */}
          <div className="flex flex-col items-center text-center mb-6">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#3e90ff]/20 to-[#002957] border border-[#3e90ff]/40 flex items-center justify-center mb-3 shadow-[0_0_20px_rgba(62,144,255,0.25)]">
              <span className="material-symbols-outlined text-[28px] text-[#aac7ff]">
                shield_person
              </span>
            </div>
            <h1 className="text-xl font-bold text-[#e5e2e1] tracking-tight">
              Incident Command Center
            </h1>
            <p className="text-xs text-[#8b91a0] mt-1 max-w-xs">
              Amrita Vishwa Vidyapeetham · Vengal Campus & Thiruvallur District Emergency Mesh
            </p>
          </div>

          {/* Security Notice Pill */}
          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-[#201f1f] border border-[#2e2e2e] mb-5 text-[11px] text-[#c0c6d6]">
            <span className="material-symbols-outlined text-[16px] text-[#47e266] shrink-0">
              lock
            </span>
            <span>
              Local Offline Command Authentication: Validated locally against device memory (Zero-Cloud).
            </span>
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className="p-3 rounded-xl bg-[#93000a]/20 border border-[#ffb4ab]/40 text-[#ffdad6] text-xs mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px] text-[#ffb4ab]">error</span>
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[11px] font-semibold text-[#c0c6d6] uppercase tracking-wider mb-1.5">
                Administrator Email / ID
              </label>
              <div className="relative flex items-center">
                <span className="material-symbols-outlined absolute left-3 text-[18px] text-[#8b91a0]">
                  badge
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-[#121212] border border-[#303030] focus:border-[#3e90ff] focus:ring-1 focus:ring-[#3e90ff] rounded-xl py-2.5 pl-10 pr-3 text-xs text-[#e5e2e1] placeholder-[#666] outline-none transition-all"
                  placeholder="admin@amrita.edu"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[#c0c6d6] uppercase tracking-wider mb-1.5">
                Security Passkey / 2FA Token
              </label>
              <div className="relative flex items-center">
                <span className="material-symbols-outlined absolute left-3 text-[18px] text-[#8b91a0]">
                  key
                </span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-[#121212] border border-[#303030] focus:border-[#3e90ff] focus:ring-1 focus:ring-[#3e90ff] rounded-xl py-2.5 pl-10 pr-3 text-xs text-[#e5e2e1] placeholder-[#666] outline-none transition-all"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[#c0c6d6] uppercase tracking-wider mb-1.5">
                Command Station Sector
              </label>
              <div className="relative flex items-center">
                <span className="material-symbols-outlined absolute left-3 text-[18px] text-[#8b91a0]">
                  meeting_room
                </span>
                <input
                  type="text"
                  value={stationKey}
                  onChange={(e) => setStationKey(e.target.value)}
                  className="w-full bg-[#121212] border border-[#303030] focus:border-[#3e90ff] rounded-xl py-2.5 pl-10 pr-3 text-xs text-[#e5e2e1] placeholder-[#666] outline-none transition-all"
                  placeholder="VENGAL-CMD-01"
                />
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 rounded-xl bg-[#3e90ff] hover:bg-[#327ce0] text-[#002957] font-bold text-xs tracking-wide shadow-lg shadow-[#3e90ff]/20 flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-[0.99] disabled:opacity-50 mt-2"
            >
              {isLoading ? (
                <>
                  <span className="material-symbols-outlined text-[18px] animate-spin">
                    progress_activity
                  </span>
                  <span>Authenticating Mesh Credentials...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[18px]">login</span>
                  <span>Authenticate &amp; Open Command Dashboard</span>
                </>
              )}
            </button>
          </form>

          {/* Quick Demo Sign In Separator */}
          <div className="relative flex py-4 items-center">
            <div className="flex-grow border-t border-[#2d2d2d]" />
            <span className="shrink-0 mx-3 text-[11px] text-[#8b91a0]">Fast Verification</span>
            <div className="flex-grow border-t border-[#2d2d2d]" />
          </div>

          {/* Demo Admin One-Click Button */}
          <button
            type="button"
            onClick={handleQuickDemoLogin}
            disabled={isLoading}
            className="w-full py-2.5 px-3 rounded-xl bg-[#222222] hover:bg-[#2b2b2b] border border-[#333333] text-[#aac7ff] font-semibold text-xs flex items-center justify-center gap-2 cursor-pointer transition-all"
          >
            <span className="material-symbols-outlined text-[18px] text-[#47e266]">
              verified_user
            </span>
            <span>One-Click Demo Admin Login (Dr. Rajesh K.)</span>
          </button>

          {/* Default Credentials Hint */}
          <div className="mt-4 p-2.5 rounded-xl bg-[#141414] border border-[#262626] text-center">
            <span className="text-[10px] text-[#8b91a0]">
              Demo credentials: <code className="text-[#aac7ff] font-mono">admin@amrita.edu</code> / <code className="text-[#aac7ff] font-mono">amrita2026</code>
            </span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="relative z-10 text-center py-2 text-[11px] text-[#666]">
        Amrita Vishwa Vidyapeetham Autonomous Emergency Network · Offline Cryptographic Mesh Core
      </div>
    </div>
  );
};
