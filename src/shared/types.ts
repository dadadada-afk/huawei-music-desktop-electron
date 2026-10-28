export type ErrorKind = 'auth' | 'permission' | 'network' | 'unsupported' | 'invalid' | 'unknown';
export type AppError = { kind: ErrorKind; message: string; retryable: boolean; code?: string };
export type Result<T> = { ok: true; data: T } | { ok: false; error: AppError };

export type AuthStatus = {
  authenticated: boolean;
  displayName?: string;
  /** Masked account id, so the sidebar can name the signed-in account without exposing it. */
  accountLabel?: string;
  musicExpireTime?: string;
  persistence: 'secure' | 'memory-only' | 'unavailable';
  notice?: string;
};

export type Track = {
  id: string;
  title: string;
  artists: { id?: string; name: string }[];
  album?: { id: string; title: string };
  coverUrl?: string;
  durationSeconds?: number;
  available: boolean;
};

export type FavoritesPage = {
  total?: number;
  cacheHint?: string;
  tracks: Track[];
  nextStart: number;
  hasMore: boolean;
};

export type Playlist = {
  id: string;
  title: string;
  coverUrl?: string;
  count?: number;
  kind: 'owned' | 'collected' | 'chart' | 'unknown';
  description?: string;
};

export type PlaylistList = { playlists: Playlist[]; truncated: boolean; cacheHint?: string; cached?: boolean; cachedAt?: number };
export type PlaylistDetail = { playlist: Playlist; tracks: Track[]; nextStart: number; hasMore: boolean; cacheHint?: string; cached?: boolean; cachedAt?: number };
export type SearchPage = { tracks: Track[]; nextStart: number; hasMore: boolean; total?: number };
export type HistoryPage = { tracks: Track[] };
export type DiscoverArtist = { id: string; name: string; coverUrl?: string; count: number };
export type DiscoverFeed = {
  daily: { tracks: Track[]; day: string; source: 'library' | 'favorites' };
  playlists: Playlist[];
  artists: DiscoverArtist[];
};
export type LyricSegment = { timeMs: number | null; text: string };
export type LyricsLine = {
  timeMs: number | null;
  text: string;
  // Second line sharing this exact timestamp (bilingual LRC layout).
  translation?: string;
  // Word level marks from <mm:ss.xx> tags, when the source provides them.
  segments?: LyricSegment[];
};
export type LyricsSource = 'huawei' | 'kugou' | 'lrclib' | 'local';
export type LyricsDoc = {
  synced: boolean;
  lines: LyricsLine[];
  // Which library answered, and what it matched, so the UI can be honest about third-party lyrics.
  source?: LyricsSource;
  matchedTitle?: string;
  matchedArtist?: string;
};
export type LyricsCacheInfo = { bytes: number; entries: number; localBytes: number; localEntries: number };
export type AlbumDetail = {
  album: { id: string; title: string; coverUrl?: string; count?: number; artists: { id?: string; name: string }[] };
  tracks: Track[];
  nextStart: number;
  hasMore: boolean;
};
export type ArtistDetail = {
  artist: { id: string; name: string; coverUrl?: string };
  tracks: Track[];
  albums: { id: string; title: string; coverUrl?: string; count?: number }[];
};

export type Playback = {
  url: string;
  actualQuality: 'standard' | 'lossless' | 'unknown';
  contentType?: string;
  durationSeconds?: number;
  expiresAt?: string;
};

export type RepeatMode = 'off' | 'all' | 'one';
export type Quality = 'standard' | 'lossless';
export type AccentName = 'red' | 'blue' | 'green' | 'amber' | 'violet' | 'custom';
export type FontChoice = 'sans' | 'serif' | 'mono' | 'custom';

export type AppearanceSettings = {
  accent: AccentName;
  /** 0.55 – 1: how solid the floating glass panels are. */
  panelOpacity: number;
  /** Base corner radius in px; every component radius derives from it. */
  cornerRadius: number;
  /** 0.85 – 1.2 multiplier applied to all text sizes. */
  fontScale: number;
  fontFamily: FontChoice;
  /** Used when accent === 'custom'; sanitized to #rrggbb. */
  customAccent: string;
  /** Used when fontFamily === 'custom'; an installed family name picked from queryLocalFonts(). */
  customFont: string;
};

export type AppSettings = {
  closeBehavior: 'quit' | 'tray';
  quality: Quality;
  volume: number;
  repeatMode: RepeatMode;
  shuffle: boolean;
  appearance: AppearanceSettings;
  // Report real playback to Huawei history. Endpoint shape comes from the public H5 bundle;
  // real-account acceptance is still pending, so failures stay silent and are never retried.
  syncHistory: boolean;
  // Match lyrics from public third-party libraries when the provider returns none.
  thirdPartyLyrics: boolean;
  /** Sidebar shows icons only. Persisted because it is a layout preference, not a transient toggle. */
  sidebarCollapsed: boolean;
  /** Desktop lyric overlay window opacity, 0.3–1. */
  lyricsOpacity: number;
  /** Locked means click-through: the overlay stops capturing the mouse so it never blocks the desktop. */
  lyricsLocked: boolean;
  /** Desktop lyric overlay type size in px, 18–64. */
  lyricsFontSize: number;
  /** Colour of the line being sung, as #rrggbb. Empty means the built-in warm white. */
  lyricsColor: string;
  /**
   * Playback speed. Persisted because a listener who slowed a podcast to 0.75x expects the next
   * launch to still be at 0.75x, not to be silently reset to normal speed.
   */
  playbackRate: number;
  /**
   * Colour scheme. 'system' follows the OS setting; 'light' and 'dark' pin the app. Either way the
   * main process only forwards it to nativeTheme.themeSource — CSS does the actual switching.
   */
  theme: 'system' | 'light' | 'dark';
  /**
   * Start with Windows. Honoured through app.setLoginItemSettings, which registers the executable
   * itself; the --hidden argument it passes keeps the launch quiet in the tray.
   */
  launchAtLogin: boolean;
};

export type SavedQueue = {
  tracks: Track[];
  index: number;
  positionSeconds: number;
};

/** Fire-and-forget playback commands from the tray, the media keys and the mini player. */
export type PlayerCommand = 'play-pause' | 'next' | 'previous';

/** The two always-on-top helpers. Neither owns playback; both only mirror the main window. */
export type AuxWindowKind = 'mini' | 'lyrics';

/** Applied state of the desktop lyric overlay. `locked` means click-through. */
export type LyricsAppearance = { opacity: number; locked: boolean; fontSize: number; color: string };

/** What the main window broadcasts so the auxiliary windows can never drift out of sync. */
export type PlayerSnapshot = {
  title: string;
  artists: string;
  coverUrl?: string;
  playing: boolean;
  position: number;
  duration: number;
  /** Plain text per line, already ordered; the receiver picks the active one by index. */
  lyrics: string[];
  lyricIndex: number;
};

export type DesktopApi = {
  auth: {
    status(): Promise<Result<AuthStatus>>;
    login(): Promise<Result<AuthStatus>>;
    logout(): Promise<Result<void>>;
    cancelLogin(): Promise<Result<void>>;
    onProgress(listener: (message: string) => void): () => void;
  };
  music: {
    favorites(input?: { start?: number; limit?: number; refresh?: boolean }): Promise<Result<FavoritesPage>>;
    favoritesSummary(): Promise<Result<{ total: number }>>;
    playlists(input?: { refresh?: boolean }): Promise<Result<PlaylistList>>;
    playlistDetail(input: { id: string; kind: Playlist['kind']; start?: number; limit?: number; refresh?: boolean }): Promise<Result<PlaylistDetail>>;
    search(input: { query: string; start?: number; limit?: number }): Promise<Result<SearchPage>>;
    history(): Promise<Result<HistoryPage>>;
    discover(input?: { refresh?: boolean }): Promise<Result<DiscoverFeed>>;
    album(input: { id: string; start?: number; limit?: number }): Promise<Result<AlbumDetail>>;
    artist(input: { id: string }): Promise<Result<ArtistDetail>>;
    lyrics(input: {
      trackId: string;
      title?: string;
      artist?: string;
      album?: string;
      durationSeconds?: number;
    }): Promise<Result<LyricsDoc>>;
    resolvePlayback(input: { trackId: string; quality: 'standard' | 'lossless' }): Promise<Result<Playback>>;
    reportPlayback(input: { trackId: string; title: string; listenedSeconds: number; songDurationSeconds?: number }): Promise<Result<void>>;
    favoriteState(input: { trackId: string }): Promise<Result<{ favorite: boolean }>>;
    setFavorite(input: { trackId: string; favorite: boolean }): Promise<Result<{ favorite: boolean }>>;
    createPlaylist(input: { name: string; trackIds: string[] }): Promise<Result<{ id?: string }>>;
    updatePlaylistDescription(input: { id: string; description: string }): Promise<Result<{ id: string }>>;
    deletePlaylist(input: { id: string }): Promise<Result<{ id: string }>>;
  };
  settings: {
    get(): Promise<Result<AppSettings>>;
    update(input: Partial<AppSettings>): Promise<Result<AppSettings>>;
  };
  queue: {
    load(): Promise<Result<SavedQueue | null>>;
    save(input: SavedQueue): Promise<Result<void>>;
  };
  window: { minimize(): Promise<void>; setCloseBehavior(input: 'quit' | 'tray'): Promise<Result<AppSettings>> };
  fonts: { list(): Promise<Result<{ families: string[] }>> };
  lyrics: {
    /** Opens a picker; resolves null when the user cancels. */
    importLocal(trackId: string): Promise<Result<LyricsDoc | null>>;
    removeLocal(trackId: string): Promise<Result<{ removed: boolean }>>;
    cacheInfo(): Promise<Result<LyricsCacheInfo>>;
    clearCache(input?: { local?: boolean }): Promise<Result<LyricsCacheInfo>>;
  };
  app: { quit(): Promise<void> };
  player: {
    onCommand(listener: (command: PlayerCommand) => void): () => void;
    /** Main window only: publish the current snapshot to the auxiliary windows. */
    broadcast(state: PlayerSnapshot): void;
    /** Auxiliary windows only: subscribe to snapshots, starting with the current one. */
    onState(listener: (state: PlayerSnapshot | null) => void): () => void;
    /** Auxiliary windows only: ask for the current snapshot once the listener is actually attached. */
    requestState(): void;
    /** Auxiliary windows only: a command back to the window that owns playback. */
    control(command: PlayerCommand): void;
    seek(seconds: number): void;
    /** Main window only: a seek request forwarded from a helper window. */
    onSeek(listener: (seconds: number) => void): () => void;
    /** Opens or closes the given helper window; resolves to whether it is now open. */
    toggleAux(kind: AuxWindowKind): Promise<boolean>;
    /** Main window only: the helper windows can also be opened from the tray, so their state is pushed. */
    onAuxState(listener: (state: { kind: AuxWindowKind; open: boolean }) => void): () => void;
    showMain(): void;
    /** Lock (click-through) and opacity of the desktop lyric overlay; callable from either window. */
    setLyricsAppearance(input: { opacity?: number; locked?: boolean; fontSize?: number; color?: string }): Promise<Result<LyricsAppearance>>;
    /** Lyrics window only: the applied appearance, so the toolbar never shows a stale state. */
    onLyricsAppearance(listener: (state: LyricsAppearance) => void): () => void;
  };
  onNotice(listener: (message: string) => void): () => void;
};

declare global { interface Window { desktop: DesktopApi } }
