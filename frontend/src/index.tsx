// frontend/src/index.tsx

import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';


const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

// 개발 환경에서 WebSocket 중복 연결 방지를 위해 StrictMode 제거
// 프로덕션에서는 다시 활성화하는 것을 권장
root.render(
  // <React.StrictMode>
    <App />
  // </React.StrictMode>
);

// 또는 조건부로 StrictMode 적용
/*
const isDevelopment = process.env.NODE_ENV === 'development';

root.render(
  isDevelopment ? (
    <App />
  ) : (
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
);
*/