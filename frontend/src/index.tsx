import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

// ResizeObserver loop 에러 완전 억제
window.addEventListener('error', (e) => {
  if (e.message === 'ResizeObserver loop completed with undelivered notifications.' ||
      e.message === 'ResizeObserver loop limit exceeded') {
    e.stopImmediatePropagation();
    e.stopPropagation();
    e.preventDefault();
    return false;
  }
});

// console.error도 필터링
const originalError = console.error;
console.error = (...args) => {
  if (typeof args[0] === 'string' && 
      (args[0].includes('ResizeObserver loop completed with undelivered notifications') ||
       args[0].includes('ResizeObserver loop limit exceeded'))) {
    return;
  }
  originalError.apply(console, args);
};

// ResizeObserver 패치
if (window.ResizeObserver) {
  const nativeResizeObserver = window.ResizeObserver;
  window.ResizeObserver = class ResizeObserver extends nativeResizeObserver {
    constructor(callback: ResizeObserverCallback) {
      super((entries, observer) => {
        requestAnimationFrame(() => {
          callback(entries, observer);
        });
      });
    }
  };
}

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);