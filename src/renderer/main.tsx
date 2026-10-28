import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { MiniPlayer } from './MiniPlayer';
import { LyricsWindow } from './LyricsWindow';
import './styles.css';
import './overlay.css';

// One HTML entry serves three windows: the main app plus the two always-on-top helpers, which the
// main process opens with a hash. Keeping a single entry avoids a second Vite build target.
const kind = window.location.hash.replace('#', '');
const root = createRoot(document.getElementById('root')!);
root.render(<React.StrictMode>
  {kind === 'mini' ? <MiniPlayer /> : kind === 'lyrics' ? <LyricsWindow /> : <App />}
</React.StrictMode>);
