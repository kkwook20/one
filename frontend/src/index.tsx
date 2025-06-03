// index.tsx 전체 내용
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App'; // .tsx 확장자 제거

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);