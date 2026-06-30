import './index.css';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initTheme } from './renderer/theme';

initTheme();

const container = document.getElementById('root');
if (!container) throw new Error('Root container #root not found');
createRoot(container).render(<App />);
