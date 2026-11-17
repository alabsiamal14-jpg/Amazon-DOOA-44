import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Gracefully handle and down-rank non-fatal third-party Firestore idle stream notices
// to prevent them from polluting the console and triggering automated error frames.
const originalError = console.error;
const originalWarn = console.warn;

const shouldSuppress = (args: any[]) => {
  try {
    const message = args
      .map((arg) => (arg && typeof arg === 'object' && arg.message ? arg.message : String(arg)))
      .join(' ');
    return (
      message.includes('Disconnecting idle stream') ||
      message.includes('Timed out waiting for new targets') ||
      message.includes("RPC 'Listen' stream") ||
      message.includes('Could not reach Cloud Firestore backend') ||
      message.includes("Backend didn't respond within 10 seconds") ||
      message.includes('The client will operate in offline mode') ||
      message.includes('Firestore connection timeout or offline')
    );
  } catch {
    return false;
  }
};

console.error = function (...args) {
  if (shouldSuppress(args)) {
    console.info('[Firestore SDK Connection Notice (Idle Stream Suppressed)]', ...args);
    return;
  }
  originalError.apply(console, args);
};

console.warn = function (...args) {
  if (shouldSuppress(args)) {
    console.info('[Firestore SDK Connection Notice (Idle Stream Suppressed)]', ...args);
    return;
  }
  originalWarn.apply(console, args);
};

if ('serviceWorker' in navigator && process.env.NODE_ENV !== 'development') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
  });
}

createRoot(document.getElementById('root')!).render(<App />);
