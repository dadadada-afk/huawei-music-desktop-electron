import { useEffect, useState } from 'react';
import { Maximize2, Music2, Pause, Play, SkipBack, SkipForward, X } from 'lucide-react';
import type { PlayerSnapshot } from '../shared/types';

function clock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

// The total is unknown until the main window's audio element reports metadata, so a zero there means
// "not known yet" rather than a zero-length track.
function totalClock(seconds: number): string {
  return seconds > 0 ? clock(seconds) : '--:--';
}

// A frameless always-on-top strip. It owns no playback state: the main window broadcasts a
// snapshot and every control here is a command back, so both windows can never disagree.
export function MiniPlayer() {
  const [state, setState] = useState<PlayerSnapshot | null>(null);
  // Subscribe first, then ask: the main process may have broadcast before this window finished
  // loading, so a pull is the only way to guarantee the first snapshot is not missed.
  useEffect(() => {
    const unsubscribe = window.desktop.player.onState(setState);
    window.desktop.player.requestState();
    return unsubscribe;
  }, []);
  const playing = state?.playing ?? false;
  const duration = state?.duration ?? 0;
  const ratio = duration > 0 ? Math.min(1, (state?.position ?? 0) / duration) : 0;
  return <div className="mini">
    <div className="mini-grip" />
    <div className="mini-cover">
      {state?.coverUrl
        ? <img src={state.coverUrl} alt="" draggable={false} />
        : <Music2 size={18} />}
    </div>
    <div className="mini-body">
      <div className="mini-title" title={state?.title ?? ''}>{state?.title || '还没有播放'}</div>
      <div className="mini-artist" title={state?.artists ?? ''}>{state?.artists || '在华为音乐里选一首'}</div>
      <button
        className="mini-progress"
        aria-label="播放进度"
        onClick={event => {
          if (!duration) return;
          const box = event.currentTarget.getBoundingClientRect();
          const next = ((event.clientX - box.left) / box.width) * duration;
          window.desktop.player.seek(Math.max(0, Math.min(duration, next)));
        }}
      >
        <span style={{ width: `${ratio * 100}%` }} />
      </button>
      <div className="mini-time">{clock(state?.position ?? 0)} / {totalClock(duration)}</div>
    </div>
    <div className="mini-controls">
      <button aria-label="上一首" onClick={() => window.desktop.player.control('previous')}><SkipBack size={15} /></button>
      <button className="mini-main" aria-label={playing ? '暂停' : '播放'} onClick={() => window.desktop.player.control('play-pause')}>
        {playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
      </button>
      <button aria-label="下一首" onClick={() => window.desktop.player.control('next')}><SkipForward size={15} /></button>
      <button aria-label="回到主窗口" onClick={() => window.desktop.player.showMain()}><Maximize2 size={14} /></button>
      <button aria-label="关闭迷你播放器" onClick={() => void window.desktop.player.toggleAux('mini')}><X size={14} /></button>
    </div>
  </div>;
}
