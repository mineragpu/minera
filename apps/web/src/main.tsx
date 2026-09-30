import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import './styles/base.css';
import './styles/reveal.css';
import './styles/scrub.css';
import { App } from './App.tsx';
import { startMotion } from './motion/startMotion.ts';

const container = document.getElementById('root');
if (!container) throw new Error('index.html is missing the #root element');

startMotion();
createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
