import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import TillApp from './TillApp';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TillApp />
  </StrictMode>,
);
