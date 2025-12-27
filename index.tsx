
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Polyfill for Trusted Types to prevent "This document requires 'TrustedHTML' assignment" error
// This is often triggered by browser extensions or strict CSPs in environments like AI Studio.
// Added type casting to (window as any) to resolve TypeScript property missing errors
if ((window as any).trustedTypes && (window as any).trustedTypes.createPolicy) {
  try {
    (window as any).trustedTypes.createPolicy('default', {
      createHTML: (string: string) => string,
      createScript: (string: string) => string,
      createScriptURL: (string: string) => string,
    });
  } catch (e) {
    console.warn("TrustedTypes policy could not be created:", e);
  }
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
