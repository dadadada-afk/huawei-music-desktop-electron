import { useEffect, useState } from 'react';
import { Lock, LockOpen, Minus, Plus, X } from 'lucide-react';
import type { LyricsAppearance, PlayerSnapshot } from '../shared/types';

// Three lines: the one just sung, the one being sung and the next one. The past line is what makes
// "already sung" readable at a glance — with only current+next on screen the highlight had nothing
// to be a highlight against. Frameless and always on top so it stays readable over other windows.
export function LyricsWindow() {
  const [state, setState] = useState<PlayerSnapshot | null>(null);
  const [look, setLook] = useState<LyricsAppearance>({ opacity: 1, locked: false, fontSize: 30, color: '#ffe9eb' });
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
  const lineAt = (at: number) => (at >= 0 && at < lines.length ? lines[at] : '');
  const current = lineAt(index);
  const previous = index > 0 ? lineAt(index - 1) : '';
  const next = lineAt(index + 1);
  const apply = (patch: Partial<LyricsAppearance>) => {
    void window.desktop.player.setLyricsAppearance(patch);
  };
  const resize = (delta: number) => apply({ fontSize: look.fontSize + delta });
  return <div className={`dlyric ${look.locked ? 'locked' : ''}`}
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
    <div className="dlyric-prev">{previous}</div>
    <div className="dlyric-current">{current || (state?.title ? '这首歌没有歌词' : '还没有播放')}</div>
    <div className="dlyric-next">{next}</div>
  </div>;
}
