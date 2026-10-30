import { useEffect, useState } from 'react';
import { Heart, Lock, LockOpen, Minus, Pause, Play, Plus, SkipBack, SkipForward, X } from 'lucide-react';
import type { LyricsAppearance, PlayerSnapshot } from '../shared/types';
import { useWindowDrag } from './useWindowDrag';
import { fillGradient, lineFill } from '../lyrics-progress.mjs';
import { applyAppearance, applyThemeAttribute, syncAppearanceFromSettings } from './appearance';

// Three lines: the one just sung, the one being sung and the next one. The past line is what makes
// "already sung" readable at a glance — with only current+next on screen the highlight had nothing
// to be a highlight against. Frameless and always on top so it stays readable over other windows.
export function LyricsWindow() {
  const [state, setState] = useState<PlayerSnapshot | null>(null);
  const [look, setLook] = useState<LyricsAppearance>({ opacity: 1, locked: false, fontSize: 30, color: '#ffe9eb', pendingColor: '#c8c8cf', align: 'center', transition: 'slide' });
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
  // Same reason as the mini player: a separate document means its own :root, so the accent has to
  // be pulled once here or the toolbar keeps the stylesheet's default red.
  useEffect(() => { void syncAppearanceFromSettings(); }, []);
  useEffect(() => window.desktop.player.onAppearance(state => {
    applyThemeAttribute(state.theme);
    applyAppearance(state.appearance);
  }), []);

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
  // The stage's correction arrives with the snapshot. Filling against the raw position is what made
  // the overlay run at its own speed whenever the user dialled one in on the stage.
  const positionMs = ((state?.position ?? 0) + (state?.lyricOffset ?? 0)) * 1000;
  const fills = current && bounds.start !== null
    ? lineFill(current, bounds.start, bounds.end, positionMs)
    : [];
  // Unsung glyphs stay well above the neighbour lines' 0.5 alpha: the sung line has to read as the
  // brightest row on screen even when the playhead is still on its first syllable.
  const gradient = fillGradient(fills, look.color, look.pendingColor);
  const lineText = current?.text || (state?.title ? '这首歌没有歌词' : '还没有播放');
  const apply = (patch: Partial<LyricsAppearance>) => {
    void window.desktop.player.setLyricsAppearance(patch);
  };
  const resize = (delta: number) => apply({ fontSize: look.fontSize + delta });
  // The main window owns the correction — it has to fold it into the snapshot every window reads —
  // so the overlay only sends the nudge and displays whatever value comes back.
  const offsetSeconds = state?.lyricOffset ?? 0;
  const nudge = (delta: number) => window.desktop.player.adjustLyricOffset(delta);
  const command = (value: 'play-pause' | 'next' | 'previous' | 'toggle-favorite') =>
    window.desktop.player.control(value);
  // data-align / data-transition drive the layout and the entrance animation from CSS, so switching
  // either never has to re-render the line itself.
  return <div className={`dlyric ${look.locked ? 'locked' : ''}`}
    data-align={look.align}
    data-transition={look.transition}
    onMouseDown={onDragStart}
    style={{ '--dlyric-size': `${look.fontSize}px`, '--dlyric-color': look.color } as React.CSSProperties}>
    <div className="dlyric-bar">
      <span className="dlyric-grip" aria-hidden="true" />
      <span className="dlyric-track">{state?.title || '桌面歌词'}</span>
      <button aria-label="缩小歌词字号" title="缩小字号" onClick={() => resize(-2)}><Minus size={13} /></button>
      <button aria-label="放大歌词字号" title="放大字号" onClick={() => resize(2)}><Plus size={13} /></button>
      {/* The offset adjustment belongs next to the words it moves: reading the overlay is when a
          listener notices the lyric is early or late, and going back to the main window to fix it
          means losing the line you were watching. */}
      <span className="dlyric-offset" title="歌词提前 / 延后（按曲目记住）">
        <button aria-label="歌词延后" onClick={() => nudge(-0.5)}>−</button>
        <em>{(offsetSeconds > 0 ? '+' : '') + offsetSeconds.toFixed(1)}s</em>
        <button aria-label="歌词提前" onClick={() => nudge(0.5)}>+</button>
      </span>
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
    {/* Two stacked copies. The lower one is a solid black glyph widened by its stroke, which supplies
        the outline; the upper one is the karaoke gradient. One layer cannot carry both: a text-shadow
        or a stroke on a background-clip gradient paints over the fill and the row goes dark. */}
    <div className="dlyric-current" key={`c${index}`}>
      <span className="dlyric-current-outline" aria-hidden="true">{lineText}</span>
      <span className="dlyric-current-fill" style={gradient
        ? { backgroundImage: gradient, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', WebkitTextFillColor: 'transparent' }
        : undefined}>
        {lineText}
      </span>
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
