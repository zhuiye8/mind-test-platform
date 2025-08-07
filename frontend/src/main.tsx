import '@ant-design/v5-patch-for-react-19';
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// 条件性使用StrictMode - 只在明确需要调试时启用
const isDev = import.meta.env.DEV;
const enableStrictMode = isDev && localStorage.getItem('enable_strict_mode') === 'true';

createRoot(document.getElementById('root')!).render(
  enableStrictMode ? (
    <StrictMode>
      <App />
    </StrictMode>
  ) : (
    <App />
  ),
)
