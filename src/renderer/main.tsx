import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { App, bootstrap } from './App';
import { connectEvents } from './store';

connectEvents();
void bootstrap();
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
