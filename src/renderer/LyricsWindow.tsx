import { useEffect, useState } from 'react';
import { Heart, Lock, LockOpen, Minus, Pause, Play, Plus, SkipBack, SkipForward, X } from 'lucide-react';
import type { LyricsAppearance, PlayerSnapshot } from '../shared/types';
import { useWindowDrag } from './useWindowDrag';
import { fillGradient, lineFill } from '../lyrics-progress.mjs';

// Three lines: the one just sung, the one being sung and the next one. The past line is what makes
// "already sung" readable at a glance — with only current+next on screen the highlight had nothing
// to be a highlight against. Frameless and always on top so it stays readable over other windows.
export function LyricsWindow() {
  const [state, setState] = useState<PlayerSnapshot | null>(null);
  const [look, setLook] = useState<LyricsAppearance>({ opacity: 1, locked: false, fontSize: 30, color: '#ffe9eb' });
  // The whole strip drags. A locked overlay is click-through, so its mousedown never arrives anyway.
  const onDragStart = useWindowDrag();
  // Subscribe first, then ask: the main process may have broadcast before this window finished
  // loading, so a pull is the only way to guarantee the first snapshot is not missed.
  useEffect(() => {
    const unsubscribe = window.desktop.player.onState(setState);
    window.desktop.player.requestState();
    return unsubscribe;
  }, []);
  // The main window and the tray can change these too, so the toolbar follows the applied state
  // instead of tracking its own copy of it.
  useEffect(() => window.desktop.player.onLyricsAppearance(setLook), []);

  const lines = state?.lyrics ?? [];
  const index = state?.lyricIndex ?? -1;
  const lineAt = (at: number) => (at >= 0 && at < lines.length ? lines[at] : null);
  const current = lineAt(index);
  const previous = lineAt(index - 1)?.text ?? '';
  const next = lineAt(index + 1)?.text ?? '';
  // The line is assumed over when the next one starts; the last line gets a fixed four seconds.
  const start = lines[index]?.timeMs ?? null;
  const following = lines[index + 1]?.timeMs ?? null;
  const bounds = { start, end: following ?? (start === null ? 0 : start + 4000) };
  const positionMs = (state?.position ?? 0) * 1000;
  const fills = current && bounds.start !== null
    ? lineFill(current, bounds.start, bounds.end, positionMs)
    : [];
  // Unsung glyphs stay well above the neighbour lines' 0.5 alpha: the sung line has to read as the
  // brightest row on screen even when the playhead is still on its first syllable.
  const gradient = fillGradient(fills, look.color, 'rgba(255, 255, 255, 0.72)');
  const apply = (patch: Partial<LyricsAppearance>) => {
    void window.desktop.player.setLyricsAppearance(patch);
  };
  const resize = (delta: number) => apply({ fontSize: look.fontSize + delta });
  const command = (value: 'play-pause' | 'next' | 'previous' | 'toggle-favorite') =>
    window.desktop.player.control(value);
  return <div className={`dlyric ${look.locked ? 'locked' : ''}`}
    onMouseDown={onDragStart}
    style={{ '--dlyric-size': `${look.fontSize}px`, '--dlyric-color': look.color } as React.CSSProperties}>
    <div className="dlyric-bar">
      <span className="dlyric-grip" aria-hidden="true" />
      <span className="dlyric-track">{state?.title || '桌面歌词'}</span>
      <button aria-label="缩小歌词字号" title="缩小字号" onClick={() => resize(-2)}><Minus size={13} /></button>
      <button aria-label="放大歌词字号" title="放大字号" onClick={() => resize(2)}><Plus size={13} /></button>
      <input className="dlyric-opacity" type="range" min="0.3" max="1" step="0.05"
        aria-label="桌面歌词透明度" title={`透明度 ${Math.round(look.opacity * 100)}%`}
        value={look.opacity}
        onChange={event => apply({ opacity: Number(event.target.value) })} />
      <button aria-label={look.locked ? '解锁桌面歌词' : '锁定桌面歌词（鼠标穿透）'}
        title={look.locked ? '已锁定：鼠标穿透，可按 Ctrl+Alt+L 或从托盘解锁' : '锁定：鼠标穿透，不挡桌面操作（Ctrl+Alt+L）'}
        onClick={() => apply({ locked: !look.locked })}>
        {look.locked ? <Lock size={13} /> : <LockOpen size={13} />}
      </button>
      <button aria-label="关闭桌面歌词" title="关闭" onClick={() => void window.desktop.player.toggleAux('lyrics')}><X size={13} /></button>
    </div>
    <div className="dlyric-prev" key={`p${index}`}>{previous}</div>
    <div className="dlyric-current"
      style={gradient
        ? {
          backgroundImage: gradient, WebkitBackgroundClip: 'text', backgroundClip: 'text',
          color: 'transparent', WebkitTextFillColor: 'transparent',
          // The four-way outline and shadow exist to keep the fill-readable colour legible over any
          // desktop; with a transparent fill they paint the glyphs solid black instead, so the karaoke
          // row keeps only a soft drop shadow for contrast.
          // A stroke hugs the outline, so the gradient inside the glyphs survives. Text-shadow and
          // filter: drop-shadow both paint copies of the whole glyph, which is why the row used to
          // come out solid black once the fill went transparent.
          WebkitTextStroke: '0.8px rgba(0, 0, 0, 0.8)',
          textShadow: 'none',
          filter: 'none',
        }
        : undefined}>
      {current?.text || (state?.title ? '这首歌没有歌词' : '还没有播放')}
    </div>
    <div className="dlyric-next" key={`n${index}`}>{next}</div>
    {/* Transport lives at the bottom edge so the tool buttons above stay about appearance. */}
    <div className="dlyric-controls">
      <button aria-label="上一首" title="上一首" onClick={() => command('previous')}><SkipBack size={14} /></button>
      <button aria-label={state?.playing ? '暂停' : '播放'} title={state?.playing ? '暂停' : '播放'}
        onClick={() => command('play-pause')}>
        {state?.playing ? <Pause size={15} /> : <Play size={15} />}
      </button>
      <button aria-label="下一首" title="下一首" onClick={() => command('next')}><SkipForward size={14} /></button>
      <button className={state?.favorited ? 'on' : ''} aria-label={state?.favorited ? '取消收藏' : '收藏'}
        title={state?.favorited ? '取消收藏' : '收藏'} onClick={() => command('toggle-favorite')}>
        <Heart size={14} fill={state?.favorited ? 'currentColor' : 'none'} />
      </button>
    </div>
  </div>;
}
