import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import './futuristic.css';
import './console-simple.css';
import { App, bootstrap } from './App';
import { connectEvents } from './store';
import { DETACHED_STAGE_HASH, DetachedStage3D } from './features/Visualizer';
import { DETACHED_CONSOLE_HASH, DetachedConsole } from './features/LiveConsole';

connectEvents();
void bootstrap();
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {location.hash === DETACHED_STAGE_HASH ? <DetachedStage3D /> : location.hash === DETACHED_CONSOLE_HASH ? <DetachedConsole /> : <App />}
  </StrictMode>,
);
