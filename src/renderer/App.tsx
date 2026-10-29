import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronLeft, ChevronRight, ChevronUp, Heart, Headphones, History, ListMusic, LogIn, LogOut, Search,
  Settings as SettingsIcon, Sparkles,
} from 'lucide-react';
import { LyricsPanel, LyricsStage, PlayerBar, QueuePanel } from './components';
import {
  AlbumPage, ArtistPage, DiscoverPage, HistoryPage, PlaylistsPage, PlaylistDetailPage, SearchPage,
  SettingsPage, type LibraryContext,
} from './pages';
import { FavoritesPage } from './favorites-page';
import { APP_BRAND_LABEL } from '../shared/app-name.mjs';
import { activeLyricIndex } from '../lyrics.mjs';
import {
  autosaveDelay, buildShuffleOrder, historyReportDecision, onEndedAction, popPlayHistory, pushPlayHistory, stepCursor,
} from './player.mjs';
import { ACCENTS, FONT_STACKS, applyAppearance, applyThemeAttribute } from './appearance';
import { canRetryMediaFailure, reconcileTrackIndexes } from './track-reconcile.mjs';
import type {
  AccentName, AppSettings, AuthStatus, AppearanceSettings, FontChoice, LyricsDoc, Playback, PlayMode, Playlist, Result, SavedQueue, Track,
} from '../shared/types';

type View =
  | { name: 'discover' } | { name: 'favorites' } | { name: 'playlists' } | { name: 'search' }
  | { name: 'history' } | { name: 'settings' }
  | { name: 'playlist'; playlist: Playlist }
  | { name: 'album'; albumId: string }
  | { name: 'artist'; artistId: string };

const VIEW_TITLES: Record<View['name'], string> = {
  discover: '发现', favorites: '我的收藏', playlists: '我的歌单', playlist: '歌单详情', search: '搜索',
  history: '播放历史', settings: '设置', album: '专辑', artist: '歌手',
};

const VIEW_EYEBROWS: Record<View['name'], string> = {
  discover: 'Discover', favorites: 'Library', playlists: 'Collections', playlist: 'Collection', search: 'Search',
  history: 'History', settings: 'Preferences', album: 'Album', artist: 'Artist',
};

const NAV_ICONS = {
  discover: Sparkles, favorites: Heart, playlists: ListMusic, search: Search, history: History,
  settings: SettingsIcon,
};

const HISTORY_KEY = 'local-play-history';
const HISTORY_LIMIT = 200;
const LYRIC_OFFSET_KEY = 'lyric-offset';
const LYRIC_OFFSET_LIMIT = 10;

function readLyricOffset(trackId?: string): number {
  try {
    const own = Number(trackId ? localStorage.getItem(`${LYRIC_OFFSET_KEY}:${trackId}`) : null);
    if (Number.isFinite(own) && own !== 0) return Math.max(-LYRIC_OFFSET_LIMIT, Math.min(LYRIC_OFFSET_LIMIT, own));
    const shared = Number(localStorage.getItem(LYRIC_OFFSET_KEY));
    return Number.isFinite(shared) ? Math.max(-LYRIC_OFFSET_LIMIT, Math.min(LYRIC_OFFSET_LIMIT, shared)) : 0;
  } catch { return 0; }
}

function readLocalHistory(): Track[] {
  try {
    const raw = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((track: Track) => !!track?.id && !!track?.title).slice(0, HISTORY_LIMIT) : [];
  } catch { return []; }
}

export function App() {
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [message, setMessage] = useState('正在检查登录状态…');
  const [busy, setBusy] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [view, setView] = useState<View>({ name: 'discover' });
  const [queue, setQueue] = useState<Track[]>([]);
  const [queueReady, setQueueReady] = useState(false);
  const [cursor, setCursor] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [actualQuality, setActualQuality] = useState<'standard' | 'lossless' | 'unknown'>('unknown');
  const [lyrics, setLyrics] = useState<LyricsDoc | null>(null);
  const [lyricsOpen, setLyricsOpen] = useState(false);
  // Declared up here because the lyric loader below needs it to decide whether to fetch at all.
  const [auxOpen, setAuxOpen] = useState<Record<'mini' | 'lyrics', boolean>>({ mini: false, lyrics: false });
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [stageOpen, setStageOpen] = useState(false);
  const [lyricOffset, setLyricOffset] = useState(0);
  const [lyricRevision, setLyricRevision] = useState(0);
  const lyricCache = useRef(new Map<string, LyricsDoc | null>());
  const [queueOpen, setQueueOpen] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [knownFavoriteIds, setKnownFavoriteIds] = useState<Set<string>>(new Set());
  const [accountVersion, setAccountVersion] = useState(0);
  const [favoriteChange, setFavoriteChange] = useState<LibraryContext['favoriteChange']>(null);
  const favoritePending = useRef(new Set<string>());
  const playCommand = useRef({ toggle: () => {}, next: () => {}, previous: () => {}, volume: (_delta: number) => {}, toggleFavorite: () => {} });
  const [localHistory, setLocalHistory] = useState<Track[]>([]);
  const [volume, setVolume] = useState(0.85);
  const [quality, setQuality] = useState<'standard' | 'lossless'>('standard');
  const [repeatMode, setRepeatMode] = useState<AppSettings['repeatMode']>('off');
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ left: number; bottom: number } | null>(null);
  const footRef = useRef<HTMLButtonElement>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const [shuffle, setShuffle] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  // Sleep timer is a session convenience, not a stored preference: it is a deadline, so restoring a
  // stale one after a restart would either fire immediately or never.
  const [sleepDeadline, setSleepDeadline] = useState<number | null>(null);
  const [sleepRemaining, setSleepRemaining] = useState(0);
  // The "stop after this track" variant has no deadline, so it needs its own flag; the audio
  // element's 'ended' handler reads the ref because that listener is registered once.
  const [sleepAfterTrack, setSleepAfterTrack] = useState(false);

  const audio = useRef<HTMLAudioElement | null>(null);
  const playbackGeneration = useRef(0);
  const activeAudioGeneration = useRef(0);
  const activeAudioSource = useRef('');
  const mediaRetryCount = useRef(0);
  const seeking = useRef(false);
  const seekTarget = useRef<number | null>(null);
  const pendingSeek = useRef<number | null>(null);
  const order = useRef<number[]>([]);
  const cursorRef = useRef(-1);
  const queueRef = useRef<Track[]>([]);
  const repeatRef = useRef<AppSettings['repeatMode']>('off');
  const qualityRef = useRef<'standard' | 'lossless'>('standard');
  const volumeRef = useRef(0.85);
  const playbackRateRef = useRef(1);
  const sleepAfterTrackRef = useRef(false);
  const syncHistoryRef = useRef(true);
  const listenSeconds = useRef(0);
  const lastListenAt = useRef(0);
  const historyReported = useRef(false);
  const playHistory = useRef<number[]>([]);
  const reportHistoryRef = useRef<() => void>(() => {});
  const isResolvingTrack = useRef(false);
  const positionRef = useRef(0);
  positionRef.current = position;
  const saveTimer = useRef<number | undefined>(undefined);
  const positionTimer = useRef<number | undefined>(undefined);
  const lastSaveAt = useRef(Date.now());
  const lastStructure = useRef<{ queue: Track[]; cursor: number }>({ queue: [], cursor: -1 });
  const playAtRef = useRef<(nextCursor: number, retryCount?: number) => Promise<void>>(async () => undefined);

  const currentTrack = cursor >= 0 && cursor < order.current.length ? queue[order.current[cursor]] : undefined;

  function run<T>(action: () => Promise<Result<T>>, failure: string): Promise<T | undefined> {
    return action().then(result => {
      if (result.ok) return result.data;
      setMessage(result.error.message);
      return undefined;
    }).catch(() => { setMessage(failure); return undefined; });
  }
  const notice = (text: string) => setMessage(text);

  useEffect(() => {
    const unsubscribeProgress = window.desktop.auth.onProgress(setMessage);
    const unsubscribeNotice = window.desktop.onNotice(setMessage);
    const unsubscribeCommand = window.desktop.player.onCommand(command => {
      if (command === 'play-pause') playCommand.current.toggle();
      else if (command === 'next') playCommand.current.next();
      else if (command === 'previous') playCommand.current.previous();
      else if (command === 'toggle-favorite') playCommand.current.toggleFavorite?.();
      else playCommand.current.volume(command === 'volume-up' ? 0.05 : -0.05);
    });
    const unsubscribeSeek = window.desktop.player.onSeek(seconds => {      const element = audio.current;
      if (!element || !Number.isFinite(seconds)) return;
      const limit = Number.isFinite(element.duration) && element.duration > 0 ? element.duration : seconds;
      element.currentTime = Math.max(0, Math.min(limit, seconds));
      setPosition(element.currentTime);
    });
    void (async () => {
      const [authResult, settingsResult, queueResult] = await Promise.all([
        window.desktop.auth.status().catch(() => null),
        window.desktop.settings.get().catch(() => null),
        window.desktop.queue.load().catch(() => null),
      ]);
      if (authResult?.ok) {
        setStatus(authResult.data);
        if (authResult.data.authenticated) setLocalHistory(readLocalHistory());
        else { try { localStorage.removeItem(HISTORY_KEY); } catch { /* No account history on a signed-out boot. */ } }
        setMessage(authResult.data.authenticated ? '已恢复音乐会话。' : '请登录以读取个人音乐库。');
      } else setMessage('无法读取本机登录状态，请重启应用后重试。');
      if (settingsResult?.ok) applySettings(settingsResult.data);
      const saved = queueResult?.ok ? queueResult.data : null;
      if (saved?.tracks.length) {
        queueRef.current = saved.tracks;
        const activeIndex = Math.min(Math.max(0, saved.index), saved.tracks.length - 1);
        order.current = settingsResult?.ok && settingsResult.data.shuffle
          ? buildShuffleOrder(saved.tracks.length, activeIndex) : identityOrder(saved.tracks.length);
        const restoredCursor = order.current.indexOf(activeIndex);
        cursorRef.current = restoredCursor;
        setQueue(saved.tracks);
        setCursor(restoredCursor);
        setPosition(saved.positionSeconds);
        pendingSeek.current = saved.positionSeconds > 0 ? saved.positionSeconds : null;
        setMessage(`已恢复上次队列（${saved.tracks.length} 首），点击播放继续。`);
      }
      setQueueReady(true);
    })();
    return () => {
      unsubscribeProgress(); unsubscribeNotice(); unsubscribeCommand(); unsubscribeSeek();
      window.clearTimeout(saveTimer.current); window.clearTimeout(positionTimer.current);
    };
  }, []);

  useEffect(() => {
    audio.current = new Audio();
    audio.current.volume = volumeRef.current;
    // A fresh element starts at 1x, so the chosen speed has to be reapplied on every source swap.
    audio.current.playbackRate = playbackRateRef.current;
    const element = audio.current;
    const isCurrentSource = () => activeAudioGeneration.current === playbackGeneration.current
      && !!activeAudioSource.current && element.src === activeAudioSource.current;
    const time = () => {
      if (!isCurrentSource() || seeking.current) return;
      setPosition(element.currentTime);
      // Count only real listening: a seek produces a large delta and is ignored here.
      const delta = element.currentTime - lastListenAt.current;
      if (delta > 0 && delta < 5) listenSeconds.current += delta;
      lastListenAt.current = element.currentTime;
      reportHistoryRef.current();
    };
    const loaded = () => {
      if (!isCurrentSource()) return;
      setDuration(Number.isFinite(element.duration) ? element.duration : 0);
      lastListenAt.current = element.currentTime;
      if (pendingSeek.current !== null && Number.isFinite(element.duration) && element.duration > 0) {
        element.currentTime = Math.min(pendingSeek.current, Math.max(0, element.duration - 0.5));
        pendingSeek.current = null;
      }
    };
    const started = () => {
      if (!isCurrentSource()) return;
      setBuffering(false); setPlaying(true);
      const track = queueRef.current[order.current[cursorRef.current]];
      if (track) recordLocalHistory(track);
    };
    const waiting = () => { if (isCurrentSource() && !element.paused) { setBuffering(true); setPlaying(false); } };
    const paused = () => { if (isCurrentSource()) { setBuffering(false); setPlaying(false); } };
    const failed = () => {
      if (!isCurrentSource()) return;
      activeAudioSource.current = '';
      setDuration(0); setBuffering(false); setPlaying(false); setActualQuality('unknown');
      if (canRetryMediaFailure(mediaRetryCount.current)) {
        const retryCount = mediaRetryCount.current + 1;
        setMessage('音频资源加载失败，正在重新获取一次…');
        void playAtRef.current(cursorRef.current, retryCount);
      } else setMessage('音频重试失败，请检查网络后手动重试。');
    };
    const ended = () => {
      if (!isCurrentSource()) return;
      reportHistoryRef.current();
      activeAudioSource.current = '';
      setBuffering(false); setPlaying(false);
      // "Stop after this track" ends playback here rather than advancing: the point is to fall
      // asleep at the end of what is playing, not one song later.
      if (sleepAfterTrackRef.current) {
        sleepAfterTrackRef.current = false;
        setSleepAfterTrack(false);
        setMessage('睡眠定时：当前歌曲已播完，已暂停播放。');
        return;
      }
      const step = onEndedAction(cursorRef.current, order.current.length, repeatRef.current);
      if (!step.stopped) void playAtRef.current(step.cursor);
    };
    element.addEventListener('timeupdate', time);
    element.addEventListener('loadedmetadata', loaded);
    element.addEventListener('playing', started);
    element.addEventListener('waiting', waiting);
    element.addEventListener('pause', paused);
    element.addEventListener('error', failed);
    element.addEventListener('ended', ended);
    return () => {
      element.pause();
      element.removeEventListener('timeupdate', time);
      element.removeEventListener('loadedmetadata', loaded);
      element.removeEventListener('playing', started);
      element.removeEventListener('waiting', waiting);
      element.removeEventListener('pause', paused);
      element.removeEventListener('error', failed);
      element.removeEventListener('ended', ended);
      element.src = '';
    };
  }, []);

  useEffect(() => { if (audio.current) audio.current.volume = volume; }, [volume]);

  useEffect(() => { applyAppearance(settings?.appearance); }, [settings?.appearance]);
  // The three custom palettes are plain CSS token overrides keyed off this attribute, so switching
  // a theme never re-mounts a component or touches playback state.
  useEffect(() => { applyThemeAttribute(settings?.theme); }, [settings?.theme]);

  // Persist the queue without any playback URL; the renderer only stores what the IPC accepts.
  function persistQueue() {
    lastSaveAt.current = Date.now();
    const activeIndex = order.current[cursorRef.current] ?? 0;
    void window.desktop.queue.save({ tracks: queueRef.current, index: activeIndex, positionSeconds: positionRef.current }).catch(() => undefined);
  }

  // Queue contents and the active track change rarely, so persist them on their own timer. Sharing
  // one timer with the position update would let a `timeupdate` cancel the structural write.
  useEffect(() => {
    if (!queueReady) return;
    const structural = lastStructure.current.queue !== queue || lastStructure.current.cursor !== cursor;
    lastStructure.current = { queue, cursor };
    if (!structural) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(persistQueue, 0);
  }, [queue, cursor, queueReady]);

  // Position changes on every `timeupdate`, so throttle the writes instead of debouncing forever.
  useEffect(() => {
    if (!queueReady) return;
    if (positionTimer.current) window.clearTimeout(positionTimer.current);
    positionTimer.current = window.setTimeout(persistQueue, autosaveDelay(Date.now(), lastSaveAt.current));
    return () => window.clearTimeout(positionTimer.current);
  }, [position, queueReady]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const session = navigator.mediaSession;
    session.metadata = currentTrack
      ? new MediaMetadata({ title: currentTrack.title, artist: currentTrack.artists.map(artist => artist.name).join(' / '), album: currentTrack.album?.title })
      : null;
    session.playbackState = playing ? 'playing' : currentTrack ? 'paused' : 'none';
    session.setActionHandler('play', () => { if (audio.current?.paused) togglePlayback(); });
    session.setActionHandler('pause', () => audio.current?.pause());
    session.setActionHandler('nexttrack', () => goNext());
    session.setActionHandler('previoustrack', () => goPrevious());
  }, [currentTrack?.id, playing]);

  useEffect(() => {
    if (!('mediaSession' in navigator) || !duration) return;
    try {
      navigator.mediaSession.setPositionState({ duration, position: Math.min(position, duration), playbackRate });
    } catch { /* Position state is best effort. */ }
  }, [position, duration, playbackRate]);

  // Lyrics load once per track while any surface that shows them is visible. Both helper windows
  // count: the overlay and the mini player are mirrors, so they can only display what this window
  // has fetched - without them in this guard the mini player would show an empty lyric strip.
  useEffect(() => {
    if (!lyricsOpen && !stageOpen && !auxOpen.lyrics && !auxOpen.mini) return;
    const trackId = currentTrack?.id;
    if (!trackId) { setLyrics(null); return; }
    setLyricOffset(readLyricOffset(trackId));
    if (lyricCache.current.has(trackId)) {
      setLyrics(lyricCache.current.get(trackId) ?? null);
      setLyricsLoading(false);
      return;
    }
    let cancelled = false;
    const track = currentTrack;
    setLyrics(null); setLyricsLoading(true);
    // Title/artist/duration are only used for the third-party fallback match, never for playback.
    void window.desktop.music.lyrics({
      trackId,
      title: track?.title,
      artist: track?.artists.map(artist => artist.name).join(' / '),
      album: track?.album?.title,
      durationSeconds: track?.durationSeconds,
    }).then(result => {
      if (cancelled) return;
      const doc = result.ok ? result.data : null;
      lyricCache.current.set(trackId, doc);
      setLyrics(doc); setLyricsLoading(false);
    }).catch(() => {
      if (cancelled) return;
      lyricCache.current.set(trackId, null);
      setLyrics(null); setLyricsLoading(false);
    });
    return () => { cancelled = true; };
  }, [lyricsOpen, stageOpen, auxOpen.lyrics, auxOpen.mini, currentTrack?.id, lyricRevision]);

  async function importLocalLyrics() {
    const trackId = currentTrack?.id;
    if (!trackId) return;
    const result = await window.desktop.lyrics.importLocal(trackId).catch(() => null);
    if (!result) { setMessage('导入失败，请重试。'); return; }
    if (!result.ok) { setMessage(result.error.message); return; }
    if (!result.data) return; // cancelled
    lyricCache.current.set(trackId, result.data);
    setLyrics(result.data);
    setMessage(`已导入本地歌词（${result.data.lines.length} 行）。`);
  }

  async function removeLocalLyrics() {
    const trackId = currentTrack?.id;
    if (!trackId) return;
    const result = await window.desktop.lyrics.removeLocal(trackId).catch(() => null);
    if (!result?.ok) { setMessage('移除失败，请重试。'); return; }
    lyricCache.current.delete(trackId);
    setLyrics(null);
    setMessage(result.data.removed ? '已移除本地歌词，改为读取云端歌词。' : '当前歌曲没有本地歌词。');
    setLyricRevision(value => value + 1);
  }

  function applySettings(next: AppSettings) {
    setSettings(next);
    setVolume(next.volume);
    volumeRef.current = next.volume;
    setQuality(next.quality);
    qualityRef.current = next.quality;
    setRepeatMode(next.repeatMode);
    repeatRef.current = next.repeatMode;
    setShuffle(next.shuffle);
    syncHistoryRef.current = next.syncHistory;
    // The audio element may not exist yet on the first call; the ref is what every later source
    // swap reads, so restoring it here is enough for the speed to survive a restart. The guard
    // keeps this idempotent: changePlaybackRate already applied the value before persisting it.
    setPlaybackRate(next.playbackRate);
    playbackRateRef.current = next.playbackRate;
    if (audio.current && audio.current.playbackRate !== next.playbackRate) audio.current.playbackRate = next.playbackRate;
  }

  function identityOrder(count: number): number[] { return Array.from({ length: count }, (_, index) => index); }

  /** Anchors the portalled account menu to the sidebar foot, keeping it inside the window. */
  function toggleAccountMenu() {
    if (accountMenuOpen) { setAccountMenuOpen(false); return; }
    const rect = footRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMenuPos({
      left: Math.max(8, Math.min(rect.left, window.innerWidth - 190)),
      bottom: Math.max(8, window.innerHeight - rect.top + 6),
    });
    setAccountMenuOpen(true);
  }

  // Closes the account menu on any click that is not inside it or on its own trigger. This replaces
  // the full-screen backdrop, which used to cover the sidebar and eat the collapse-toggle click.
  useEffect(() => {
    if (!accountMenuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (accountMenuRef.current?.contains(target)) return;
      if (footRef.current?.contains(target)) return;
      setAccountMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setAccountMenuOpen(false); };
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [accountMenuOpen]);

  function recordLocalHistory(track: Track) {
    setLocalHistory(previous => {
      const next = [track, ...previous.filter(item => item.id !== track.id)].slice(0, HISTORY_LIMIT);
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch { /* Storage is best effort. */ }
      return next;
    });
  }

  async function playAt(nextCursor: number, retryCount = 0, options: { fromHistory?: boolean } = {}) {
    const track = queueRef.current[order.current[nextCursor]];
    if (!track || !audio.current) return;
    if (!options.fromHistory) {
      const previous = cursorRef.current;
      if (previous >= 0 && previous !== nextCursor && previous < order.current.length) {
        playHistory.current = pushPlayHistory(playHistory.current, previous);
      }
    }
    listenSeconds.current = 0;
    lastListenAt.current = 0;
    historyReported.current = false;
    const generation = ++playbackGeneration.current;
    activeAudioGeneration.current = generation;
    activeAudioSource.current = '';
    mediaRetryCount.current = retryCount;
    isResolvingTrack.current = true;
    audio.current.pause(); audio.current.removeAttribute('src'); audio.current.load();
    setPlaying(false); setBuffering(true); setPosition(0); setDuration(0); setActualQuality('unknown');
    cursorRef.current = nextCursor;
    setCursor(nextCursor);
    setMessage(`正在获取「${track.title}」的播放资源…`);
    let result: Result<Playback>;
    try {
      result = await window.desktop.music.resolvePlayback({ trackId: track.id, quality: qualityRef.current });
    } catch {
      if (generation === playbackGeneration.current) { isResolvingTrack.current = false; setBuffering(false); setMessage('获取播放资源失败，请重试。'); }
      return;
    }
    if (generation !== playbackGeneration.current) return;
    isResolvingTrack.current = false;
    if (!result.ok) { setBuffering(false); setMessage(result.error.message); return; }
    activeAudioSource.current = new URL(result.data.url).href;
    activeAudioGeneration.current = generation;
    audio.current.src = activeAudioSource.current;
    // Some Chromium builds reset the rate when a new source is loaded, so it is reapplied here too.
    audio.current.playbackRate = playbackRateRef.current;
    audio.current.load();
    setActualQuality(result.data.actualQuality);
    try {
      await audio.current.play();
      if (generation !== playbackGeneration.current) return;
      setMessage(`已开始 ${track.title} · ${result.data.actualQuality === 'lossless' ? '无损' : result.data.actualQuality === 'standard' ? '标准' : '服务端未确认音质'}`);
    } catch {
      if (generation !== playbackGeneration.current) return;
      activeAudioSource.current = '';
      audio.current.pause(); audio.current.removeAttribute('src'); audio.current.load();
      setBuffering(false); setPlaying(false); setDuration(0); setActualQuality('unknown');
      setMessage('浏览器未能开始播放，请检查网络或重试。');
    }
  }
  playAtRef.current = playAt;

  // Best-effort history sync: silent on failure, at most once per playback, real seconds only.
  function reportPlayback() {
    if (!syncHistoryRef.current || historyReported.current) return;
    const track = queueRef.current[order.current[cursorRef.current]];
    if (!track) return;
    const element = audio.current;
    const duration = element && Number.isFinite(element.duration) ? element.duration : 0;
    const decision = historyReportDecision({ listenedSeconds: listenSeconds.current, durationSeconds: duration, alreadyReported: false }) as { report: boolean; seconds: number };
    if (!decision.report) return;
    // Marked before the request so repeated timeupdate events cannot send twice.
    historyReported.current = true;
    void window.desktop.music.reportPlayback({
      trackId: track.id, title: track.title, listenedSeconds: decision.seconds,
      ...(duration > 0 ? { songDurationSeconds: Math.ceil(duration) } : {}),
    }).catch(() => undefined);
  }
  reportHistoryRef.current = reportPlayback;

  function play(tracks: Track[], index: number) {
    if (!tracks.length) return;
    pendingSeek.current = null;
    playHistory.current = [];
    queueRef.current = tracks;
    const nextOrder = shuffle ? buildShuffleOrder(tracks.length, index) : identityOrder(tracks.length);
    order.current = nextOrder;
    const nextCursor = nextOrder.indexOf(index);
    cursorRef.current = nextCursor < 0 ? 0 : nextCursor;
    setQueue(tracks);
    setCursor(cursorRef.current);
    void playAt(cursorRef.current);
  }

  /**
   * Moves one queue entry. `order` holds queue indices, so the whole array is remapped through the
   * same splice instead of being rebuilt — rebuilding would silently reshuffle playback.
   */
  function reorderQueue(from: number, to: number) {
    const current = queueRef.current;
    if (from === to || from < 0 || to < 0 || from >= current.length || to >= current.length) return;
    const next = [...current];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    const oldOrder = [...current.keys()];
    const [movedIndex] = oldOrder.splice(from, 1);
    oldOrder.splice(to, 0, movedIndex);
    const oldToNew = new Map(oldOrder.map((oldIndex, newIndex) => [oldIndex, newIndex]));
    order.current = order.current.map(index => oldToNew.get(index) ?? index);
    queueRef.current = next;
    setQueue(next);
    setCursor(cursorRef.current);
  }

  function togglePlayback() {
    if (!audio.current || !order.current.length) return;
    if (!audio.current.paused) audio.current.pause();
    else if (!activeAudioSource.current || audio.current.error) void playAt(cursorRef.current);
    else void audio.current.play().catch(() => setMessage('播放失败，请重新获取资源。'));
  }

  function goNext() {
    const step = stepCursor(cursorRef.current, order.current.length, 1, repeatRef.current);
    if (step.stopped) return;
    pendingSeek.current = null;
    void playAt(step.cursor);
  }
  function goPrevious() {
    // In shuffle mode 上一首 follows what was actually played instead of the shuffled index order.
    if (shuffle && playHistory.current.length) {
      const { cursor: target, history } = popPlayHistory(playHistory.current) as { cursor: number | null; history: number[] };
      playHistory.current = history;
      if (target !== null) { pendingSeek.current = null; void playAt(target, 0, { fromHistory: true }); return; }
    }
    const step = stepCursor(cursorRef.current, order.current.length, -1, repeatRef.current);
    if (step.stopped) return;
    pendingSeek.current = null;
    void playAt(step.cursor);
  }

  playCommand.current = {
    toggle: togglePlayback,
    next: goNext,
    previous: goPrevious,
    // Clamped in one place so a held-down chord cannot push the slider past either end.
    volume: delta => setVolume(current => Math.min(1, Math.max(0, Math.round((current + delta) * 100) / 100))),
    // The overlay's heart goes through the same guard as the list rows, so a double click cannot
    // race two writes for one track.
    toggleFavorite: () => { if (currentTrack) void toggleFavorite(currentTrack, !favoriteOf(currentTrack.id)); },
  };

  function previewSeek(value: number) { seeking.current = true; seekTarget.current = value; setPosition(value); }
  function commitSeek() {
    const target = seekTarget.current;
    seeking.current = false;
    seekTarget.current = null;
    if (target !== null && audio.current && duration > 0) audio.current.currentTime = Math.min(target, duration);
  }

  // Jumping audio directly (lyric line clicks, stage scrubber) bypasses the preview/commit dance.
  function seekAudio(seconds: number) {
    if (!audio.current || !duration) return;
    const target = Math.max(0, Math.min(seconds, duration));
    seeking.current = false;
    seekTarget.current = null;
    audio.current.currentTime = target;
    lastListenAt.current = target;
    setPosition(target);
  }
  function seekToLyric(timeMs: number) { seekAudio(timeMs / 1000 - lyricOffset); }

  // Offset is a per-track preference; the shared value seeds the next unheard track.
  function changeLyricOffset(delta: number) {
    const next = Math.max(-LYRIC_OFFSET_LIMIT, Math.min(LYRIC_OFFSET_LIMIT, Math.round((lyricOffset + delta) * 10) / 10));
    setLyricOffset(next);
    try {
      const trackId = currentTrack?.id;
      if (trackId) localStorage.setItem(`${LYRIC_OFFSET_KEY}:${trackId}`, String(next));
      localStorage.setItem(LYRIC_OFFSET_KEY, String(next));
    } catch { /* Preference storage is best effort. */ }
  }

  async function updateSettings(patch: Partial<AppSettings>) {
    const result = await window.desktop.settings.update(patch).catch(() => null);
    if (result?.ok) {
      if (patch.shuffle !== undefined && patch.shuffle !== shuffle) {
        const active = order.current[cursorRef.current] ?? 0;
        order.current = patch.shuffle ? buildShuffleOrder(queueRef.current.length, active) : identityOrder(queueRef.current.length);
        cursorRef.current = Math.max(0, order.current.indexOf(active));
        setCursor(cursorRef.current);
        playHistory.current = [];
      }
      applySettings(result.data);
      return true;
    }
    setMessage('设置保存失败，请重试。');
    return false;
  }

  // Shuffle and repeat are stored separately but behave as one choice: a player bar with two
  // buttons about order makes the fourth state unreachable, which is exactly what the user hit.
  const playMode: PlayMode = shuffle ? 'shuffle' : repeatMode;
  function applyShuffle(next: boolean) {
    const activeIndex = order.current[cursorRef.current] ?? 0;
    const nextOrder = next ? buildShuffleOrder(queueRef.current.length, activeIndex) : identityOrder(queueRef.current.length);
    order.current = nextOrder;
    const nextCursor = nextOrder.indexOf(activeIndex);
    cursorRef.current = nextCursor < 0 ? 0 : nextCursor;
    setCursor(cursorRef.current);
    setShuffle(next);
    playHistory.current = [];
  }
  function cyclePlayMode() {
    const next: PlayMode = playMode === 'off' ? 'shuffle'
      : playMode === 'shuffle' ? 'all'
      : playMode === 'all' ? 'one' : 'off';
    applyShuffle(next === 'shuffle');
    const nextRepeat = next === 'shuffle' ? 'off' : next;
    setRepeatMode(nextRepeat); repeatRef.current = nextRepeat;
    void updateSettings({ shuffle: next === 'shuffle', repeatMode: nextRepeat });
    setMessage(next === 'off' ? '顺序播放。' : next === 'shuffle' ? '随机播放（乱序）。' : next === 'all' ? '列表循环。' : '单曲循环。');
  }
  function toggleQuality() {
    const next = quality === 'standard' ? 'lossless' : 'standard';
    setQuality(next); qualityRef.current = next;
    void updateSettings({ quality: next });
    setMessage(next === 'lossless' ? '已切换为无损（下次取链生效）。' : '已切换为标准音质。');
  }
  const lastAudibleVolume = useRef(0.85);
  function changeVolume(value: number) {
    if (value > 0) lastAudibleVolume.current = value;
    setVolume(value); volumeRef.current = value;
    void window.desktop.settings.update({ volume: value }).catch(() => undefined);
  }
  function toggleMute() {
    changeVolume(volume > 0 ? 0 : (lastAudibleVolume.current || 0.85));
  }

  function changePlaybackRate(rate: number) {
    playbackRateRef.current = rate;
    setPlaybackRate(rate);
    if (audio.current) audio.current.playbackRate = rate;
    void updateSettings({ playbackRate: rate });
    setMessage(rate === 1 ? '恢复正常速度。' : `播放速度 ${rate}x。`);
  }

  function setSleepTimer(minutes: number) {
    if (minutes === -1) {
      setSleepDeadline(null); setSleepRemaining(0);
      sleepAfterTrackRef.current = true; setSleepAfterTrack(true);
      setMessage('将在当前歌曲播完后暂停。');
      return;
    }
    sleepAfterTrackRef.current = false; setSleepAfterTrack(false);
    if (!minutes) { setSleepDeadline(null); setSleepRemaining(0); setMessage('已取消睡眠定时。'); return; }
    setSleepDeadline(Date.now() + minutes * 60_000);
    setSleepRemaining(minutes * 60);
    setMessage(`将在 ${minutes} 分钟后暂停播放。`);
  }

  // One interval drives both the countdown label and the expiry, so the timer cannot drift out of
  // sync with what the menu shows.
  useEffect(() => {
    if (sleepDeadline === null) return;
    const tick = () => {
      const left = Math.max(0, Math.round((sleepDeadline - Date.now()) / 1000));
      setSleepRemaining(left);
      if (left > 0) return;
      setSleepDeadline(null);
      audio.current?.pause();
      setMessage('睡眠定时结束，已暂停播放。');
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [sleepDeadline]);

  // Shortcuts every desktop player shares. Text fields are skipped so typing a search query never
  // starts playback, and the audio element is read directly here because this listener is attached
  // once — a closure over `duration` would still see the first render's zero.
  useEffect(() => {
    // Any focusable control keeps its own arrow/space behaviour: a range input steps by one notch and
    // a select opens its list, so a global shortcut here would break the very widgets it sits next to.
    const isFormControl = (target: EventTarget | null) => {
      const element = target as HTMLElement | null;
      if (!element) return false;
      if (element.isContentEditable) return true;
      return element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.tagName === 'SELECT';
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey) return;
      const withCommand = event.ctrlKey || event.metaKey;
      if (withCommand && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        setView({ name: 'search' });
        // The page mounts after this handler returns, so focus is queued behind the render.
        window.setTimeout(() => document.querySelector<HTMLInputElement>('input[aria-label="搜索歌曲"]')?.focus(), 0);
        return;
      }
      const element = audio.current;
      if (event.key === ' ') {
        // A focused button already treats Space as "press me"; hijacking it would break the keyboard.
        if (isFormControl(event.target) || (event.target as HTMLElement | null)?.tagName === 'BUTTON') return;
        event.preventDefault();
        playCommand.current.toggle();
        return;
      }
      if (isFormControl(event.target)) return;
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        const forward = event.key === 'ArrowRight';
        if (withCommand) { if (forward) playCommand.current.next(); else playCommand.current.previous(); return; }
        if (!element || !Number.isFinite(element.duration) || element.duration <= 0) return;
        element.currentTime = Math.max(0, Math.min(element.duration, element.currentTime + (forward ? 5 : -5)));
        lastListenAt.current = element.currentTime;
        setPosition(element.currentTime);
        return;
      }
      // The global chord is unavailable when another program already owns it, so the same
      // combination is handled in-window as a fallback: focused app, working shortcut.
      if ((event.ctrlKey || event.metaKey) && event.altKey && event.key.toLowerCase() === 'l') {
        event.preventDefault();
        void window.desktop.player.setLyricsAppearance({ locked: !lyricsAppearanceRef.current });
        return;
      }
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault();
        const step = event.key === 'ArrowUp' ? 0.05 : -0.05;
        changeVolume(Math.max(0, Math.min(1, volumeRef.current + step)));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Read by the in-window shortcut, which lives in an effect that must not re-subscribe on every
  // appearance change.
  const lyricsAppearanceRef = useRef(false);
  useEffect(() => { lyricsAppearanceRef.current = !!settings?.lyricsLocked; }, [settings?.lyricsLocked]);

  function favoriteOf(trackId: string): boolean | undefined { return knownFavoriteIds.has(trackId) ? favoriteIds.has(trackId) : undefined; }
  function setFavoriteState(trackId: string, favorite: boolean) {
    setKnownFavoriteIds(previous => new Set(previous).add(trackId));
    setFavoriteIds(previous => {
      const next = new Set(previous);
      if (favorite) next.add(trackId); else next.delete(trackId);
      return next;
    });
  }
  async function toggleFavorite(track: Track, favorite: boolean) {
    if (favoritePending.current.has(track.id)) return;
    favoritePending.current.add(track.id);
    try {
      if (favoriteOf(track.id) === undefined) {
        const before = await run(() => window.desktop.music.favoriteState({ trackId: track.id }), '无法核对收藏状态，请重试。');
        if (!before) return;
        setFavoriteState(track.id, before.favorite);
        favorite = !before.favorite;
      }
      const result = await run(() => window.desktop.music.setFavorite({ trackId: track.id, favorite }), '收藏结果待确认，请刷新核对，不要重复提交。');
      if (!result) return;
      setFavoriteState(track.id, result.favorite);
      setFavoriteChange(previous => ({ trackId: track.id, favorite: result.favorite, revision: (previous?.revision ?? 0) + 1 }));
      setMessage(result.favorite ? `已收藏「${track.title}」。` : `已取消收藏「${track.title}」。`);
    } finally { favoritePending.current.delete(track.id); }
  }

  useEffect(() => {
    if (!currentTrack || !status?.authenticated || knownFavoriteIds.has(currentTrack.id)) return;
    let cancelled = false;
    void window.desktop.music.favoriteState({ trackId: currentTrack.id }).then(result => {
      if (!cancelled && result.ok) setFavoriteState(currentTrack.id, result.data.favorite);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [currentTrack?.id, status]);

  async function login() {
    setBusy(true); setLoginOpen(true); setMessage('正在准备官方登录…');
    try {
      const result = await window.desktop.auth.login().catch(() => null);
      if (result?.ok) {
        resetPersonalState();
        setStatus(result.data); setView({ name: 'favorites' }); setMessage('登录成功。');
      }
      else if (result) setMessage(result.error.message);
      else setMessage('登录未完成，请检查应用状态后重试。');
    } finally { setLoginOpen(false); setBusy(false); }
  }

  // The official page runs inside the main window, so cancellation is an explicit app action.
  async function cancelLogin() {
    const result = await window.desktop.auth.cancelLogin().catch(() => null);
    if (result?.ok) setMessage('正在取消登录…');
    else setMessage(result?.error.message ?? '取消登录失败，请重试。');
  }

  function resetPersonalState() {
    setAccountVersion(previous => previous + 1); setFavoriteChange(null);
    playbackGeneration.current += 1;
    pendingSeek.current = null;
    listenSeconds.current = 0; lastListenAt.current = 0; historyReported.current = false; playHistory.current = [];
    window.clearTimeout(saveTimer.current); window.clearTimeout(positionTimer.current);
    positionRef.current = 0;
    activeAudioGeneration.current = playbackGeneration.current;
    activeAudioSource.current = '';
    isResolvingTrack.current = false;
    queueRef.current = []; order.current = []; cursorRef.current = -1;
    setQueue([]); setCursor(-1); setFavoriteIds(new Set()); setKnownFavoriteIds(new Set()); favoritePending.current.clear();
    audio.current?.pause(); audio.current?.removeAttribute('src'); audio.current?.load();
    setPlaying(false); setBuffering(false); setPosition(0); setDuration(0); setActualQuality('unknown');
    setLyrics(null); setLyricsOpen(false); setQueueOpen(false); setLocalHistory([]);
    try { localStorage.removeItem(HISTORY_KEY); } catch { /* Do not expose storage internals. */ }
  }

  async function logout() {
    setBusy(true);
    const result = await window.desktop.auth.logout().catch(() => null);
    setBusy(false);
    if (!result?.ok) { setMessage(result?.error.message ?? '退出失败，本机登录状态未更改。请重试。'); return; }
    resetPersonalState();
    setStatus({ authenticated: false, persistence: 'unavailable' });
    setView({ name: 'favorites' });
    setMessage('已退出本机账号。');
  }

  function openPlaylist(playlist: Playlist) { setView({ name: 'playlist', playlist }); }
  function closePlaylist() { setView({ name: 'playlists' }); }

  // The helper windows live in the main process, so their open state is read back from the invoke
  // result rather than assumed; a failed open must not leave the button stuck in the pressed state.
  async function toggleAux(kind: 'mini' | 'lyrics') {
    try {
      const open = await window.desktop.player.toggleAux(kind);
      setAuxOpen(current => ({ ...current, [kind]: open }));
    } catch {
      setMessage('辅助窗口打开失败，请重试。');
    }
  }

  // The tray menu can open a helper window without this component asking, so the open state is
  // pushed from the main process instead of being tracked only from local clicks.
  useEffect(() => window.desktop.player.onAuxState(state => {
    setAuxOpen(current => (current[state.kind] === state.open ? current : { ...current, [state.kind]: state.open }));
  }), []);

  // The helper windows are pure mirrors: the main window is the only publisher, and it publishes on
  // every state change and time update, so the receivers never poll.
  useEffect(() => {
    const lines = lyrics?.lines ?? [];
    const active = lyrics?.synced && lines.length ? activeLyricIndex(lines, position * 1000) : -1;
    window.desktop.player.broadcast({
      title: currentTrack?.title ?? '',
      artists: currentTrack?.artists.map(artist => artist.name).join(' / ') ?? '',
      ...(currentTrack?.coverUrl ? { coverUrl: currentTrack.coverUrl } : {}),
      playing, position, duration,
      lyrics: lines.map(line => ({
        text: line.text,
        timeMs: line.timeMs,
        ...(line.translation ? { translation: line.translation } : {}),
        ...(line.segments ? { segments: line.segments } : {}),
      })),
      lyricIndex: typeof active === 'number' ? active : -1,
      favorited: currentTrack ? favoriteOf(currentTrack.id) === true : false,
    });
  }, [currentTrack, playing, position, duration, lyrics, favoriteIds]);

  // Both insertion helpers keep `order` a permutation of queue indexes: shifting every later entry
  // by one is what keeps the currently playing track playing instead of jumping elsewhere.
  function playNext(track: Track) {
    const at = cursorRef.current;
    const playingIndex = at >= 0 && at < order.current.length ? order.current[at] : -1;
    const insertAt = playingIndex < 0 ? queueRef.current.length : playingIndex + 1;
    const nextQueue = [...queueRef.current];
    nextQueue.splice(insertAt, 0, track);
    const nextOrder = order.current.map(index => (index >= insertAt ? index + 1 : index));
    nextOrder.splice(at < 0 ? nextOrder.length : at + 1, 0, insertAt);
    queueRef.current = nextQueue;
    order.current = nextOrder;
    setQueue(nextQueue);
    setMessage(`已排到下一首：${track.title}`);
  }

  function enqueue(track: Track) {
    const insertAt = queueRef.current.length;
    queueRef.current = [...queueRef.current, track];
    order.current = [...order.current, insertAt];
    setQueue(queueRef.current);
    setMessage(`已加入队列：${track.title}`);
  }

  const ctx: LibraryContext = {
    busy, setBusy, notice, run, setFavoriteState, updateSettings,
    currentTrackId: currentTrack?.id ?? null,
    playing,
    favoriteOf,
    play,
    playNext,
    enqueue,
    toggleFavorite,
    openAlbum: albumId => setView({ name: 'album', albumId }),
    openArtist: artistId => setView({ name: 'artist', artistId }),
    openPlaylist,
    closePlaylist,
    setCloseBehavior: value => {
      void window.desktop.window.setCloseBehavior(value).then(result => {
        if (result.ok) { applySettings(result.data); setMessage(value === 'tray' ? '关闭窗口时将最小化到托盘。' : '关闭窗口时将退出程序。'); }
        else setMessage('设置保存失败，请重试。');
      }).catch(() => setMessage('设置保存失败，请重试。'));
    },
    settings, queue: { tracks: queue, index: cursor >= 0 && cursor < order.current.length ? order.current[cursor] : 0, positionSeconds: position },
    localHistory, favoriteChange,
    setLyricsAppearance: patch => window.desktop.player.setLyricsAppearance(patch).then(result => {
      // Apply what the main process actually accepted instead of re-reading settings: the write is
      // fire-and-forget, so an immediate read raced it and the settings page kept showing the old
      // colour while the overlay had already changed.
      if (!result.ok) { setMessage('桌面歌词设置未生效，请重试。'); return; }
      const applied = result.data;
      setSettings(prev => prev ? {
        ...prev,
        lyricsOpacity: applied.opacity, lyricsLocked: applied.locked, lyricsFontSize: applied.fontSize,
        lyricsColor: applied.color, lyricsPendingColor: applied.pendingColor,
      } : prev);
    }).catch(() => setMessage('桌面歌词设置未生效，请重试。')),
  };

  const navItems: { key: keyof typeof NAV_ICONS; label: string }[] = [
    { key: 'discover', label: '发现' },
    { key: 'favorites', label: '我的收藏' },
    { key: 'playlists', label: '我的歌单' },
    { key: 'search', label: '搜索' },
    { key: 'history', label: '播放历史' },
    { key: 'settings', label: '设置' },
  ];

  function renderPage() {
    switch (view.name) {
      case 'discover': return <DiscoverPage ctx={ctx} />;
      case 'favorites': return null;
      case 'playlists': return <PlaylistsPage ctx={ctx} />;
      case 'playlist': return <PlaylistDetailPage ctx={ctx} playlist={view.playlist} />;
      case 'search': return <SearchPage ctx={ctx} />;
      case 'history': return <HistoryPage ctx={ctx} />;
      case 'settings': return <SettingsPage ctx={ctx} />;
      case 'album': return <AlbumPage ctx={ctx} albumId={view.albumId} />;
      case 'artist': return <ArtistPage ctx={ctx} artistId={view.artistId} />;
    }
  }

  const panelOpen = lyricsOpen || queueOpen;
  const viewHint =
    view.name === 'discover' ? '每天从你收藏的歌手换一批歌'
      : view.name === 'favorites' ? '收藏的全部歌曲，向下滚动自动加载'
      : view.name === 'playlists' ? '自建、收藏与榜单'
        : view.name === 'search' ? '按歌名或艺人查找'
          : view.name === 'history' ? '本机记录与华为服务端记录'
            : view.name === 'settings' ? '播放、界面与隐私偏好'
              : '';
  const sidebarCollapsed = !!settings?.sidebarCollapsed;
  return <div className={`app-shell ${panelOpen ? 'has-panel' : ''} ${sidebarCollapsed ? 'sidebar-collapsed' : 'sidebar-expanded'}`}>
    <div className="titlebar-drag" aria-hidden="true" />
    <aside className="sidebar">
      <div className="brand-row">
        <div className="brand">
          <span className="brand-mark"><Headphones size={19} /></span>
          <span className="brand-name">{APP_BRAND_LABEL}</span>
        </div>
        <button className="sidebar-toggle" type="button"
          aria-label={sidebarCollapsed ? '展开侧栏' : '收起侧栏'}
          aria-expanded={!sidebarCollapsed}
          title={sidebarCollapsed ? '展开侧栏' : '收起侧栏'}
          onClick={() => void updateSettings({ sidebarCollapsed: !sidebarCollapsed })}>
          {sidebarCollapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
        </button>
      </div>
      <div className="nav-label">音乐库</div>
      {navItems.map(item => {
        const Icon = NAV_ICONS[item.key];
        return <button key={item.key}
          className={`nav-item ${view.name === item.key || (item.key === 'playlists' && view.name === 'playlist') ? 'active' : ''}`}
          title={item.label}
          onClick={() => setView({ name: item.key } as View)}>
          <Icon size={16} /><span>{item.label}</span>
        </button>;
      })}
      {/* The account entry lives here, where desktop players put it, so signing in never depends on
          finding a button in the page header. Signing out is destructive (a fresh QR scan), so it is
          behind this menu rather than being the default action of the row itself. The menu is
          portalled to the body: the collapsed sidebar is a 76px rail with `overflow: auto`, which
          would otherwise clip a menu that is wider than the rail. */}
      <div className="sidebar-account">
        <button className="sidebar-foot" ref={footRef}
          onClick={() => status?.authenticated ? toggleAccountMenu() : void login()}
          disabled={busy}
          // The visible label is a status line, which is not what the button does. Naming it by its
          // action keeps it addressable as "扫码登录" / "账号菜单" wherever the entry point moves to.
          aria-label={status?.authenticated ? '账号菜单' : '扫码登录'}
          aria-haspopup={status?.authenticated ? 'menu' : undefined}
          aria-expanded={status?.authenticated ? accountMenuOpen : undefined}
          title={status?.authenticated ? '账号' : '扫码登录'}>
          <span className={`status-dot ${status?.authenticated ? '' : 'off'}`} />
          <span className="foot-label">{status?.authenticated
            ? (status.accountLabel ?? status.displayName ?? '音乐会话已连接')
            : '未登录 · 点此登录'}</span>
          {status?.authenticated
            ? <ChevronUp size={13} className="foot-icon" />
            : <LogIn size={13} className="foot-icon" />}
        </button>
        {accountMenuOpen && menuPos && createPortal(<>
          {/* No full-screen backdrop: it sat above the sidebar and swallowed clicks meant for the
              collapse toggle. A window-level pointerdown listener closes the menu instead, so the
              rest of the window stays clickable while the menu is open. */}
          <div className="account-menu" role="menu" aria-label="账号" ref={accountMenuRef}
            style={{ left: menuPos.left, bottom: menuPos.bottom }}>
            <p className="account-id" title="账号标识已脱敏，只显示后四位">
              {status?.displayName ?? '华为账号'}
              {status?.accountLabel && <span>{status.accountLabel}</span>}
            </p>
            <button role="menuitem" onClick={() => { setAccountMenuOpen(false); setView({ name: 'settings' }); }}>
              <SettingsIcon size={14} />账号与设置
            </button>
            <button role="menuitem" disabled={busy} onClick={() => { setAccountMenuOpen(false); void login(); }}>
              <LogIn size={14} />重新登录
            </button>
            <button role="menuitem" className="danger" disabled={busy} onClick={() => { setAccountMenuOpen(false); void logout(); }}>
              <LogOut size={14} />退出登录
            </button>
          </div>
        </>, document.body)}
      </div>
    </aside>
    <main className="main-content">
      <header className="topbar">
        <div>
          <p className="eyebrow">{VIEW_EYEBROWS[view.name]}</p>
          <h1>{VIEW_TITLES[view.name]}</h1>
          <p className="page-sub">{status?.authenticated || view.name === 'settings' ? viewHint : '登录后即可浏览你的音乐库'}</p>
        </div>
      </header>
      <div className="notice" role="status" aria-live="polite">{message}{status?.notice && <span> · {status.notice}</span>}</div>
      {!status?.authenticated && view.name !== 'settings'
        ? <section className="empty-state">
          <div className="empty-art"><Headphones size={30} /></div>
          <h2>连接你的音乐库</h2>
          <p>通过华为官方页面扫码登录。授权页使用公开兼容性研究中的 OAuth 应用标识，并非本项目注册身份；请先核对页面显示的应用和权限，再决定是否继续。账号令牌只在主进程处理。</p>
          <button className="primary large" onClick={login} disabled={busy}>打开官方登录</button>
        </section>
        : renderPage()}
      {status?.authenticated && <FavoritesPage key={accountVersion} ctx={ctx} active={view.name === 'favorites'} />}
    </main>
    {loginOpen && <div className="login-bar" role="status">
      <span>正在官方页面完成扫码授权，完成后自动返回。</span>
      <button className="ghost" onClick={() => void cancelLogin()}>取消登录</button>
    </div>}
    {lyricsOpen && <LyricsPanel
      doc={lyrics}
      loading={lyricsLoading}
      positionSeconds={position}
      offsetSeconds={lyricOffset}
      onSeekTo={seekToLyric}
      onOpenStage={() => setStageOpen(true)}
      onImport={() => void importLocalLyrics()}
      onRemoveLocal={() => void removeLocalLyrics()}
      onClose={() => setLyricsOpen(false)}
    />}
    {queueOpen && <QueuePanel tracks={queue} currentId={currentTrack?.id ?? null} onSelect={queueIndex => { const at = order.current.indexOf(queueIndex); void playAt(at < 0 ? 0 : at); }}
      onReorder={reorderQueue} onClose={() => setQueueOpen(false)} />}
    {stageOpen && <LyricsStage
      track={currentTrack}
      doc={lyrics}
      loading={lyricsLoading}
      positionSeconds={position}
      offsetSeconds={lyricOffset}
      playing={playing}
      duration={duration}
      disabled={!queue.length}
      onSeekTo={seekToLyric}
      onSeekSeconds={seekAudio}
      onToggle={togglePlayback}
      onPrevious={goPrevious}
      onNext={goNext}
      onOffset={changeLyricOffset}
      onImport={() => void importLocalLyrics()}
      onRemoveLocal={() => void removeLocalLyrics()}
      onClose={() => setStageOpen(false)}
    />}
    <PlayerBar
      track={currentTrack}
      playing={playing}
      buffering={buffering}
      position={position}
      duration={duration}
      volume={volume}
      quality={quality}
      actualQuality={actualQuality}
      disabled={!queue.length}
      onToggle={togglePlayback}
      onPrevious={goPrevious}
      onNext={goNext}
      onSeekPreview={previewSeek}
      onSeekCommit={commitSeek}
      onVolume={changeVolume}
      playbackRate={playbackRate}
      onPlaybackRate={changePlaybackRate}
      sleepRemaining={sleepDeadline === null ? null : sleepRemaining}
      sleepAfterTrack={sleepAfterTrack}
      onSleepTimer={setSleepTimer}
      onToggleMute={toggleMute}
      onToggleQuality={toggleQuality}
      playMode={playMode}
      onCyclePlayMode={cyclePlayMode}
      onToggleLyrics={() => setLyricsOpen(value => { if (!value) setQueueOpen(false); return !value; })}
      onToggleQueue={() => setQueueOpen(value => { if (!value) setLyricsOpen(false); return !value; })}
      onOpenStage={() => setStageOpen(true)}
      lyricsOpen={lyricsOpen}
      queueOpen={queueOpen}
      queueCount={queue.length}
      miniOpen={auxOpen.mini}
      desktopLyricsOpen={auxOpen.lyrics}
      onToggleMini={() => void toggleAux('mini')}
      onToggleDesktopLyrics={() => void toggleAux('lyrics')}
      favorite={currentTrack ? favoriteOf(currentTrack.id) : undefined}
      onToggleFavorite={() => { if (currentTrack) void toggleFavorite(currentTrack, !favoriteOf(currentTrack.id)); }}
    />
  </div>;
}
