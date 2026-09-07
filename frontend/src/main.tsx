import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Mark native Capacitor container for hardware safe area insets
if (typeof window !== 'undefined') {
  const isCapacitorNative = Boolean(
    (window as any).Capacitor?.isNativePlatform?.() ||
    (window as any).Capacitor?.platform === 'android' ||
    (window as any).Capacitor?.platform === 'ios' ||
    (window.location.hostname === 'localhost' && /Android/i.test(navigator.userAgent))
  );
  if (isCapacitorNative) {
    document.documentElement.classList.add('capacitor-native');
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
