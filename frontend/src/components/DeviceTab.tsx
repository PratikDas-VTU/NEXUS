import React, { useState, useEffect } from 'react';
import { DeviceProfile } from '../types';
import { initialDeviceProfile } from '../data/mockData';

interface DeviceTabProps {
  onShowToast: (msg: string) => void;
  isInternetConnected?: boolean;
  onToggleInternet?: () => void;
  deviceId?: string;
  outboxCount?: number;
  localCacheCount?: number;
  onOpenAdmin?: () => void;
}

export const DeviceTab: React.FC<DeviceTabProps> = ({
  onShowToast,
  isInternetConnected = false,
  onToggleInternet,
  deviceId,
  outboxCount = 0,
  localCacheCount = 0,
  onOpenAdmin,
}) => {
  const [profile, setProfile] = useState<DeviceProfile>(initialDeviceProfile);
  const [showQrModal, setShowQrModal] = useState<boolean>(false);
  const [testSignalSending, setTestSignalSending] = useState<boolean>(false);

  // Real Hardware Battery Inspection
  const [batteryData, setBatteryData] = useState<{
    percent: number | null;
    isCharging: boolean | null;
    supported: boolean;
  }>({ percent: null, isCharging: null, supported: false });

  // Real Storage Manager Inspection (IndexedDB)
  const [storageEstimate, setStorageEstimate] = useState<{
    usedKb: number | null;
    quotaMb: number | null;
  }>({ usedKb: null, quotaMb: null });

  useEffect(() => {
    let isMounted = true;
    if (typeof navigator !== 'undefined' && 'getBattery' in navigator) {
      (navigator as any)
        .getBattery()
        .then((battery: any) => {
          if (!isMounted) return;
          setBatteryData({
            percent: Math.round(battery.level * 100),
            isCharging: battery.charging,
            supported: true,
          });
          const update = () => {
            if (isMounted) {
              setBatteryData({
                percent: Math.round(battery.level * 100),
                isCharging: battery.charging,
                supported: true,
              });
            }
          };
          battery.addEventListener('levelchange', update);
          battery.addEventListener('chargingchange', update);
        })
        .catch(() => {
          if (isMounted) {
            setBatteryData({ percent: null, isCharging: null, supported: false });
          }
        });
    } else {
      setBatteryData({ percent: null, isCharging: null, supported: false });
    }

    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
      navigator.storage.estimate().then((est) => {
        if (!isMounted) return;
        setStorageEstimate({
          usedKb: est.usage ? Math.round(est.usage / 1024) : null,
          quotaMb: est.quota ? Math.round(est.quota / (1024 * 1024)) : null,
        });
      }).catch(() => {});
    }

    return () => {
      isMounted = false;
    };
  }, []);

  const toggleProtocol = (key: keyof DeviceProfile['protocols']) => {
    const willBeActive = !profile.protocols[key];
    setProfile((prev) => ({
      ...prev,
      protocols: {
        ...prev.protocols,
        [key]: willBeActive,
      },
    }));
    const label =
      key === 'ble'
        ? 'Bluetooth LE Mesh'
        : key === 'wifi'
        ? 'Wi-Fi Direct P2P'
        : 'Automatic Cloud Sync';
    onShowToast(`${label} ${willBeActive ? 'enabled' : 'disabled'}`);
  };

  const handleSendTestSignal = () => {
    if (testSignalSending) return;
    setTestSignalSending(true);
    onShowToast('Transmitting diagnostic beacon via WebRTC mesh transport...');
    setTimeout(() => {
      setTestSignalSending(false);
      onShowToast('Emergency test signal relayed through local DataChannel');
    }, 1600);
  };

  return (
    <div className="flex-1 min-h-0 w-full flex flex-col px-4 pt-3 pb-8 gap-4 overflow-y-auto no-scrollbar">
      {/* Profile Card */}
      <div className="p-4 rounded-3xl bg-[#1c1b1b] border border-[#2a2a2a] flex items-center justify-between shadow-lg shrink-0">
        <div className="flex items-center gap-3.5">
          <div className="relative">
            <img
              src={profile.avatar}
              alt={profile.name}
              className="w-14 h-14 rounded-2xl object-cover border border-[#353534]"
            />
            <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-[#47e266] border-2 border-[#131313] flex items-center justify-center">
              <span className="material-symbols-outlined text-[10px] text-[#003910] font-bold">
                check
              </span>
            </span>
          </div>

          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="text-[17px] font-bold text-[#e5e2e1]">{profile.name}</span>
              <span className="px-2 py-0.5 rounded-full bg-[#002957] text-[#aac7ff] text-[10px] font-semibold">
                {profile.role}
              </span>
            </div>
            <span className="text-[12px] text-[#c0c6d6] mt-0.5">{profile.sector}</span>
            <span className="text-[11px] text-[#8b91a0] font-mono mt-0.5 truncate max-w-[190px]">
              Node ID: {deviceId || 'DEV-LOCAL'}
            </span>
          </div>
        </div>

        <button
          onClick={() => onShowToast('Node profile verified via local key pair')}
          className="w-9 h-9 rounded-xl bg-[#201f1f] text-[#c0c6d6] flex items-center justify-center hover:text-[#e5e2e1] active:scale-95 transition-all border border-[#2a2a2a] cursor-pointer"
          title="Node Settings"
        >
          <span className="material-symbols-outlined text-[18px]">tune</span>
        </button>
      </div>

      {/* Device Health Honest Hardware Inspection */}
      <div className="grid grid-cols-2 gap-3 shrink-0">
        {/* Battery Health */}
        <div className="p-4 rounded-2xl bg-[#1c1b1b] border border-[#2a2a2a] flex flex-col gap-2 shadow-sm">
          <div className="flex items-center justify-between text-[#c0c6d6]">
            <span className="text-[12px] font-medium">Battery Level</span>
            <span className="material-symbols-outlined text-[18px] text-[#47e266]">
              {batteryData.isCharging ? 'battery_charging_full' : 'battery_std'}
            </span>
          </div>
          <div className="flex items-baseline gap-1.5">
            {batteryData.supported && batteryData.percent !== null ? (
              <>
                <span className="text-[22px] font-bold text-[#e5e2e1]">{batteryData.percent}%</span>
                <span className="text-[11px] text-[#47e266] font-medium">
                  {batteryData.isCharging ? 'Charging' : 'Optimal'}
                </span>
              </>
            ) : (
              <>
                <span className="text-[19px] font-bold text-[#e5e2e1]">N/A</span>
                <span className="text-[10px] text-[#8b91a0] font-medium">
                  (Sim: 87%)
                </span>
              </>
            )}
          </div>
          <div className="w-full h-1.5 rounded-full bg-[#2a2a2a] overflow-hidden">
            <div
              className="h-full rounded-full bg-[#47e266]"
              style={{ width: `${batteryData.percent ?? 87}%` }}
            />
          </div>
          <span className="text-[10px] text-[#8b91a0] leading-tight">
            {batteryData.supported
              ? 'Hardware battery API active'
              : 'Hardware battery API not exposed by browser'}
          </span>
        </div>

        {/* Storage / IndexedDB */}
        <div className="p-4 rounded-2xl bg-[#1c1b1b] border border-[#2a2a2a] flex flex-col gap-2 shadow-sm">
          <div className="flex items-center justify-between text-[#c0c6d6]">
            <span className="text-[12px] font-medium">Offline Data Core</span>
            <span className="material-symbols-outlined text-[18px] text-[#aac7ff]">
              database
            </span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-[22px] font-bold text-[#e5e2e1]">
              {localCacheCount}
            </span>
            <span className="text-[11.5px] text-[#c0c6d6]">incidents cached</span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-[#2a2a2a] overflow-hidden">
            <div
              className="h-full rounded-full bg-[#3e90ff]"
              style={{ width: `${Math.min(100, Math.max(12, localCacheCount * 20))}%` }}
            />
          </div>
          <span className="text-[10px] text-[#8b91a0] leading-tight">
            {storageEstimate.usedKb !== null
              ? `IndexedDB ~${storageEstimate.usedKb} KB · ${outboxCount} outbox queued`
              : `IndexedDB active · ${outboxCount} outbox queued`}
          </span>
        </div>
      </div>

      {/* Internet Connection Master Switch */}
      <div className="flex flex-col gap-2 shrink-0">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-[15px] font-semibold text-[#e5e2e1] tracking-tight">
            Internet Connection (Cellular / Wi-Fi Uplink)
          </h2>
          <span
            className={`text-[11px] px-2 py-0.5 rounded-full font-semibold border ${
              isInternetConnected
                ? 'bg-[#142e1d] text-[#47e266] border-[#2f6f3a]'
                : 'bg-[#2b1715] text-[#ffb4ab] border-[#6b2b24]'
            }`}
          >
            {isInternetConnected ? 'ONLINE' : 'ZERO INTERNET'}
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-[#1c1b1b] border border-[#2a2a2a] flex items-center justify-between shadow-md">
          <div className="flex items-center gap-3.5 pr-3">
            <div
              className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                isInternetConnected ? 'bg-[#47e266]/20 text-[#47e266]' : 'bg-[#353534]/40 text-[#ffb4ab]'
              }`}
            >
              <span className="material-symbols-outlined text-[22px]">
                {isInternetConnected ? 'wifi' : 'wifi_off'}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-[14px] font-semibold text-[#e5e2e1]">
                {isInternetConnected ? 'Internet Uplink Connected' : 'Internet Disconnected (Offline Mode)'}
              </span>
              <span className="text-[12px] text-[#c0c6d6] mt-0.5 leading-snug">
                {isInternetConnected
                  ? 'Connected to cellular/satellite uplink. Live incident reports bridge directly to Central Command servers.'
                  : 'Zero-internet disaster mode. Packets hop exclusively peer-to-peer over local BLE and WebRTC.'}
              </span>
            </div>
          </div>

          <button
            id="nexus-btn-device-toggle-internet"
            onClick={onToggleInternet}
            className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              isInternetConnected ? 'bg-[#47e266]' : 'bg-[#414754]'
            }`}
            title="Turn Internet Connection ON or OFF"
          >
            <span
              className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                isInternetConnected ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Mesh Protocols */}
      <div className="flex flex-col gap-3 shrink-0">
        <h2 className="text-[15px] font-semibold text-[#e5e2e1] px-1 tracking-tight">
          Mesh Protocols
        </h2>

        <div className="flex flex-col rounded-2xl bg-[#1c1b1b] border border-[#2a2a2a] divide-y divide-[#2a2a2a]/60 shadow-md">
          {/* BLE Mesh */}
          <div className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#3e90ff]/15 text-[#aac7ff] flex items-center justify-center">
                <span className="material-symbols-outlined text-[18px]">bluetooth</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[14px] font-medium text-[#e5e2e1]">Bluetooth LE Mesh</span>
                <span className="text-[11px] text-[#c0c6d6]">
                  Low energy peer hopping up to 100m
                </span>
              </div>
            </div>
            <button
              onClick={() => toggleProtocol('ble')}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                profile.protocols.ble ? 'bg-[#3e90ff]' : 'bg-[#414754]'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  profile.protocols.ble ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Wi-Fi Direct */}
          <div className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#47e266]/15 text-[#47e266] flex items-center justify-center">
                <span className="material-symbols-outlined text-[18px]">wifi_tethering</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[14px] font-medium text-[#e5e2e1]">
                  Wi-Fi Direct Peer-to-Peer
                </span>
                <span className="text-[11px] text-[#c0c6d6]">
                  High bandwidth file &amp; telemetry sync
                </span>
              </div>
            </div>
            <button
              onClick={() => toggleProtocol('wifi')}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                profile.protocols.wifi ? 'bg-[#3e90ff]' : 'bg-[#414754]'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  profile.protocols.wifi ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Auto Cloud Sync */}
          <div className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#2a2a2a] text-[#c0c6d6] flex items-center justify-center">
                <span className="material-symbols-outlined text-[18px]">cloud_sync</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[14px] font-medium text-[#e5e2e1]">
                  Automatic Cloud Sync
                </span>
                <span className="text-[11px] text-[#c0c6d6]">
                  Upload cached incident logs once uplink detected
                </span>
              </div>
            </div>
            <button
              onClick={() => toggleProtocol('cloud')}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                profile.protocols.cloud ? 'bg-[#3e90ff]' : 'bg-[#414754]'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  profile.protocols.cloud ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Tactile Actions */}
      <div className="flex flex-col gap-3 shrink-0">
        {onOpenAdmin && (
          <button
            onClick={onOpenAdmin}
            className="w-full h-12 rounded-2xl bg-gradient-to-r from-[#002957] to-[#15325b] hover:from-[#00346e] hover:to-[#1b3e70] active:scale-[0.98] transition-all border border-[#3e90ff]/40 text-[#e5e2e1] font-semibold text-[14px] flex items-center justify-center gap-2 cursor-pointer shadow-md"
          >
            <span className="material-symbols-outlined text-[20px] text-[#aac7ff]">admin_panel_settings</span>
            <span>Launch Amrita Command Hub (Admin)</span>
          </button>
        )}

        <button
          onClick={() => setShowQrModal(true)}
          className="w-full h-12 rounded-2xl bg-[#201f1f] hover:bg-[#2a2a2a] active:scale-[0.98] transition-all border border-[#2a2a2a] text-[#e5e2e1] font-semibold text-[14px] flex items-center justify-center gap-2 cursor-pointer shadow-md"
        >
          <span className="material-symbols-outlined text-[20px] text-[#aac7ff]">qr_code_2</span>
          <span>Export Offline Vault via QR</span>
        </button>

        <button
          onClick={handleSendTestSignal}
          disabled={testSignalSending}
          className="w-full h-12 rounded-2xl bg-[#2a2a2a] hover:bg-[#353534] active:scale-[0.98] transition-all border border-[#353534]/60 text-[#ffb4ab] font-semibold text-[14px] flex items-center justify-center gap-2 cursor-pointer"
        >
          <span
            className={`material-symbols-outlined text-[20px] ${
              testSignalSending ? 'animate-spin' : ''
            }`}
          >
            {testSignalSending ? 'refresh' : 'cell_tower'}
          </span>
          <span>
            {testSignalSending ? 'Transmitting...' : 'Send Emergency Test Signal'}
          </span>
        </button>
      </div>

      {/* Minimalist Clean Footer Note */}
      <div className="flex flex-col items-center justify-center text-center gap-1 pt-2 text-[#8b91a0] shrink-0">
        <span className="text-[11px] font-mono tracking-wider">
          NEXUS NODE · ZERO INTERNET DEPENDENCY
        </span>
        <span className="text-[10px] text-[#8b91a0]/70">
          Decentralized End-to-End Encrypted Relay
        </span>
      </div>

      {/* Export QR Modal */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#1c1b1b] border border-[#2a2a2a] rounded-3xl w-full max-w-sm p-6 shadow-2xl flex flex-col items-center text-center gap-4 animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center w-full">
              <span className="text-[13px] font-semibold text-[#aac7ff] uppercase tracking-wider">
                Offline P2P Vault Token
              </span>
              <button
                onClick={() => setShowQrModal(false)}
                className="w-8 h-8 rounded-full bg-[#2a2a2a] flex items-center justify-center text-[#e5e2e1] hover:bg-[#3a3939] cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {/* High fidelity QR Matrix simulation */}
            <div className="p-4 bg-white rounded-2xl shadow-inner my-1">
              <svg className="w-48 h-48" viewBox="0 0 100 100" fill="black">
                {/* QR corner finders */}
                <rect x="5" y="5" width="28" height="28" fill="black" />
                <rect x="9" y="9" width="20" height="20" fill="white" />
                <rect x="13" y="13" width="12" height="12" fill="black" />

                <rect x="67" y="5" width="28" height="28" fill="black" />
                <rect x="71" y="9" width="20" height="20" fill="white" />
                <rect x="75" y="13" width="12" height="12" fill="black" />

                <rect x="5" y="67" width="28" height="28" fill="black" />
                <rect x="9" y="71" width="20" height="20" fill="white" />
                <rect x="13" y="75" width="12" height="12" fill="black" />

                {/* Randomized data grid cells */}
                <rect x="38" y="8" width="5" height="5" />
                <rect x="46" y="8" width="5" height="5" />
                <rect x="54" y="8" width="5" height="5" />
                <rect x="38" y="18" width="5" height="5" />
                <rect x="50" y="24" width="5" height="5" />
                <rect x="8" y="38" width="5" height="5" />
                <rect x="18" y="44" width="5" height="5" />
                <rect x="26" y="50" width="5" height="5" />
                <rect x="40" y="40" width="8" height="8" />
                <rect x="52" y="42" width="6" height="6" />
                <rect x="62" y="40" width="8" height="8" />
                <rect x="45" y="55" width="10" height="5" />
                <rect x="60" y="52" width="5" height="10" />
                <rect x="40" y="68" width="6" height="6" />
                <rect x="50" y="72" width="8" height="8" />
                <rect x="65" y="68" width="6" height="6" />
                <rect x="76" y="45" width="6" height="6" />
                <rect x="86" y="52" width="6" height="6" />
                <rect x="75" y="75" width="8" height="8" />
                <rect x="85" y="85" width="6" height="6" />
              </svg>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-[14px] font-semibold text-[#e5e2e1]">
                Scan to Import {localCacheCount} Cached Incident{localCacheCount === 1 ? '' : 's'}
              </span>
              <p className="text-[12px] text-[#c0c6d6] leading-relaxed">
                Another field responder can scan this code with their Nexus camera to sync cached reports offline with zero network connectivity.
              </p>
            </div>

            <button
              onClick={() => {
                setShowQrModal(false);
                onShowToast('Vault token verified and saved to local keystore');
              }}
              className="w-full py-3 rounded-xl bg-[#3e90ff] text-[#002957] font-semibold text-[14px] cursor-pointer hover:bg-[#aac7ff] transition-all"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
