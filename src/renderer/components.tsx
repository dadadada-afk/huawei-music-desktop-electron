import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  Captions, ChevronUp, Gauge, Heart, Headphones, ImageDown, ListMusic, ListOrdered, Minimize2, Moon, MoreHorizontal,
  Music2, Pause, PictureInPicture2, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Volume2, VolumeX, X,
} from 'lucide-react';
import { activeLyricIndex } from '../lyrics.mjs';
import { loadImage, renderShareCard, type ShareLine } from './share-card';
import type { LyricsDoc, PlayMode, Playlist, Track } from '../shared/types';

export function formatDuration(seconds?: number): string {
  if (seconds === undefined || !Number.isFinite(seconds)) return '—';
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

/** Total length stays unknown until the audio element reports metadata, so a zero is not "0:00". */
export function formatTotal(seconds?: number): string {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return '--:--';
  return formatDuration(seconds);
}

export type TrackActions = {
  currentTrackId: string | null;
  playing: boolean;
  favoriteOf(trackId: string): boolean | undefined;
  play(tracks: Track[], index: number): void;
  /** Queue the track right after the one playing, without interrupting it. */
  playNext(track: Track): void;
  /** Append to the end of the queue. */
  enqueue(track: Track): void;
  toggleFavorite(track: Track, favorite: boolean): void;
  openAlbum(id: string): void;
  openArtist(id: string): void;
};

type TrackTableProps = {
  tracks: Track[];
  actions: TrackActions;
  /**
   * Opt-in multi-select. Supplying it draws a checkbox column; the page owns the set so a bulk
   * action bar can live next to the list instead of inside every row.
   */
  selection?: { ids: Set<string>; onChange(next: Set<string>): void };
  onLoadMore?: () => void;
  hasMore?: boolean;
  busy?: boolean;
  loadMoreLabel?: string;
  emptyText?: string;
};

// Covers come from several CDN hosts (some legacy ones are plain http and get blocked by CSP).
// A failed image must fall back to the glyph instead of showing a broken-image icon.
export function Cover({ src, icon, className }: { src?: string; icon: ReactNode; className?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [src]);
  if (!src || failed) return <>{icon}</>;
  return <img className={className} src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />;
}

function TrackArt({ track, size = 20 }: { track: Track; size?: number }) {
  return <span className="track-art">
    <Cover src={track.coverUrl} icon={<Music2 size={size} />} />
  </span>;
}

export function TrackTable({ tracks, actions, selection, onLoadMore, hasMore, busy, loadMoreLabel = '加载更多', emptyText }: TrackTableProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ track: Track; index: number; x: number; y: number } | null>(null);
  // A context menu anchored to the cursor would sit off-screen near the right/bottom edge, so it is
  // measured against the viewport instead of trusting the click position.
  const menuStyle = (point: { x: number; y: number }): CSSProperties => {
    const width = 180;
    const height = 240;
    const left = Math.min(point.x, Math.max(8, window.innerWidth - width - 8));
    const top = point.y + height > window.innerHeight ? Math.max(8, point.y - height) : point.y;
    return { left, top };
  };
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenu(null); };
    window.addEventListener('click', close);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu]);
  if (!tracks.length) return <div className="list-empty"><p>{emptyText ?? '这里还没有内容。'}</p></div>;
  return <>
    <div className={`track-list${selection ? ' has-selection' : ''}`}>
      {tracks.map((track, index) => {
        const favorite = actions.favoriteOf(track.id);
        const current = actions.currentTrackId === track.id;
        const key = `${track.id}-${index}`;
        return <div
          key={key}
          className={`track-row ${current ? 'is-current' : ''} ${selected === key ? 'is-selected' : ''}`}
          role="button"
          tabIndex={0}
          aria-label={`${track.title}，${track.artists.map(artist => artist.name).join('、') || '未知艺人'}`}
          onClick={() => setSelected(key)}
          onDoubleClick={() => actions.play(tracks, index)}
          onContextMenu={event => {
            event.preventDefault();
            setSelected(key);
            setMenu({ track, index, x: event.clientX, y: event.clientY });
          }}
          onKeyDown={event => {
            if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); actions.play(tracks, index); }
          }}
        >
          {selection && <input
            type="checkbox"
            className="track-check"
            aria-label={`选择 ${track.title}`}
            checked={selection.ids.has(track.id)}
            onClick={event => event.stopPropagation()}
            onChange={event => {
              const next = new Set(selection.ids);
              if (event.target.checked) next.add(track.id); else next.delete(track.id);
              selection.onChange(next);
            }}
          />}
          <span className="track-index">
            <span className="num">{String(index + 1).padStart(2, '0')}</span>
            <button
              className="track-play"
              aria-label={`播放 ${track.title}`}
              onClick={event => { event.stopPropagation(); actions.play(tracks, index); }}
            >
              {current && actions.playing ? <Pause size={11} fill="currentColor" /> : <Play size={11} fill="currentColor" />}
            </button>
          </span>
          <TrackArt track={track} />
          <span className="track-title" title={track.title}>
            <span className="track-name">{track.title}</span>
            <small>
              {track.artists.map(artist => artist.id
                ? <button key={artist.id} className="link" onClick={event => { event.stopPropagation(); actions.openArtist(artist.id!); }}>{artist.name}</button>
                : <span key={artist.name}>{artist.name}</span>)
                .reduce<ReactNode[]>((nodes, node, at) => (at === 0 ? [node] : [...nodes, ' / ', node]), [])}
              {!track.artists.length && '未知艺人'}
            </small>
          </span>
          <span className="track-album">
            {track.album?.id
              ? <button className="link" onClick={event => { event.stopPropagation(); actions.openAlbum(track.album!.id); }}>{track.album.title}</button>
              : track.album?.title ?? '—'}
          </span>
          <span className="track-duration">{formatDuration(track.durationSeconds)}</span>
          <button
            className={`favorite-toggle ${favorite ? 'on' : ''}`}
            aria-label={favorite === undefined ? `切换收藏 ${track.title}` : favorite ? `取消收藏 ${track.title}` : `收藏 ${track.title}`}
            aria-pressed={!!favorite}
            title={favorite === undefined ? '先核对服务端收藏状态，再切换' : undefined}
            onClick={event => { event.stopPropagation(); actions.toggleFavorite(track, !favorite); }}
          >
            <Heart size={14} fill={favorite ? 'currentColor' : 'none'} />
          </button>
        </div>;
      })}
    </div>
    {menu && createPortal(<div className="track-menu" style={menuStyle(menu)} role="menu">
      <button role="menuitem" onClick={() => { actions.play(tracks, menu.index); setMenu(null); }}>立即播放</button>
      <button role="menuitem" onClick={() => { actions.playNext(menu.track); setMenu(null); }}>下一首播放</button>
      <button role="menuitem" onClick={() => { actions.enqueue(menu.track); setMenu(null); }}>加入播放队列</button>
      <button role="menuitem" onClick={() => { actions.toggleFavorite(menu.track, !actions.favoriteOf(menu.track.id)); setMenu(null); }}>
        {actions.favoriteOf(menu.track.id) ? '取消收藏' : '收藏'}
      </button>
      {menu.track.artists.some(artist => artist.id) && <button role="menuitem" onClick={() => {
        const artist = menu.track.artists.find(item => item.id);
        setMenu(null);
        if (artist?.id) actions.openArtist(artist.id);
      }}>查看歌手</button>}
      {menu.track.album?.id && <button role="menuitem" onClick={() => {
        const albumId = menu.track.album?.id;
        setMenu(null);
        if (albumId) actions.openAlbum(albumId);
      }}>查看专辑</button>}
    </div>, document.body)}
    {hasMore && onLoadMore && <button className="ghost load-more" onClick={onLoadMore} disabled={busy}>{busy ? '正在读取…' : loadMoreLabel}</button>}
  </>;
}

type PlaylistsProps = { playlists: Playlist[]; onOpen(playlist: Playlist): void };

export function PlaylistGrid({ playlists, onOpen }: PlaylistsProps) {
  if (!playlists.length) return <div className="list-empty"><p>没有找到歌单。收藏歌单、自建歌单和榜单会显示在这里。</p></div>;
  return <div className="playlist-grid">
    {playlists.map(playlist => <button key={`${playlist.kind}-${playlist.id}`} className="playlist-card" onClick={() => onOpen(playlist)}>
      <span className="playlist-art"><Cover src={playlist.coverUrl} icon={<ListMusic size={22} />} /></span>
      <strong>{playlist.title}</strong>
      <small>{playlist.kind === 'owned' ? '自建歌单' : playlist.kind === 'collected' ? '收藏歌单' : playlist.kind === 'chart' ? '榜单' : '未知类型'}{playlist.count !== undefined ? ` · ${playlist.count} 首` : ''}</small>
    </button>)}
  </div>;
}

type PlayerBarProps = {
  track?: Track;
  playing: boolean;
  buffering: boolean;
  position: number;
  duration: number;
  volume: number;
  quality: 'standard' | 'lossless';
  actualQuality: 'standard' | 'lossless' | 'unknown';
  /** One control, four states: 顺序 → 随机 → 列表循环 → 单曲循环. */
  playMode: PlayMode;
  disabled: boolean;
  onToggle(): void;
  onPrevious(): void;
  onNext(): void;
  onSeekPreview(value: number): void;
  onSeekCommit(): void;
  onVolume(value: number): void;
  playbackRate: number;
  onPlaybackRate(rate: number): void;
  /** Seconds left on the sleep timer, or null when none is running. */
  sleepRemaining: number | null;
  /** True when the timer waits for the current track to end instead of a wall-clock deadline. */
  sleepAfterTrack: boolean;
  onSleepTimer(minutes: number): void;
  onToggleMute(): void;
  onToggleQuality(): void;
  onCyclePlayMode(): void;
  onToggleLyrics(): void;
  onToggleQueue(): void;
  onOpenStage(): void;
  /** Opens or closes the always-on-top helper windows owned by the main process. */
  onToggleMini(): void;
  onToggleDesktopLyrics(): void;
  miniOpen: boolean;
  desktopLyricsOpen: boolean;
  lyricsOpen: boolean;
  queueOpen: boolean;
  queueCount: number;
  favorite: boolean | undefined;
  onToggleFavorite(): void;
};

function percent(value: number, max: number): string {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return '0%';
  return `${Math.min(100, Math.max(0, (value / max) * 100))}%`;
}

export function PlayerBar(props: PlayerBarProps) {
  const { track, playing, buffering, position, duration, volume } = props;
  const playModeLabel = props.playMode === 'shuffle' ? '随机播放'
    : props.playMode === 'all' ? '列表循环'
    : props.playMode === 'one' ? '单曲循环' : '顺序播放';
  const seekMax = duration || 1;
  return <footer className="player">
    <div className="now-playing">
      <button className="cover" aria-label={track ? '打开播放详情页' : '尚未选择歌曲'} disabled={!track}
        onClick={props.onOpenStage} title={track ? '打开播放详情页' : undefined}>
        <Cover src={track?.coverUrl} icon={<Headphones size={18} />} />
      </button>
      <div className="now-playing-text">
        <strong>{track?.title ?? '尚未选择歌曲'}</strong>
        <span>
          {buffering ? '正在缓冲…' : playing ? '正在播放' : track ? track.artists.map(artist => artist.name).join(' / ') || '未知艺人' : '选择一首歌开始播放'}
          {props.actualQuality !== 'unknown' ? ` · ${props.actualQuality === 'lossless' ? '无损' : '标准'}` : ''}
        </span>
      </div>
      <button className={`favorite-toggle ${props.favorite ? 'on' : ''}`} aria-label="收藏当前歌曲" aria-pressed={!!props.favorite}
        disabled={!track} onClick={props.onToggleFavorite}>
        <Heart size={15} fill={props.favorite ? 'currentColor' : 'none'} />
      </button>
    </div>
    <div className="player-controls">
      <div className="buttons">
        <button aria-label="上一首" onClick={props.onPrevious} disabled={props.disabled}><SkipBack size={16} fill="currentColor" /></button>
        <button className="play-button" aria-label={playing ? '暂停' : '播放'} onClick={props.onToggle} disabled={props.disabled}>
          {playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}
        </button>
        <button aria-label="下一首" onClick={props.onNext} disabled={props.disabled}><SkipForward size={16} fill="currentColor" /></button>
        <button aria-label={playModeLabel} className={props.playMode !== 'off' ? 'active' : ''} onClick={props.onCyclePlayMode}
          disabled={props.disabled} title={`${playModeLabel}（点击切换：顺序 → 随机 → 列表循环 → 单曲循环）`}>
          {/* Four states on one button. Two buttons used to split this between "shuffle" and
              "repeat", which left 随机 unreachable from the repeat cycle and hid it behind an icon
              the user did not recognise — the complaint that started this change. */}
          {props.playMode === 'shuffle' ? <Shuffle size={15} />
            : props.playMode === 'all' ? <Repeat size={15} />
            : props.playMode === 'one' ? <Repeat1 size={15} />
            : <ListOrdered size={15} />}
        </button>
      </div>
      <div className="progress">
        <span>{formatDuration(position)}</span>
        <input aria-label="播放进度" type="range" min="0" max={seekMax} step="0.1" value={Math.min(position, seekMax)}
          style={percentStyle(position, seekMax)}
          disabled={!duration} onChange={event => props.onSeekPreview(Number(event.target.value))}
          onPointerUp={props.onSeekCommit} onKeyUp={props.onSeekCommit} onBlur={props.onSeekCommit} />
        <span>{formatTotal(duration)}</span>
      </div>
    </div>
    <div className="volume">
      <button className="quality-button" onClick={props.onToggleQuality} disabled={!track} title="切换音质（下次取链生效）">{props.quality === 'lossless' ? '无损' : '标准'}</button>
      <button className="pill-button" aria-label="歌词" aria-pressed={props.lyricsOpen} onClick={props.onToggleLyrics} disabled={!track}>
        <ChevronUp size={13} />词
      </button>
      <button className="pill-button" aria-label="播放队列" aria-pressed={props.queueOpen} onClick={props.onToggleQueue} disabled={!props.queueCount}>
        队列 {props.queueCount}
      </button>
      <button className="icon-button" aria-label="迷你播放器" aria-pressed={props.miniOpen} onClick={props.onToggleMini} disabled={!track} title="迷你播放器（置顶小窗）">
        <PictureInPicture2 size={16} />
      </button>
      <button className="icon-button" aria-label="桌面歌词" aria-pressed={props.desktopLyricsOpen} onClick={props.onToggleDesktopLyrics} disabled={!track} title="桌面歌词（置顶悬浮）">
        <Captions size={16} />
      </button>
      <button className="icon-button" aria-label={volume > 0 ? '静音' : '取消静音'} onClick={props.onToggleMute}>
        {volume > 0 ? <Volume2 size={16} /> : <VolumeX size={16} />}
      </button>
      <input aria-label="音量" type="range" min="0" max="1" step="0.01" value={volume}
        style={percentStyle(volume, 1)}
        onChange={event => props.onVolume(Number(event.target.value))} />
      <PlayerMoreMenu {...props} />
    </div>
  </footer>;
}

const RATES = [0.75, 1, 1.25, 1.5, 2];
// -1 is the "end of this track" mode: it cannot be expressed as a minute count because a podcast
// episode can run past an hour, and cutting it mid-sentence is exactly what the timer is for.
const SLEEP_OFF = 0;
const SLEEP_END_OF_TRACK = -1;
const SLEEP_CHOICES = [SLEEP_OFF, 15, 30, 60, SLEEP_END_OF_TRACK];

function sleepLabelOf(minutes: number): string {
  return minutes === SLEEP_OFF ? '关闭' : minutes === SLEEP_END_OF_TRACK ? '播完本曲' : `${minutes} 分钟`;
}

function formatSleep(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Playback speed and the sleep timer live here rather than in Settings because both are per-listen
// decisions that a listener changes while music is playing.
function PlayerMoreMenu(props: PlayerBarProps) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement | null>(null);
  const [pos, setPos] = useState<{ left: number; bottom: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const box = anchor.current?.getBoundingClientRect();
    if (box) setPos({ left: Math.max(12, Math.min(box.left - 210, window.innerWidth - 236)), bottom: window.innerHeight - box.top + 10 });
    const close = (event: Event) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (anchor.current?.contains(target)) return;
      if ((target as HTMLElement).closest?.('.more-menu')) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('keydown', onKey); };
  }, [open]);

  const sleepLabel = props.sleepAfterTrack
    ? '播完本曲暂停'
    : props.sleepRemaining === null ? '未开启' : `剩 ${formatSleep(props.sleepRemaining)}`;
  // A minute preset is not highlighted after it starts counting down (the label already shows the
  // remainder), but the two non-countdown states always show which one is armed.
  const sleepChoiceActive = (minutes: number) => minutes === SLEEP_OFF
    ? !props.sleepAfterTrack && props.sleepRemaining === null
    : minutes === SLEEP_END_OF_TRACK ? props.sleepAfterTrack : false;

  return <>
    <button ref={anchor} className="icon-button" aria-label="播放选项" aria-expanded={open}
      aria-haspopup="menu" onClick={() => setOpen(value => !value)} title="播放选项">
      <MoreHorizontal size={16} />
    </button>
    {open && pos && createPortal(<div className="more-menu" role="menu" aria-label="播放选项" style={{ left: pos.left, bottom: pos.bottom }}>
      <div className="more-group more-rate">
        <p className="more-head"><Gauge size={13} />播放速度</p>
        <div className="more-chips">
          {RATES.map(rate => <button key={rate} role="menuitemradio" aria-checked={props.playbackRate === rate}
            className={`more-chip ${props.playbackRate === rate ? 'active' : ''}`}
            onClick={() => props.onPlaybackRate(rate)}>{rate === 1 ? '正常' : `${rate}x`}</button>)}
        </div>
      </div>
      <div className="more-group more-sleep">
        <p className="more-head"><Moon size={13} />睡眠定时<span className="more-note">{sleepLabel}</span></p>
        <div className="more-chips">
          {SLEEP_CHOICES.map(minutes => <button key={minutes} role="menuitemradio"
            aria-checked={sleepChoiceActive(minutes)}
            className={`more-chip ${sleepChoiceActive(minutes) ? 'active' : ''}`}
            onClick={() => { props.onSleepTimer(minutes); setOpen(false); }}>{sleepLabelOf(minutes)}</button>)}
        </div>
      </div>
    </div>, document.body)}
  </>;
}

const LYRIC_SOURCES: Record<string, string> = { huawei: '华为音乐', kugou: '酷狗音乐', lrclib: 'LRCLIB', local: '本地文件' };

type LyricsViewProps = {
  doc: LyricsDoc | null;
  loading?: boolean;
  positionSeconds: number;
  offsetSeconds: number;
  onSeekTo(timeMs: number): void;
};

function percentStyle(value: number, max: number): CSSProperties {
  return { '--pct': percent(value, max) } as CSSProperties;
}

function useActiveLyric(doc: LyricsDoc | null, positionSeconds: number, offsetSeconds: number) {
  const lines = doc?.lines ?? [];
  return doc?.synced ? activeLyricIndex(lines, (positionSeconds + offsetSeconds) * 1000) : -1;
}

export function LyricsPanel({ doc, loading, positionSeconds, offsetSeconds, onSeekTo, onOpenStage, onImport, onRemoveLocal, onClose }: LyricsViewProps & {
  onOpenStage(): void;
  onImport(): void;
  onRemoveLocal(): void;
  onClose(): void;
}) {
  const [following, setFollowing] = useState(true);
  const container = useRef<HTMLDivElement | null>(null);
  const lines = doc?.lines ?? [];
  const activeIndex = useActiveLyric(doc, positionSeconds, offsetSeconds);
  useEffect(() => { setFollowing(true); }, [doc]);
  useEffect(() => {
    if (following && activeIndex >= 0) container.current?.querySelector('.active')?.scrollIntoView({ block: 'center', behavior: 'instant' });
  }, [activeIndex, following]);
  return <aside className="side-panel" aria-label="歌词">
    <div className="panel-head">
      <strong>歌词</strong>
      <button className="text-button" onClick={onClose}>关闭</button>
    </div>
    {doc?.source && doc.source !== 'huawei' && <p className="lyric-source">
      歌词来自 {LYRIC_SOURCES[doc.source] ?? doc.source}
      {doc.matchedTitle ? ` · 匹配「${doc.matchedTitle}${doc.matchedArtist ? ` - ${doc.matchedArtist}` : ''}」` : ''}
    </p>}
    {!doc || !lines.length
      ? <p className="panel-empty">{loading ? '正在读取歌词…' : '暂无歌词。可以换一首，或稍后重试。'}</p>
      : <><div ref={container} className={`lyrics ${doc.synced ? 'synced' : ''}`}
          onWheel={() => setFollowing(false)} onTouchMove={() => setFollowing(false)} tabIndex={0}
          onKeyDown={event => { if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown'].includes(event.key)) setFollowing(false); }}>
        {lines.map((line, index) => <p key={`${index}-${line.text}`}
          className={`${index === activeIndex ? 'active' : ''} ${activeIndex >= 0 && index < activeIndex ? 'passed' : ''} ${line.translation ? 'has-translation' : ''}`}
          onClick={() => { if (line.timeMs !== null) onSeekTo(line.timeMs); }}>
          {line.text || '♪'}
          {line.translation && <span className="translation">{line.translation}</span>}
        </p>)}
      </div></>}
    <div className="panel-actions">
      {doc?.synced && !following && <button className="ghost" onClick={() => setFollowing(true)}>跟随播放</button>}
      <button className="ghost" onClick={onOpenStage}>沉浸歌词</button>
      <button className="ghost" onClick={onImport}>{doc?.source === 'local' ? '重新导入' : '导入本地歌词'}</button>
      {doc?.source === 'local' && <button className="ghost danger" onClick={onRemoveLocal}>移除本地</button>}
    </div>
  </aside>;
}

/**
 * Saves a poster of the current song: cover, title and the lyric line being sung.
 * The cover is fetched through IPC because a cross-origin <img> would taint the canvas.
 */
function ShareCardButton({ track, doc, positionSeconds, offsetSeconds }: {
  track?: Track | null;
  doc: LyricsDoc | null;
  positionSeconds: number;
  offsetSeconds: number;
}) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const activeIndex = useActiveLyric(doc, positionSeconds, offsetSeconds);
  useEffect(() => {
    if (!done) return;
    const timer = window.setTimeout(() => setDone(false), 2200);
    return () => window.clearTimeout(timer);
  }, [done]);

  async function share() {
    if (!track || busy) return;
    setBusy(true);
    try {
      let cover: HTMLImageElement | undefined;
      if (track.coverUrl) {
        const fetched = await window.desktop.share.cover({ url: track.coverUrl }).catch(() => null);
        if (fetched?.ok) cover = await loadImage(fetched.data.dataUrl).catch(() => undefined);
      }
      const lines = doc?.lines ?? [];
      const at = (index: number): ShareLine | null => {
        const line = lines[index];
        return line ? { text: line.text || '', current: index === activeIndex } : null;
      };
      const picked = activeIndex < 0
        ? lines.slice(0, 3).map((line, index) => ({ text: line.text || '', current: index === 0 }))
        : [at(activeIndex - 1), at(activeIndex), at(activeIndex + 1)].filter((line): line is ShareLine => !!line);
      const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#c8202e';
      const canvas = renderShareCard({
        title: track.title,
        artists: track.artists.map(artist => artist.name).join(' / ') || '未知艺人',
        lines: picked.length ? picked : [{ text: '', current: true }],
        accent,
        dark: window.matchMedia('(prefers-color-scheme: dark)').matches,
      }, cover);
      const saved = await window.desktop.share.save({
        dataUrl: canvas.toDataURL('image/png'),
        suggestedName: `${track.title}-${track.artists.map(artist => artist.name).join('_') || '分享'}`,
      });
      if (saved.ok && !saved.data.canceled) setDone(true);
    } catch {
      setDone(false);
    } finally {
      setBusy(false);
    }
  }

  return <button className="stage-tool" aria-label="保存歌词分享图" onClick={() => void share()} disabled={!track || busy}>
    <ImageDown size={13} />{busy ? '生成中…' : done ? '已保存' : '分享图'}
  </button>;
}

export function LyricsStage({
  track, doc, loading, positionSeconds, offsetSeconds, playing, duration, disabled,
  onSeekTo, onSeekSeconds, onToggle, onPrevious, onNext, onOffset, onImport, onRemoveLocal, onClose,
}: LyricsViewProps & {
  track?: Track;
  onImport(): void;
  onRemoveLocal(): void;
  playing: boolean;
  duration: number;
  disabled: boolean;
  onSeekSeconds(seconds: number): void;
  onToggle(): void;
  onPrevious(): void;
  onNext(): void;
  onOffset(deltaSeconds: number): void;
  onClose(): void;
}) {
  const [following, setFollowing] = useState(true);
  const container = useRef<HTMLDivElement | null>(null);
  const lines = doc?.lines ?? [];
  const activeIndex = useActiveLyric(doc, positionSeconds, offsetSeconds);
  const seekMax = duration || 1;
  useEffect(() => { setFollowing(true); }, [doc, track?.id]);
  useEffect(() => {
    if (following && activeIndex >= 0) container.current?.querySelector('.stage-line.active')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [activeIndex, following]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return <section className="lyrics-stage" aria-label="沉浸歌词" style={{ '--stage-art': track?.coverUrl ? `url("${track.coverUrl}")` : 'none' } as CSSProperties}>
    <button className="stage-close" aria-label="退出歌词页" onClick={onClose}><X size={17} /></button>
    <div className="stage-body">
      <aside className="stage-cover-panel">
        <div className="stage-cover">
          <Cover src={track?.coverUrl} icon={<Music2 size={44} />} />
        </div>
        <h2 className="stage-title">{track?.title ?? '尚未选择歌曲'}</h2>
        <p className="stage-artist">{track?.artists.map(artist => artist.name).join(' / ') || '未知艺人'}</p>
        {track?.album?.title && <p className="stage-album">{track.album.title}</p>}
        {doc?.source && doc.source !== 'huawei' && <p className="stage-source">
          歌词来自 {LYRIC_SOURCES[doc.source] ?? doc.source}
          {doc.matchedTitle ? ` · 匹配「${doc.matchedTitle}」` : ''}
        </p>}
      </aside>
      <div className="stage-lyrics-column">
        <div ref={container} className="stage-scroll"
          onWheel={() => setFollowing(false)} onTouchMove={() => setFollowing(false)}
          onKeyDown={event => { if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown'].includes(event.key)) setFollowing(false); }}>
          {!lines.length
            ? <p className="stage-empty">{loading ? '正在读取歌词…' : doc ? '这首暂时没有歌词。' : '暂时无法读取歌词。'}</p>
            : <div className="stage-lines">
              {lines.map((line, index) => <button key={`${index}-${line.text}`}
                className={`stage-line ${index === activeIndex ? 'active' : ''} ${activeIndex >= 0 && index < activeIndex ? 'passed' : ''} ${line.timeMs === null ? 'no-time' : ''}`}
                aria-label={line.text || '间奏'}
                onClick={() => { if (line.timeMs !== null) onSeekTo(line.timeMs); }}>
                <span>
                  {line.segments?.length
                    ? line.segments.map((segment, at) => {
                      const passed = activeIndex === index && typeof segment.timeMs === 'number' && (positionSeconds + offsetSeconds) * 1000 >= segment.timeMs;
                      return <span key={at} className={`seg ${passed ? 'passed' : ''}`}>{segment.text}</span>;
                    })
                    : line.text || '♪'}
                </span>
                {line.translation && <span className="translation">{line.translation}</span>}
              </button>)}
            </div>}
        </div>
      </div>
    </div>
    <footer className="stage-foot">
      <div className="stage-transport">
        <button aria-label="上一首" onClick={onPrevious} disabled={disabled}><SkipBack size={17} fill="currentColor" /></button>
        <button className="stage-play" aria-label={playing ? '暂停' : '播放'} onClick={onToggle} disabled={disabled}>
          {playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
        </button>
        <button aria-label="下一首" onClick={onNext} disabled={disabled}><SkipForward size={17} fill="currentColor" /></button>
      </div>
      <div className="stage-progress">
        <span>{formatDuration(positionSeconds)}</span>
        <input aria-label="播放进度" type="range" min="0" max={seekMax} step="0.1" value={Math.min(positionSeconds, seekMax)}
          style={percentStyle(positionSeconds, seekMax)}
          disabled={!duration}
          onChange={event => onSeekSeconds(Number(event.target.value))} />
        <span>{formatTotal(duration)}</span>
      </div>
      <div className="stage-tools">
        <button className={`stage-tool ${following ? 'on' : ''}`} aria-pressed={following} onClick={() => setFollowing(value => !value)}>
          <Minimize2 size={13} />{following ? '跟随中' : '已暂停'}
        </button>
        <div className="stage-tool" style={{ gap: 2 }}>
          {/* A larger offset matches the position against a later moment, which shows the lyric
              earlier: the plus button is the one that pulls it forward. The labels read the
              opposite way until now, so the two controls did the reverse of what they promised. */}
          <button aria-label="歌词延后" onClick={() => onOffset(-0.5)} disabled={!doc?.synced}>−</button>
          <span className="offset">{(offsetSeconds > 0 ? '+' : '') + offsetSeconds.toFixed(1)}s</span>
          <button aria-label="歌词提前" onClick={() => onOffset(0.5)} disabled={!doc?.synced}>+</button>
        </div>
        <ShareCardButton track={track} doc={doc} positionSeconds={positionSeconds} offsetSeconds={offsetSeconds} />
      </div>
    </footer>
  </section>;
}

export function QueuePanel({ tracks, currentId, onSelect, onReorder, onClose }: {
  tracks: Track[];
  currentId: string | null;
  onSelect(index: number): void;
  onReorder(from: number, to: number): void;
  onClose(): void;
}) {
  const dragFrom = useRef<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  return <aside className="side-panel" aria-label="播放队列">
    <div className="panel-head"><strong>播放队列</strong><button className="text-button" onClick={onClose}>关闭</button></div>
    {!tracks.length
      ? <p className="panel-empty">队列为空。</p>
      : <ol className="queue-list">
        {tracks.map((track, index) => <li key={`${track.id}-${index}`} draggable
          className={`${dragFrom.current === index ? 'dragging' : ''} ${overIndex === index ? 'drop-target' : ''}`}
          onDragStart={event => { dragFrom.current = index; event.dataTransfer.effectAllowed = 'move'; }}
          onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setOverIndex(index); }}
          onDragLeave={() => setOverIndex(current => (current === index ? null : current))}
          onDrop={event => {
            event.preventDefault();
            const from = dragFrom.current;
            dragFrom.current = null;
            setOverIndex(null);
            if (from !== null && from !== index) onReorder(from, index);
          }}
          onDragEnd={() => { dragFrom.current = null; setOverIndex(null); }}>
          <button className={`queue-item ${track.id === currentId ? 'active' : ''}`} onClick={() => onSelect(index)}>
            <span>{track.title}</span><small>{track.artists.map(artist => artist.name).join(' / ') || '未知艺人'}</small>
          </button>
        </li>)}
      </ol>}
  </aside>;
}
