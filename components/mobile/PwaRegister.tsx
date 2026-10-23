'use client';

import { useEffect } from 'react';

/** Progressive enhancement: registration failure never prevents charting. */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    if (!window.isSecureContext) return;

    let disposed = false;
    const register = async () => {
      try {
        if (disposed) return;
        await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
          updateViaCache: 'none',
        });
      } catch {
        // No personal data, credentials or exception details are logged.
        console.warn('离线提示暂未启用，联网排盘仍可正常使用。');
      }
    };

    if (document.readyState === 'complete') void register();
    else window.addEventListener('load', register, { once: true });

    return () => {
      disposed = true;
      window.removeEventListener('load', register);
    };
  }, []);

  return null;
}

export default PwaRegister;
