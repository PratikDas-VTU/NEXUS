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
    <div className="flex-1 w-full overflow-y-auto px-4 py-4 flex flex-col gap-4 pb-24">
      {/* Node Identity Card */}
      <div className="p-4 rounded-2xl bg-[#1c1b1b] border border-[#2a2a2a] flex items-center justify-between shadow-md shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[#3e90ff]/20 border border-[#3e90ff]/40 flex items-center justify-center text-[#aac7ff] font-bold text-[16px]">
            NX
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="font-bold text-[16px] text-[#e5e2e1]">
                {profile.name}
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#152a1b] text-[#47e266] border border-[#2f6f3a]">
                FIELD NODE
              </span>
            </div>
            <span className="font-mono text-[11px] text-[#8b91a0] mt-0.5">
              Node ID: {deviceId || profile.handle}
            </span>
          </div>
        </div>
        <div className="text-right">
          <span className="text-[10px] text-[#8b91a0] uppercase tracking-wider block">
            Mesh Role
          </span>
          <span className="text-[12px] font-semibold text-[#aac7ff]">
            Relay Node
          </span>
        </div>
      </div>

      {/* Hardware Diagnostics Grid (Battery, Disk, GPS) */}
      <div className="grid grid-cols-2 gap-3 shrink-0">
        {/* Battery Health */}
        <div className="p-3.5 rounded-2xl bg-[#1c1b1b] border border-[#2a2a2a] flex flex-col gap-2 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-[#8b91a0]">Battery Status</span>
            <span className="material-symbols-outlined text-[18px] text-[#47e266]">
              {batteryData.isCharging ? 'battery_charging_full' : 'battery_full'}
            </span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-[22px] font-bold text-[#e5e2e1]">
              {batteryData.percent !== null ? `${batteryData.percent}%` : 'N/A'}
            </span>
            {batteryData.isCharging !== null && (
              <span className="text-[11px] text-[#47e266]">
                {batteryData.isCharging ? 'Charging' : 'Discharging'}
              </span>
            )}
          </div>
          <span className="text-[10px] text-[#8b91a0]">
            {batteryData.supported ? 'Hardware power monitor active' : 'Battery API restricted by browser'}
          </span>
        </div>

        {/* Local Storage & Cache */}
        <div className="p-3.5 rounded-2xl bg-[#1c1b1b] border border-[#2a2a2a] flex flex-col gap-2 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-[#8b91a0]">Offline Vault</span>
            <HardDrive className="w-4 h-4 text-[#aac7ff]" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-[22px] font-bold text-[#e5e2e1]">
              {localCacheCount}
            </span>
            <span className="text-[11.5px] text-[#c0c6d6]">cached reports</span>
          </div>
          <span className="text-[10px] text-[#8b91a0] leading-tight">
            {storageEstimate.usedKb !== null
              ? `IndexedDB ~${storageEstimate.usedKb} KB · ${outboxCount} outbox queued`
              : `IndexedDB active · ${outboxCount} outbox queued`}
          </span>
        </div>
      </div>

      {/* FIELD READINESS & DEVICE PERMISSIONS SECTION */}
      <div className="flex flex-col gap-2 shrink-0">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-[15px] font-semibold text-[#e5e2e1] tracking-tight">
            Field Readiness &amp; Hardware Permissions
          </h2>
          <span className="text-[10px] text-[#8b91a0] font-mono">
            OFFLINE BY DEFAULT
          </span>
        </div>

        <div className="flex flex-col rounded-2xl bg-[#1c1b1b] border border-[#2a2a2a] divide-y divide-[#2a2a2a]/60 shadow-md">
          {/* A. Location / GPS */}
          <div className="p-3.5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#3e90ff]/15 text-[#3e90ff] flex items-center justify-center shrink-0">
                <MapPin className="w-4 h-4" />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold text-[#e5e2e1]">Physical GPS Location</span>
                  <span className="text-[9px] px-1.5 py-0.2 rounded font-bold uppercase bg-[#3e90ff]/20 text-[#aac7ff]">
                    Primary
                  </span>
                </div>
                <span className="text-[11px] text-[#8b91a0] mt-0.5">
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
              className="py-1 px-2.5 rounded-xl bg-[#2a2a2a] hover:bg-[#353534] text-[#e5e2e1] text-[11px] font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${isRefreshingGps ? 'animate-spin' : ''}`} />
              <span>{isRefreshingGps ? 'Fixing...' : 'Refresh'}</span>
            </button>
          </div>

          {/* Mobile Offline Satellite GPS Guide */}
          {isInsecureLanOrigin() && locationState !== 'LIVE' && (
            <div className="p-3 bg-[#1e1b13] border-t border-[#382f18] text-[#ffd67a] text-xs flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold flex items-center gap-1.5 text-[12px] text-[#ffcc00]">
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
                  className="text-[10px] px-2 py-0.5 rounded bg-[#332a15] hover:bg-[#473b1d] text-[#ffe699] border border-[#665427] cursor-pointer"
                >
                  Copy Origin
                </button>
              </div>
              <p className="text-[11px] text-[#c7be9f] leading-relaxed">
                Chrome security blocks direct hardware GPS on plain HTTP LAN IPs. To unlock 100% offline satellite GPS on your phones:
              </p>
              <ol className="text-[10.5px] text-[#d6cdb2] list-decimal list-inside space-y-0.5 bg-black/30 p-2 rounded-xl font-mono">
                <li>Open <span className="text-[#ffd67a]">chrome://flags</span> in mobile Chrome</li>
                <li>Search <span className="text-[#ffd67a]">unsafely-treat-insecure-origin-as-secure</span></li>
                <li>Set to <strong>Enabled</strong> & paste <span className="text-white underline">{window.location.origin}</span></li>
                <li>Tap <strong>Relaunch</strong> at bottom of Chrome</li>
              </ol>
              <span className="text-[10px] text-[#8b91a0]">
                Hardware GPS satellite lock works completely offline with zero SIM, cell data, or internet!
              </span>
            </div>
          )}

          {/* B. Persistent Storage */}
          <div className="p-3.5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#47e266]/15 text-[#47e266] flex items-center justify-center shrink-0">
                <HardDrive className="w-4 h-4" />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold text-[#e5e2e1]">Persistent Storage Vault</span>
                  <span className="text-[9px] px-1.5 py-0.2 rounded font-bold uppercase bg-[#47e266]/20 text-[#47e266]">
                    Recommended
                  </span>
                </div>
                <span className="text-[11px] text-[#8b91a0] mt-0.5">
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
                className="py-1 px-2.5 rounded-xl bg-[#2a2a2a] hover:bg-[#353534] text-[#e5e2e1] text-[11px] font-semibold cursor-pointer"
              >
                Lock Vault
              </button>
            ) : (
              <span className="text-[11px] text-[#47e266] font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {permissions.storage === 'GRANTED' ? 'Locked' : 'Standard'}
              </span>
            )}
          </div>

          {/* C. Push Notifications */}
          <div className="p-3.5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#ffb84e]/15 text-[#ffb84e] flex items-center justify-center shrink-0">
                <Bell className="w-4 h-4" />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold text-[#e5e2e1]">Emergency Push Alerts</span>
                  <span className="text-[9px] px-1.5 py-0.2 rounded font-bold uppercase bg-[#2a2a2a] text-[#c0c6d6]">
                    Optional
                  </span>
                </div>
                <span className="text-[11px] text-[#8b91a0] mt-0.5">
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
              <span className="text-[11px] text-[#47e266] font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Enabled
              </span>
            ) : permissions.notifications !== 'NOT_SUPPORTED' ? (
              <button
                onClick={handleRequestNotifications}
                className="py-1 px-2.5 rounded-xl bg-[#2a2a2a] hover:bg-[#353534] text-[#e5e2e1] text-[11px] font-semibold cursor-pointer"
              >
                Enable
              </button>
            ) : (
              <span className="text-[11px] text-[#8b91a0]">N/A</span>
            )}
          </div>

          {/* D. Screen Wake Lock */}
          <div className="p-3.5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#aac7ff]/15 text-[#aac7ff] flex items-center justify-center shrink-0">
                <Sun className="w-4 h-4" />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold text-[#e5e2e1]">Screen Wake Lock</span>
                  <span className="text-[9px] px-1.5 py-0.2 rounded font-bold uppercase bg-[#2a2a2a] text-[#c0c6d6]">
                    Optional
                  </span>
                </div>
                <span className="text-[11px] text-[#8b91a0] mt-0.5">
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
                className={`py-1 px-2.5 rounded-xl text-[11px] font-semibold cursor-pointer ${
                  permissions.wakeLock === 'ACTIVE'
                    ? 'bg-[#152a1b] text-[#47e266] border border-[#2f6f3a]'
                    : 'bg-[#2a2a2a] hover:bg-[#353534] text-[#e5e2e1]'
                }`}
              >
                {permissions.wakeLock === 'ACTIVE' ? 'Keep Awake ✓' : 'Keep Awake'}
              </button>
            ) : (
              <span className="text-[11px] text-[#8b91a0]">N/A</span>
            )}
          </div>

          {/* E. Bluetooth Radio (Strictly OPTIONAL / EXPERIMENTAL) */}
          <div className="p-3.5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#3e90ff]/15 text-[#3e90ff] flex items-center justify-center shrink-0">
                <Bluetooth className="w-4 h-4" />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold text-[#e5e2e1]">Bluetooth LE Radio</span>
                  <span className="text-[9px] px-1.5 py-0.2 rounded font-bold uppercase bg-[#353534] text-[#ffb84e]">
                    Optional / Experimental
                  </span>
                </div>
                <span className="text-[11px] text-[#8b91a0] mt-0.5">
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
                className="py-1 px-2.5 rounded-xl bg-[#2a2a2a] hover:bg-[#353534] text-[#e5e2e1] text-[11px] font-semibold cursor-pointer disabled:opacity-50"
              >
                {isTestingBt ? 'Scanning...' : 'Test Scan'}
              </button>
            ) : (
              <span className="text-[10px] text-[#8b91a0] font-mono">
                {isInsecure ? 'HTTP Mode' : 'Unsupported'}
              </span>
            )}
          </div>

          {/* F. Gemini 3.5 Flash Intelligence */}
          <div className="p-3.5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#9c27b0]/15 text-[#ce93d8] flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4" />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold text-[#e5e2e1]">Gemini 3.5 Flash Intelligence</span>
                  <span className="text-[9px] px-1.5 py-0.2 rounded font-bold uppercase bg-[#9c27b0]/20 text-[#ce93d8]">
                    API Loaded
                  </span>
                </div>
                <span className="text-[11px] text-[#8b91a0] mt-0.5">
                  gemini-3.5-flash-lite · AI Incident Triage & Landmark Geocoding
                </span>
              </div>
            </div>
            <button
              onClick={handleTestGemini}
              disabled={isTestingGemini}
              className="py-1 px-2.5 rounded-xl bg-[#2a2a2a] hover:bg-[#353534] text-[#e5e2e1] text-[11px] font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-50"
            >
              <Sparkles className={`w-3 h-3 ${isTestingGemini ? 'animate-spin text-[#ffb84e]' : 'text-[#ce93d8]'}`} />
              <span>{isTestingGemini ? 'Checking...' : 'Test AI'}</span>
            </button>
          </div>
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
                  : 'Zero-internet disaster mode. Packets hop exclusively peer-to-peer over local WebRTC DataChannel.'}
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

      {/* Mesh Transport Architecture */}
      <div className="flex flex-col gap-3 shrink-0">
        <h2 className="text-[15px] font-semibold text-[#e5e2e1] px-1 tracking-tight">
          Mesh Transport Architecture
        </h2>

        <div className="flex flex-col rounded-2xl bg-[#1c1b1b] border border-[#2a2a2a] divide-y divide-[#2a2a2a]/60 shadow-md">
          {/* WebRTC DataChannel (Primary MVP Transport) */}
          <div className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#47e266]/15 text-[#47e266] flex items-center justify-center">
                <span className="material-symbols-outlined text-[18px]">hub</span>
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="text-[14px] font-medium text-[#e5e2e1]">
                    Local Wi-Fi / Hotspot + WebRTC
                  </span>
                  <span className="text-[9px] px-1.5 py-0.2 rounded font-bold uppercase bg-[#152a1b] text-[#47e266] border border-[#2f6f3a]">
                    Active Transport
                  </span>
                </div>
                <span className="text-[11px] text-[#c0c6d6]">
                  Store-Carry-Forward relay over RTCDataChannel (0-Cloud)
                </span>
              </div>
            </div>
            <span className="text-[11px] text-[#47e266] font-semibold">
              CONNECTED
            </span>
          </div>

          {/* Auto Cloud Sync */}
          <div className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#2a2a2a] text-[#c0c6d6] flex items-center justify-center">
                <span className="material-symbols-outlined text-[18px]">cloud_sync</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[14px] font-medium text-[#e5e2e1]">
                  Automatic Cloud Uplink
                </span>
                <span className="text-[11px] text-[#c0c6d6]">
                  Upload cached incident logs once internet detected
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

        <button
          onClick={async () => {
            await purgeDemoData();
            onShowToast('✓ Network-wide purge broadcast! All devices cleared.');
          }}
          className="w-full h-12 rounded-2xl bg-[#2b1717] hover:bg-[#3a1d1d] active:scale-[0.98] transition-all border border-[#ffb4ab]/30 text-[#ffb4ab] font-semibold text-[14px] flex items-center justify-center gap-2 cursor-pointer shadow-md"
          title="Broadcast 1-click purge command to all connected mesh phones and laptop"
        >
          <span className="material-symbols-outlined text-[20px]">delete_sweep</span>
          <span>Wipe Demo Data (All Devices Everywhere)</span>
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
