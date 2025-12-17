import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Polyfill for crypto.randomUUID
// This is required because crypto.randomUUID is only available in Secure Contexts (HTTPS/localhost).
// When opening dist/index.html via file:// or plain http://, it might be undefined, causing a crash.
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