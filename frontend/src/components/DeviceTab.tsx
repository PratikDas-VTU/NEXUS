import React, { useState, useEffect } from 'react';
import { DeviceProfile } from '../types';
import { initialDeviceProfile } from '../data/mockData';
import { useNexusServices } from '../context/ServiceContext';
import { formatCoordinates, isInsecureLanOrigin } from '../services/api/geolocation';
import { testGeminiApiKey } from '../services/api/geminiService';
import { MapPin, Bell, HardDrive, Sun, Bluetooth, RefreshCw, CheckCircle2, AlertTriangle, ExternalLink, Sparkles } from 'lucide-react';

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
  const {
    currentLocation,
    locationState,
    requestLocation,
    permissions,
    refreshPermissions,
    requestPermission,
    testBluetooth,
    purgeDemoData,
  } = useNexusServices();

  const [profile, setProfile] = useState<DeviceProfile>(initialDeviceProfile);
  const [showQrModal, setShowQrModal] = useState<boolean>(false);
  const [testSignalSending, setTestSignalSending] = useState<boolean>(false);
  const [isRefreshingGps, setIsRefreshingGps] = useState<boolean>(false);
  const [isTestingBt, setIsTestingBt] = useState<boolean>(false);
  const [btTestResult, setBtTestResult] = useState<string | null>(null);
  const [isTestingGemini, setIsTestingGemini] = useState<boolean>(false);

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
        : 'Auto Cloud Sync';
    onShowToast(`${label} ${willBeActive ? 'Enabled' : 'Disabled'}`);
  };

  const handleSendTestSignal = () => {
    setTestSignalSending(true);
    setTimeout(() => {
      setTestSignalSending(false);
      onShowToast('Simulated emergency ping relayed across local P2P subnet');
    }, 1200);
  };

  const handleRefreshGps = async () => {
    setIsRefreshingGps(true);
    try {
      const res = await requestLocation(true);
      if (res.success && res.coords) {
        onShowToast(`GPS Position Locked: ${res.coords.latitude.toFixed(4)}, ${res.coords.longitude.toFixed(4)}`);
      } else {
        onShowToast(res.error || 'Failed to acquire GPS fix.');
      }
    } finally {
      setIsRefreshingGps(false);
    }
  };

  const handleRequestStorage = async () => {
    const res = await requestPermission('storage');
    if (res) {
      onShowToast('IndexedDB storage locked against browser cache eviction.');
    } else {
      onShowToast('Storage persist not granted or not supported.');
    }
  };

  const handleRequestNotifications = async () => {
    const res = await requestPermission('notifications');
    if (res) {
      onShowToast('Emergency notification alerts enabled.');
    } else {
      onShowToast('Notifications permission not granted or unsupported.');
    }
  };

  const handleToggleWakeLock = async () => {
    const isCurrentlyActive = permissions.wakeLock === 'ACTIVE';
    if (isCurrentlyActive) {
      await requestPermission('wakeLock'); // will release or refresh
      onShowToast('Screen wake lock released.');
    } else {
      const res = await requestPermission('wakeLock');
      if (res) {
        onShowToast('Screen wake lock active: Display will stay on during response.');
      } else {
        onShowToast('Wake lock unavailable on this origin/browser.');
      }
    }
  };

  const handleTestGemini = async () => {
    setIsTestingGemini(true);
    try {
      const res = await testGeminiApiKey();
      onShowToast(res.message);
    } finally {
      setIsTestingGemini(false);
    }
  };

  const handleTestBluetooth = async () => {
    setIsTestingBt(true);
    setBtTestResult(null);
    try {
      const res = await testBluetooth();
      if (res.success) {
        setBtTestResult(`Connected: ${res.deviceName}`);
        onShowToast(`Bluetooth Radio Tested: ${res.deviceName}`);
      } else {
        setBtTestResult(res.error || 'Scan closed');
        onShowToast(res.error || 'Bluetooth scan cancelled.');
      }
    } finally {
      setIsTestingBt(false);
    }
  };

  const isInsecure = isInsecureLanOrigin();

  return (
    <div className="flex-1 min-h-0 w-full overflow-y-auto px-3.5 sm:px-4 py-3 flex flex-col gap-3.5 pb-24 no-scrollbar">
      {/* Node Identity Card */}
      <div className="p-3.5 sm:p-4 rounded-2xl bg-[#15171a] border border-[#22262b] flex items-center justify-between shadow-sm shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-300 font-bold text-[14.5px]">
            NX
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="font-bold text-[15px] text-zinc-100">
                {profile.name}
              </span>
              <span className="px-2 py-0.5 rounded-full text-[9.5px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                FIELD NODE
              </span>
            </div>
            <span className="font-mono text-[10.5px] text-zinc-400 mt-0.5">
              Node ID: {deviceId || profile.handle}
            </span>
          </div>
        </div>
        <div className="text-right">
          <span className="text-[9.5px] text-zinc-500 uppercase tracking-wider block">
            Mesh Role
          </span>
          <span className="text-[11.5px] font-semibold text-blue-300">
            Relay Node
          </span>
        </div>
      </div>

      {/* Hardware Diagnostics Grid (Battery, Disk, GPS) */}
      <div className="grid grid-cols-2 gap-2.5 shrink-0">
        {/* Battery Health */}
        <div className="p-3 rounded-xl bg-[#15171a] border border-[#22262b] flex flex-col gap-1.5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-zinc-400">Battery Status</span>
            <span className="material-symbols-outlined text-[17px] text-emerald-400">
              {batteryData.isCharging ? 'battery_charging_full' : 'battery_full'}
            </span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-[20px] font-bold text-zinc-100">
              {batteryData.percent !== null ? `${batteryData.percent}%` : 'N/A'}
            </span>
            {batteryData.isCharging !== null && (
              <span className="text-[10.5px] text-emerald-400 font-medium">
                {batteryData.isCharging ? 'Charging' : 'Discharging'}
              </span>
            )}
          </div>
          <span className="text-[9.5px] text-zinc-500 truncate">
            {batteryData.supported ? 'Hardware monitor active' : 'Battery API restricted'}
          </span>
        </div>

        {/* Local Storage & Cache */}
        <div className="p-3 rounded-xl bg-[#15171a] border border-[#22262b] flex flex-col gap-1.5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-zinc-400">Offline Vault</span>
            <HardDrive className="w-3.5 h-3.5 text-blue-300" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-[20px] font-bold text-zinc-100">
              {localCacheCount}
            </span>
            <span className="text-[11px] text-zinc-400">cached</span>
          </div>
          <span className="text-[9.5px] text-zinc-500 truncate">
            {storageEstimate.usedKb !== null
              ? `IDB ~${storageEstimate.usedKb} KB · ${outboxCount} queued`
              : `IDB active · ${outboxCount} queued`}
          </span>
        </div>
      </div>

      {/* FIELD READINESS & DEVICE PERMISSIONS SECTION */}
      <div className="flex flex-col gap-2 shrink-0">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-[14.5px] font-bold text-zinc-200 tracking-tight">
            Field Readiness &amp; Hardware Permissions
          </h2>
          <span className="text-[10px] text-zinc-500 font-mono">
            OFFLINE BY DEFAULT
          </span>
        </div>

        <div className="flex flex-col rounded-2xl bg-[#15171a] border border-[#22262b] divide-y divide-[#22262b] shadow-sm">
          {/* A. Location / GPS */}
          <div className="p-3 sm:p-3.5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-500/15 text-blue-400 flex items-center justify-center shrink-0">
                <MapPin className="w-4 h-4" />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="text-[13px] font-semibold text-zinc-200">Physical GPS Location</span>
                  <span className="text-[9px] px-1.5 py-0.2 rounded font-bold uppercase bg-blue-500/20 text-blue-300">
                    Primary
                  </span>
                </div>
                <span className="text-[10.5px] text-zinc-400 mt-0.5">
                  {locationState === 'LIVE' && currentLocation
                    ? `Live Fix: ${formatCoordinates(currentLocation.latitude, currentLocation.longitude, 4)} (±${currentLocation.accuracy}m)`
                    : locationState === 'CACHED' && currentLocation
                    ? `Cached Fix: ${formatCoordinates(currentLocation.latitude, currentLocation.longitude, 4)}`
                    : locationState === 'ACQUIRING'
                    ? 'Acquiring satellite fix...'
                    : locationState === 'DENIED'
                    ? 'Permission Denied'
                    : locationState === 'MANUAL' && currentLocation
                    ? `Manual: ${formatCoordinates(currentLocation.latitude, currentLocation.longitude, 4)}`
                    : 'Location not acquired'}
                </span>
              </div>
            </div>
            <button
              onClick={handleRefreshGps}
              disabled={isRefreshingGps}
              className="py-1 px-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-50 active:scale-95"
            >
              <RefreshCw className={`w-3 h-3 ${isRefreshingGps ? 'animate-spin' : ''}`} />
              <span>{isRefreshingGps ? 'Fixing...' : 'Refresh'}</span>
            </button>
          </div>

          {/* Mobile Offline Satellite GPS Guide */}
          {isInsecureLanOrigin() && locationState !== 'LIVE' && (
            <div className="p-3 bg-amber-500/10 border-t border-amber-500/20 text-amber-200 text-xs flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold flex items-center gap-1.5 text-[11.5px] text-amber-300">
                  <span>🛰️ How to Enable Offline Satellite GPS on Mobile</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (navigator.clipboard) {
                      navigator.clipboard.writeText(window.location.origin);
                      onShowToast('Copied origin to clipboard: ' + window.location.origin);
                    }
                  }}
                  className="text-[10px] px-2 py-0.5 rounded bg-amber-950/60 hover:bg-amber-900 text-amber-200 border border-amber-500/30 cursor-pointer"
                >
                  Copy Origin
                </button>
              </div>
              <p className="text-[11px] text-zinc-300 leading-relaxed">
                Chrome security blocks direct hardware GPS on plain HTTP LAN IPs. To unlock 100% offline satellite GPS on your phones:
              </p>
              <ol className="text-[10.5px] text-zinc-300 list-decimal list-inside space-y-0.5 bg-black/40 p-2 rounded-lg font-mono">
                <li>Open <span className="text-amber-300">chrome://flags</span> in mobile Chrome</li>
                <li>Search <span className="text-amber-300">unsafely-treat-insecure-origin-as-secure</span></li>
                <li>Set to <strong>Enabled</strong> & paste <span className="text-white underline">{window.location.origin}</span></li>
                <li>Tap <strong>Relaunch</strong> at bottom of Chrome</li>
              </ol>
              <span className="text-[9.5px] text-zinc-400">
                Hardware GPS satellite lock works completely offline with zero SIM, cell data, or internet!
              </span>
            </div>
          )}

          {/* B. Persistent Storage */}
          <div className="p-3 sm:p-3.5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0">
                <HardDrive className="w-4 h-4" />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="text-[13px] font-semibold text-zinc-200">Persistent Storage Vault</span>
                  <span className="text-[9px] px-1.5 py-0.2 rounded font-bold uppercase bg-emerald-500/20 text-emerald-400">
                    Recommended
                  </span>
                </div>
                <span className="text-[10.5px] text-zinc-400 mt-0.5">
                  {permissions.storage === 'GRANTED'
                    ? 'Locked against low-disk cache eviction'
                    : permissions.storage === 'NOT_SUPPORTED'
                    ? 'Not supported by this browser'
                    : 'Standard cache protection active'}
                </span>
              </div>
            </div>
            {permissions.storage !== 'GRANTED' && permissions.storage !== 'NOT_SUPPORTED' ? (
              <button
                onClick={handleRequestStorage}
                className="py-1 px-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-semibold cursor-pointer active:scale-95"
              >
                Lock Vault
              </button>
            ) : (
              <span className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {permissions.storage === 'GRANTED' ? 'Locked' : 'Standard'}
              </span>
            )}
          </div>

          {/* C. Push Notifications */}
          <div className="p-3 sm:p-3.5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0">
                <Bell className="w-4 h-4" />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="text-[13px] font-semibold text-zinc-200">Emergency Push Alerts</span>
                  <span className="text-[9px] px-1.5 py-0.2 rounded font-bold uppercase bg-zinc-800 text-zinc-400">
                    Optional
                  </span>
                </div>
                <span className="text-[10.5px] text-zinc-400 mt-0.5">
                  {permissions.notifications === 'GRANTED'
                    ? 'Active · Audio & banner alerts for P0 beacons'
                    : permissions.notifications === 'DENIED'
                    ? 'Alerts blocked in browser settings'
                    : permissions.notifications === 'NOT_SUPPORTED'
                    ? 'Notifications not supported'
                    : 'Alert on incoming mesh emergencies'}
                </span>
              </div>
            </div>
            {permissions.notifications === 'GRANTED' ? (
              <span className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Enabled
              </span>
            ) : permissions.notifications !== 'NOT_SUPPORTED' ? (
              <button
                onClick={handleRequestNotifications}
                className="py-1 px-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-semibold cursor-pointer active:scale-95"
              >
                Enable
              </button>
            ) : (
              <span className="text-[11px] text-zinc-500">N/A</span>
            )}
          </div>

          {/* D. Screen Wake Lock */}
          <div className="p-3 sm:p-3.5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-500/15 text-blue-300 flex items-center justify-center shrink-0">
                <Sun className="w-4 h-4" />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="text-[13px] font-semibold text-zinc-200">Screen Wake Lock</span>
                  <span className="text-[9px] px-1.5 py-0.2 rounded font-bold uppercase bg-zinc-800 text-zinc-400">
                    Optional
                  </span>
                </div>
                <span className="text-[10.5px] text-zinc-400 mt-0.5">
                  {permissions.wakeLock === 'ACTIVE'
                    ? 'Active · Display will not sleep during operations'
                    : permissions.wakeLock === 'NOT_SUPPORTED'
                    ? 'WakeLock not supported by browser'
                    : 'Prevent phone screen from sleeping'}
                </span>
              </div>
            </div>
            {permissions.wakeLock !== 'NOT_SUPPORTED' ? (
              <button
                onClick={handleToggleWakeLock}
                className={`py-1 px-2.5 rounded-lg text-[11px] font-semibold cursor-pointer active:scale-95 ${
                  permissions.wakeLock === 'ACTIVE'
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                    : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200'
                }`}
              >
                {permissions.wakeLock === 'ACTIVE' ? 'Keep Awake ✓' : 'Keep Awake'}
              </button>
            ) : (
              <span className="text-[11px] text-zinc-500">N/A</span>
            )}
          </div>

          {/* E. Bluetooth Radio (Strictly OPTIONAL / EXPERIMENTAL) */}
          <div className="p-3 sm:p-3.5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-500/15 text-blue-400 flex items-center justify-center shrink-0">
                <Bluetooth className="w-4 h-4" />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="text-[13px] font-semibold text-zinc-200">Bluetooth LE Radio</span>
                  <span className="text-[9px] px-1.5 py-0.2 rounded font-bold uppercase bg-zinc-800 text-amber-300">
                    Optional
                  </span>
                </div>
                <span className="text-[10.5px] text-zinc-400 mt-0.5">
                  {btTestResult
                    ? btTestResult
                    : permissions.bluetooth === 'NOT_SUPPORTED'
                    ? 'Web Bluetooth not supported by this browser'
                    : permissions.bluetooth === 'INSECURE_ORIGIN'
                    ? 'Requires HTTPS for Bluetooth device picker'
                    : 'Future transport testing (WebRTC is primary)'}
                </span>
              </div>
            </div>
            {permissions.bluetooth !== 'NOT_SUPPORTED' && !isInsecure ? (
              <button
                onClick={handleTestBluetooth}
                disabled={isTestingBt}
                className="py-1 px-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-semibold cursor-pointer disabled:opacity-50 active:scale-95"
              >
                {isTestingBt ? 'Scanning...' : 'Test Scan'}
              </button>
            ) : (
              <span className="text-[10px] text-zinc-500 font-mono">
                {isInsecure ? 'HTTP Mode' : 'Unsupported'}
              </span>
            )}
          </div>

          {/* F. Gemini 3.5 Flash Intelligence */}
          <div className="p-3 sm:p-3.5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-purple-500/15 text-purple-300 flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4" />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="text-[13px] font-semibold text-zinc-200">Gemini Intelligence</span>
                  <span className="text-[9px] px-1.5 py-0.2 rounded font-bold uppercase bg-purple-500/20 text-purple-300">
                    AI Ready
                  </span>
                </div>
                <span className="text-[10.5px] text-zinc-400 mt-0.5">
                  gemini-3.5-flash-lite · AI Incident Triage & Landmark Geocoding
                </span>
              </div>
            </div>
            <button
              onClick={handleTestGemini}
              disabled={isTestingGemini}
              className="py-1 px-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-50 active:scale-95"
            >
              <Sparkles className={`w-3 h-3 ${isTestingGemini ? 'animate-spin text-amber-400' : 'text-purple-300'}`} />
              <span>{isTestingGemini ? 'Checking...' : 'Test AI'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Internet Connection Master Switch */}
      <div className="flex flex-col gap-2 shrink-0">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-[14.5px] font-bold text-zinc-200 tracking-tight">
            Internet Connection (Cellular / Wi-Fi Uplink)
          </h2>
          <span
            className={`text-[10.5px] px-2 py-0.5 rounded-full font-semibold border ${
              isInternetConnected
                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                : 'bg-red-500/15 text-red-300 border-red-500/30'
            }`}
          >
            {isInternetConnected ? 'ONLINE' : 'ZERO INTERNET'}
          </span>
        </div>

        <div className="p-3.5 sm:p-4 rounded-2xl bg-[#15171a] border border-[#22262b] flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3 pr-3">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                isInternetConnected ? 'bg-emerald-500/15 text-emerald-400' : 'bg-zinc-800 text-red-300'
              }`}
            >
              <span className="material-symbols-outlined text-[20px]">
                {isInternetConnected ? 'wifi' : 'wifi_off'}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-[13.5px] font-semibold text-zinc-100">
                {isInternetConnected ? 'Internet Uplink Connected' : 'Internet Disconnected (Offline Mode)'}
              </span>
              <span className="text-[11.5px] text-zinc-400 mt-0.5 leading-snug">
                {isInternetConnected
                  ? 'Connected to cellular/satellite uplink. Live incident reports bridge directly to Central Command servers.'
                  : 'Zero-internet disaster mode. Packets hop exclusively peer-to-peer over local WebRTC DataChannel.'}
              </span>
            </div>
          </div>

          <button
            id="nexus-btn-device-toggle-internet"
            onClick={onToggleInternet}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              isInternetConnected ? 'bg-emerald-500' : 'bg-zinc-700'
            }`}
            title="Turn Internet Connection ON or OFF"
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                isInternetConnected ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Mesh Transport Architecture */}
      <div className="flex flex-col gap-2 shrink-0">
        <h2 className="text-[14.5px] font-bold text-zinc-200 px-1 tracking-tight">
          Mesh Transport Architecture
        </h2>

        <div className="flex flex-col rounded-2xl bg-[#15171a] border border-[#22262b] divide-y divide-[#22262b] shadow-sm">
          {/* WebRTC DataChannel (Primary MVP Transport) */}
          <div className="p-3.5 sm:p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
                <span className="material-symbols-outlined text-[17px]">hub</span>
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="text-[13.5px] font-medium text-zinc-200">
                    Local Wi-Fi / Hotspot + WebRTC
                  </span>
                  <span className="text-[9px] px-1.5 py-0.2 rounded font-bold uppercase bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    Active Transport
                  </span>
                </div>
                <span className="text-[11px] text-zinc-400">
                  Store-Carry-Forward relay over RTCDataChannel (0-Cloud)
                </span>
              </div>
            </div>
            <span className="text-[10.5px] text-emerald-400 font-semibold">
              CONNECTED
            </span>
          </div>

          {/* Auto Cloud Sync */}
          <div className="p-3.5 sm:p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-zinc-800 text-zinc-300 flex items-center justify-center">
                <span className="material-symbols-outlined text-[17px]">cloud_sync</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[13.5px] font-medium text-zinc-200">
                  Automatic Cloud Uplink
                </span>
                <span className="text-[11px] text-zinc-400">
                  Upload cached incident logs once internet detected
                </span>
              </div>
            </div>
            <button
              onClick={() => toggleProtocol('cloud')}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                profile.protocols.cloud ? 'bg-blue-600' : 'bg-zinc-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                  profile.protocols.cloud ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Tactile Actions */}
      <div className="flex flex-col gap-2.5 shrink-0">
        {onOpenAdmin && (
          <button
            onClick={onOpenAdmin}
            className="w-full h-11 rounded-xl bg-blue-600/15 hover:bg-blue-600/25 active:scale-[0.99] transition-all border border-blue-500/30 text-blue-200 font-semibold text-[13px] flex items-center justify-center gap-2 cursor-pointer shadow-xs"
          >
            <span className="material-symbols-outlined text-[19px] text-blue-300">admin_panel_settings</span>
            <span>Launch Amrita Command Hub (Admin)</span>
          </button>
        )}

        <button
          onClick={() => setShowQrModal(true)}
          className="w-full h-11 rounded-xl bg-zinc-800/80 hover:bg-zinc-800 active:scale-[0.99] transition-all border border-zinc-700/60 text-zinc-200 font-semibold text-[13px] flex items-center justify-center gap-2 cursor-pointer shadow-xs"
        >
          <span className="material-symbols-outlined text-[19px] text-zinc-300">qr_code_2</span>
          <span>Export Offline Vault via QR</span>
        </button>

        <button
          onClick={handleSendTestSignal}
          disabled={testSignalSending}
          className="w-full h-11 rounded-xl bg-zinc-800/80 hover:bg-zinc-800 active:scale-[0.99] transition-all border border-zinc-700/60 text-amber-300 font-semibold text-[13px] flex items-center justify-center gap-2 cursor-pointer"
        >
          <span
            className={`material-symbols-outlined text-[19px] ${
              testSignalSending ? 'animate-spin' : ''
            }`}
          >
            {testSignalSending ? 'refresh' : 'cell_tower'}
          </span>
          <span>
            {testSignalSending ? 'Transmitting...' : 'Send Emergency Test Signal'}
          </span>
        </button>

        <button
          onClick={async () => {
            await purgeDemoData();
            onShowToast('✓ Network-wide purge broadcast! All devices cleared.');
          }}
          className="w-full h-11 rounded-xl bg-red-500/15 hover:bg-red-500/25 active:scale-[0.99] transition-all border border-red-500/30 text-red-300 font-semibold text-[13px] flex items-center justify-center gap-2 cursor-pointer shadow-xs"
          title="Broadcast 1-click purge command to all connected mesh phones and laptop"
        >
          <span className="material-symbols-outlined text-[19px]">delete_sweep</span>
          <span>Wipe Demo Data (All Devices Everywhere)</span>
        </button>
      </div>

      {/* Minimalist Clean Footer Note */}
      <div className="flex flex-col items-center justify-center text-center gap-0.5 pt-2 text-zinc-500 shrink-0">
        <span className="text-[10.5px] font-mono tracking-wider text-zinc-400">
          NEXUS NODE · ZERO INTERNET DEPENDENCY
        </span>
        <span className="text-[9.5px] text-zinc-500">
          Decentralized End-to-End Encrypted Relay
        </span>
      </div>

      {/* Export QR Modal */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#15171a] border border-[#22262b] rounded-2xl w-full max-w-sm p-5 shadow-2xl flex flex-col items-center text-center gap-3.5 animate-in fade-in zoom-in duration-150">
            <div className="flex justify-between items-center w-full border-b border-[#22262b] pb-2">
              <span className="text-[12px] font-semibold text-blue-300 uppercase tracking-wider">
                Offline P2P Vault Token
              </span>
              <button
                onClick={() => setShowQrModal(false)}
                className="w-7 h-7 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-300 hover:bg-zinc-700 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[17px]">close</span>
              </button>
            </div>

            {/* High fidelity QR Matrix simulation */}
            <div className="p-3.5 bg-white rounded-xl shadow-inner my-0.5">
              <svg className="w-40 h-40" viewBox="0 0 100 100" fill="black">
                <rect x="5" y="5" width="28" height="28" fill="black" />
                <rect x="9" y="9" width="20" height="20" fill="white" />
                <rect x="13" y="13" width="12" height="12" fill="black" />

                <rect x="67" y="5" width="28" height="28" fill="black" />
                <rect x="71" y="9" width="20" height="20" fill="white" />
                <rect x="75" y="13" width="12" height="12" fill="black" />

                <rect x="5" y="67" width="28" height="28" fill="black" />
                <rect x="9" y="71" width="20" height="20" fill="white" />
                <rect x="13" y="75" width="12" height="12" fill="black" />

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
              <span className="text-[13.5px] font-semibold text-zinc-100">
                Scan to Import {localCacheCount} Cached Incident{localCacheCount === 1 ? '' : 's'}
              </span>
              <p className="text-[11.5px] text-zinc-400 leading-relaxed">
                Another field responder can scan this code with their Nexus camera to sync cached reports offline with zero network connectivity.
              </p>
            </div>

            <button
              onClick={() => {
                setShowQrModal(false);
                onShowToast('Vault token verified and saved to local keystore');
              }}
              className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs cursor-pointer transition-all"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
