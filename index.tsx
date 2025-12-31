
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

/**
 * Enhanced Polyfill for Trusted Types.
 * This ensures that strings assigned to sensitive DOM properties (like SVG attributes or innerHTML)
 * are accepted by the browser's security policy in restricted environments.
 */
const tt = (window as any).trustedTypes;
if (tt && tt.createPolicy) {
  try {
    if (!tt.defaultPolicy) {
      tt.createPolicy('default', {
        createHTML: (string: string) => string,
        createScript: (string: string) => string,
        createScriptURL: (string: string) => string,
      });
    }
  } catch (e) {
    console.warn("TrustedTypes policy could not be initialized:", e);
  }
}

// Global hook to wrap sensitive assignments if necessary (though React usually handles this)
if (typeof (window as any).TrustedHTML === 'undefined') {
  (window as any).TrustedHTML = class {
    private value: string;
    constructor(value: string) { this.value = value; }
    toString() { return this.value; }
  };
}

// Polyfill for crypto.randomUUID
if (typeof crypto === 'undefined') {
  (window as any).crypto = {};
}
if (!crypto.randomUUID) {
  (crypto as any).randomUUID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    }) as `${string}-${string}-${string}-${string}-${string}`;
  };
}

// Global Error Handler
window.addEventListener('error', (e) => {
  const banner = document.getElementById('startup-error');
  const msg = document.getElementById('error-message');
  const root = document.getElementById('root');
  if (banner && msg && root && !root.hasChildNodes()) {
    banner.style.display = 'block';
    msg.innerText = `Error: ${e.message}\n(Source: ${e.filename || 'unknown'})`;
  }
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
