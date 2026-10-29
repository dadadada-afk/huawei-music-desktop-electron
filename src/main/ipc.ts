import { app, BrowserWindow, dialog, ipcMain, nativeTheme, net } from 'electron';
import { writeFile } from 'node:fs/promises';
import { safeFileName, toCsv } from './csv.mjs';
import { isSafeResourceUrl } from '../safe-media-url.mjs';
import { titleBarColors } from './titlebar.mjs';
import { shortcutStatus } from './shortcut-status.mjs';
import { channels } from '../shared/channels';
import { AuthManager, isAllowedSender } from './auth-manager';
import { loadQueue, loadSettings, saveQueue, updateSettings } from './storage';
import { listSystemFonts } from './system-fonts';
import { clearLyricsCache, lyricsCacheInfo, readLyricsFile, removeLocalLyrics, writeLocalLyrics } from './lyrics-cache';
import { parseLyrics } from '../lyrics.mjs';
import { fail, ok } from '../shared/result';
import type { AuxWindowKind, LyricsAppearance, LyricsDoc, PlayerCommand, PlayerSnapshot, SavedQueue } from '../shared/types';

export function registerIpc(
  window: BrowserWindow,
  auth: AuthManager,
  hooks: {
    onCloseBehavior?: (value: 'quit' | 'tray') => void;
    onSnapshot?: (state: PlayerSnapshot) => void;
    onCommand?: (command: PlayerCommand) => void;
    onSeek?: (seconds: number) => void;
    onToggleAux?: (kind: AuxWindowKind) => boolean;
    /** Pins or unpins a helper window; returns the state that took effect. */
    onPinAux?: (kind: AuxWindowKind, pinned: boolean) => boolean;
    onShowMain?: () => void;
    /** Applies and persists the desktop lyric overlay appearance; returns the applied state. */
    onLyricsAppearance?: (patch: { opacity?: number; locked?: boolean; fontSize?: number; color?: string }) => LyricsAppearance | null;
    /** Auxiliary windows ask for the current snapshot once their listener is attached. */
    onRequestState?: (sender: Electron.WebContents) => void;
  } = {},
): void {
  const guard = (event: Electron.IpcMainInvokeEvent) => {
    if (!isAllowedSender(window, event)) throw new Error('IPC 来源不受信任');
  };
  // Fire-and-forget channels come from either the main window or one of the helper windows, so the
  // sender is matched by window identity instead of by frame URL.
  const fromWindow = (event: Electron.IpcMainEvent) => {
    const sender = event.sender;
    if (sender === window.webContents) return 'main' as const;
    return BrowserWindow.getAllWindows().some(candidate => candidate.webContents === sender) ? 'aux' as const : null;
  };
  const idOf = (value: unknown) => (typeof value === 'string' && value.trim() && value.length <= 200 ? value.trim() : null);
  for (const channel of Object.values(channels)) ipcMain.removeHandler(channel);
  ipcMain.handle(channels.authStatus, async event => { guard(event); return auth.status(); });
  // The renderer never names a path: the dialog picks it, so a compromised renderer cannot choose
  // where to write. Rows are capped because a 200k-row CSV would freeze the dialog's preview.
  // Covers live on the same allow-listed CDN as audio. Fetching here instead of in the renderer is
  // what keeps the share card's canvas drawable: a cross-origin <img> would taint it.
  ipcMain.handle(channels.shareCover, async (event, input: { url?: unknown } = {}) => {
    guard(event);
    const url = typeof input.url === 'string' ? input.url : '';
    if (!isSafeResourceUrl(url)) return fail({ kind: 'invalid', message: '封面地址不在允许范围内。', retryable: false });
    try {
      const response = await net.fetch(url);
      if (!response.ok) return fail({ kind: 'network', message: '封面下载失败。', retryable: true });
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length > 8 * 1024 * 1024) return fail({ kind: 'invalid', message: '封面文件过大。', retryable: false });
      const type = response.headers.get('content-type') ?? 'image/jpeg';
      if (!type.startsWith('image/')) return fail({ kind: 'invalid', message: '封面不是图片。', retryable: false });
      return ok({ dataUrl: `data:${type};base64,${buffer.toString('base64')}` });
    } catch {
      return fail({ kind: 'network', message: '封面下载失败。', retryable: true });
    }
  });
  ipcMain.handle(channels.shareSave, async (event, input: { dataUrl?: unknown; suggestedName?: unknown } = {}) => {
    guard(event);
    const dataUrl = typeof input.dataUrl === 'string' ? input.dataUrl : '';
    if (!dataUrl.startsWith('data:image/png;base64,') || dataUrl.length > 24 * 1024 * 1024) {
      return fail({ kind: 'invalid', message: '分享图数据无效或过大。', retryable: false });
    }
    const name = typeof input.suggestedName === 'string' ? input.suggestedName : '分享图';
    const picked = await dialog.showSaveDialog(window, {
      title: '保存分享图',
      defaultPath: `${safeFileName(name, '分享图')}.png`,
      filters: [{ name: 'PNG 图片', extensions: ['png'] }],
    });
    if (picked.canceled || !picked.filePath) return ok({ canceled: true });
    try {
      await writeFile(picked.filePath, Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64'));
      return ok({ canceled: false, path: picked.filePath });
    } catch {
      return fail({ kind: 'permission', message: '保存图片失败，请换个位置再试。', retryable: true });
    }
  });
  ipcMain.handle(channels.exportList, async (event, input: { suggestedName?: unknown; headers?: unknown; rows?: unknown } = {}) => {
    guard(event);
    const headers = Array.isArray(input.headers) ? input.headers.filter((cell): cell is string => typeof cell === 'string') : [];
    const rows = Array.isArray(input.rows) ? input.rows.filter(Array.isArray) : [];
    if (!headers.length) return fail({ kind: 'invalid', message: '导出内容为空。', retryable: false });
    if (rows.length > 20000) return fail({ kind: 'invalid', message: '一次最多导出 2 万行，请先筛选。', retryable: false });
    const name = typeof input.suggestedName === 'string' ? input.suggestedName : '播放清单';
    const picked = await dialog.showSaveDialog(window, {
      title: '导出清单',
      defaultPath: `${safeFileName(name, '播放清单')}.csv`,
      filters: [{ name: 'CSV 表格', extensions: ['csv'] }],
    });
    if (picked.canceled || !picked.filePath) return ok({ canceled: true });
    try {
      await writeFile(picked.filePath, toCsv(headers, rows), 'utf8');
      return ok({ canceled: false, path: picked.filePath });
    } catch {
      return fail({ kind: 'permission', message: '写入文件失败，请换个位置再试。', retryable: true });
    }
  });
  ipcMain.handle(channels.authLogin, async event => { guard(event); return auth.login(); });
  ipcMain.handle(channels.authLogout, async event => { guard(event); return auth.logout(); });
  ipcMain.handle(channels.authCancelLogin, async event => { guard(event); return auth.cancelLogin(); });
  ipcMain.handle(channels.musicFavorites, async (event, input: { start?: number; limit?: number; refresh?: boolean } = {}) => {
    guard(event);
    const start = input?.start ?? 0;
    const limit = input?.limit ?? 50;
    if (!Number.isInteger(start) || start < 0 || start > 100000 || !Number.isInteger(limit) || limit < 1 || limit > 50) {
      throw new Error('收藏分页参数无效');
    }
    if (input.refresh !== undefined && (typeof input.refresh !== 'boolean' || (input.refresh && start !== 0))) throw new Error('收藏刷新参数无效');
    return auth.getFavorites(start, limit, input.refresh ?? false);
  });
  ipcMain.handle(channels.musicFavoritesSummary, async event => { guard(event); return auth.getFavoritesSummary(); });
  const refreshFlag = (value: unknown) => value === undefined || typeof value === 'boolean';
  ipcMain.handle(channels.musicPlaylists, async (event, input: { refresh?: boolean } = {}) => {
    guard(event);
    if (!refreshFlag(input?.refresh)) throw new Error('歌单刷新参数无效');
    return auth.getPlaylists(input.refresh ?? false);
  });
  ipcMain.handle(channels.musicPlaylistDetail, async (event, input: { id?: string; kind?: string; start?: number; limit?: number; refresh?: boolean } = {}) => {
    guard(event);
    const playlistId = idOf(input?.id);
    const start = input?.start ?? 0;
    const limit = input?.limit ?? 50;
    if (!playlistId || !['owned', 'collected', 'chart', 'unknown'].includes(input?.kind ?? '')
      || !Number.isInteger(start) || start < 0 || start > 100000 || !Number.isInteger(limit) || limit < 1 || limit > 50
      || !refreshFlag(input?.refresh)) {
      throw new Error('歌单详情参数无效');
    }
    return auth.getPlaylistDetail(playlistId, input.kind as 'owned' | 'collected' | 'chart' | 'unknown', start, limit, input.refresh ?? false);
  });
  ipcMain.handle(channels.musicSearch, async (event, input: { query?: string; start?: number; limit?: number } = {}) => {
    guard(event);
    const query = typeof input?.query === 'string' ? input.query.trim() : '';
    const start = input?.start ?? 0;
    const limit = input?.limit ?? 20;
    if (!query || query.length > 80 || !Number.isInteger(start) || start < 0 || start > 100000
      || !Number.isInteger(limit) || limit < 1 || limit > 50) {
      throw new Error('搜索参数无效');
    }
    return auth.getSearch(query, start, limit);
  });
  ipcMain.handle(channels.musicHistory, async event => { guard(event); return auth.getRemoteHistory(); });
  ipcMain.handle(channels.musicDiscover, async (event, input: { refresh?: boolean } = {}) => {
    guard(event);
    if (!refreshFlag(input?.refresh)) throw new Error('推荐刷新参数无效');
    return auth.getDiscover(input.refresh ?? false);
  });
  ipcMain.handle(channels.musicAlbum, async (event, input: { id?: string; start?: number; limit?: number } = {}) => {
    guard(event);
    const albumId = idOf(input?.id);
    const start = input?.start ?? 0;
    const limit = input?.limit ?? 50;
    if (!albumId || !Number.isInteger(start) || start < 0 || start > 100000 || !Number.isInteger(limit) || limit < 1 || limit > 50) {
      throw new Error('专辑参数无效');
    }
    return auth.getAlbum(albumId, start, limit);
  });
  ipcMain.handle(channels.musicArtist, async (event, input: { id?: string } = {}) => {
    guard(event);
    const artistId = idOf(input?.id);
    if (!artistId) throw new Error('歌手参数无效');
    return auth.getArtist(artistId);
  });
  ipcMain.handle(channels.musicLyrics, async (event, input: { trackId?: string; title?: string; artist?: string; album?: string; durationSeconds?: number } = {}) => {
    guard(event);
    const trackId = idOf(input?.trackId);
    if (!trackId) throw new Error('歌词参数无效');
    const settings = await loadSettings();
    const text = (value: unknown, max: number) => typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined;
    const duration = Number(input?.durationSeconds);
    return auth.getLyrics({
      trackId,
      title: text(input?.title, 200),
      artist: text(input?.artist, 200),
      album: text(input?.album, 200),
      durationSeconds: Number.isFinite(duration) && duration > 0 ? Math.round(duration) : undefined,
    }, settings.thirdPartyLyrics !== false);
  });
  ipcMain.handle(channels.musicReportPlayback, async (event, input: { trackId?: string; title?: string; listenedSeconds?: number; songDurationSeconds?: number } = {}) => {
    guard(event);
    const trackId = idOf(input?.trackId);
    const title = typeof input?.title === 'string' ? input.title.trim() : '';
    const listened = input?.listenedSeconds;
    const songDuration = input?.songDurationSeconds;
    const validDuration = (value: unknown) => value === undefined || (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 24 * 3600);
    if (!trackId || !title || title.length > 200 || typeof listened !== 'number' || !Number.isFinite(listened)
      || listened < 0 || listened > 24 * 3600 || !validDuration(songDuration)) {
      throw new Error('播放历史上报参数无效');
    }
    return auth.reportPlayback({ trackId, title, listenedSeconds: listened, songDurationSeconds: songDuration });
  });
  ipcMain.handle(channels.musicFavoriteState, async (event, input: { trackId?: string } = {}) => {
    guard(event);
    const trackId = idOf(input?.trackId);
    if (!trackId) throw new Error('收藏状态参数无效');
    return auth.getFavoriteState(trackId);
  });
  ipcMain.handle(channels.musicSetFavorite, async (event, input: { trackId?: string; favorite?: boolean } = {}) => {
    guard(event);
    const trackId = idOf(input?.trackId);
    if (!trackId || typeof input?.favorite !== 'boolean') throw new Error('收藏参数无效');
    return auth.setFavorite(trackId, input.favorite);
  });
  ipcMain.handle(channels.musicCreatePlaylist, async (event, input: { name?: string; trackIds?: unknown } = {}) => {
    guard(event);
    const name = typeof input?.name === 'string' ? input.name.trim() : '';
    const trackIds = Array.isArray(input?.trackIds) ? input.trackIds.filter((value): value is string => typeof value === 'string' && !!value && value.length <= 200).slice(0, 200) : [];
    if (!name || name.length > 60 || !trackIds.length || trackIds.length !== (Array.isArray(input?.trackIds) ? input.trackIds.length : 0)) {
      throw new Error('创建歌单参数无效');
    }
    return auth.createPlaylist(name, trackIds);
  });
  ipcMain.handle(channels.musicUpdatePlaylistDescription, async (event, input: { id?: string; description?: string } = {}) => {
    guard(event);
    const playlistId = idOf(input?.id);
    if (!playlistId || typeof input?.description !== 'string' || input.description.length > 200) throw new Error('简介参数无效');
    return auth.updatePlaylistDescription(playlistId, input.description);
  });
  ipcMain.handle(channels.musicDeletePlaylist, async (event, input: { id?: string } = {}) => {
    guard(event);
    const playlistId = idOf(input?.id);
    if (!playlistId) throw new Error('歌单 ID 无效');
    return auth.deletePlaylist(playlistId);
  });
  ipcMain.handle(channels.musicResolvePlayback, async (event, input: { trackId: string; quality: 'standard' | 'lossless' }) => {
    guard(event);
    if (!input || !idOf(input.trackId) || !['standard', 'lossless'].includes(input.quality)) {
      throw new Error('播放参数无效');
    }
    return auth.getPlayback(input.trackId, input.quality);
  });
  ipcMain.handle(channels.settingsGet, async event => { guard(event); return ok(await loadSettings()); });
  ipcMain.handle(channels.settingsUpdate, async (event, input: unknown) => {
    guard(event);
    const next = await updateSettings(input);
    // Same fan-out as closeBehavior below: the store only persists, the shell applies the effect.
    nativeTheme.themeSource = next.theme;
    if (!window.isDestroyed() && process.platform === 'win32') {
      const palette = titleBarColors(next.theme, nativeTheme.shouldUseDarkColors);
      window.setTitleBarOverlay({ color: palette.background, symbolColor: palette.symbol, height: 34 });
    }
    if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: next.launchAtLogin, args: ['--hidden'] });
    return ok(next);
  });
  ipcMain.handle(channels.fontsList, async event => { guard(event); return ok({ families: await listSystemFonts() }); });
  ipcMain.handle(channels.lyricsCacheInfo, async event => { guard(event); return ok(await lyricsCacheInfo()); });
  ipcMain.handle(channels.lyricsClearCache, async (event, input: { local?: boolean } = {}) => {
    guard(event);
    return ok(await clearLyricsCache({ local: input?.local === true }));
  });
  ipcMain.handle(channels.lyricsImport, async (event, input: { trackId?: string } = {}) => {
    guard(event);
    const trackId = idOf(input?.trackId);
    if (!trackId) throw new Error('歌词参数无效');
    // The picker is a pure read of a local file; cancellation resolves to null, not an error.
    const picked = await dialog.showOpenDialog(window, {
      title: '选择歌词文件',
      buttonLabel: '导入',
      properties: ['openFile'],
      filters: [{ name: '歌词文件', extensions: ['lrc', 'txt'] }],
    });
    const filePath = picked.canceled ? undefined : picked.filePaths[0];
    if (!filePath) return ok(null);
    const { text, fileName } = await readLyricsFile(filePath);
    const doc = parseLyrics(text) as LyricsDoc;
    if (!doc.lines.length) throw new Error('这个文件里没有可识别的歌词');
    await writeLocalLyrics(trackId, text, fileName, doc);
    const stored = { ...doc, source: 'local' as const };
    auth.rememberLyrics(trackId, stored);
    return ok(stored);
  });
  ipcMain.handle(channels.lyricsRemoveLocal, async (event, input: { trackId?: string } = {}) => {
    guard(event);
    const trackId = idOf(input?.trackId);
    if (!trackId) throw new Error('歌词参数无效');
    const removed = await removeLocalLyrics(trackId);
    if (removed) auth.forgetLyrics(trackId);
    return ok({ removed });
  });
  ipcMain.handle(channels.queueLoad, async event => { guard(event); return ok(await loadQueue()); });
  ipcMain.handle(channels.queueSave, async (event, input: unknown) => {
    guard(event);
    const queue = (input ?? {}) as { tracks?: unknown };
    if (!queue || typeof queue !== 'object' || !Array.isArray(queue.tracks) || queue.tracks.length > 10000
      || JSON.stringify(queue).length > 5 * 1024 * 1024) return fail({ kind: 'invalid', message: '队列数据无效或过大。', retryable: false });
    if (!auth.canSaveQueue()) return fail({ kind: 'auth', message: '账号切换正在进行，队列未保存。', retryable: false });
    await saveQueue(queue as SavedQueue);
    return ok(undefined);
  });
  ipcMain.handle(channels.windowSetCloseBehavior, async (event, input: 'quit' | 'tray') => {
    guard(event);
    if (!['quit', 'tray'].includes(input)) throw new Error('关闭行为无效');
    const next = await updateSettings({ closeBehavior: input });
    hooks.onCloseBehavior?.(next.closeBehavior);
    return ok(next);
  });
  ipcMain.handle(channels.windowMinimize, async event => { guard(event); window.minimize(); });
  ipcMain.handle(channels.appQuit, async event => { guard(event); app.quit(); });
  // Read-only window onto the chords the main process truly owns: another app can steal an
  // accelerator, and the renderer is the only place that can tell the user which one died.
  ipcMain.handle(channels.appShortcuts, async event => {
    guard(event);
    return ok({ registered: [...shortcutStatus.registered], failed: [...shortcutStatus.failed] });
  });
  // The main window publishes; every helper window consumes. Nothing here mutates playback, so a
  // malformed or stale snapshot can only make a mirror look wrong until the next one arrives.
  ipcMain.on(channels.playerBroadcast, (event, input: unknown) => {
    if (fromWindow(event) !== 'main') return;
    const state = sanitizeSnapshot(input);
    if (state) hooks.onSnapshot?.(state);
  });
  ipcMain.on(channels.playerControl, (event, input: unknown) => {
    if (fromWindow(event) !== 'aux') return;
    if (!['play-pause', 'next', 'previous'].includes(input as string)) return;
    hooks.onCommand?.(input as PlayerCommand);
  });
  ipcMain.on(channels.playerSeek, (event, input: unknown) => {
    if (fromWindow(event) !== 'aux') return;
    if (typeof input !== 'number' || !Number.isFinite(input) || input < 0 || input > 24 * 3600) return;
    hooks.onSeek?.(input);
  });
  ipcMain.handle(channels.windowToggleAux, async (event, input: { kind?: string } = {}) => {
    if (!isAllowedSender(window, event) && fromWindow(event as unknown as Electron.IpcMainEvent) !== 'aux') throw new Error('IPC 来源不受信任');
    if (input?.kind !== 'mini' && input?.kind !== 'lyrics') throw new Error('辅助窗口类型无效');
    return hooks.onToggleAux?.(input.kind) ?? false;
  });
  ipcMain.handle(channels.windowPinAux, async (event, input: { kind?: string; pinned?: boolean } = {}) => {
    if (!isAllowedSender(window, event) && fromWindow(event as unknown as Electron.IpcMainEvent) !== 'aux') throw new Error('IPC 来源不受信任');
    if (input?.kind !== 'mini' && input?.kind !== 'lyrics') throw new Error('辅助窗口类型无效');
    return hooks.onPinAux?.(input.kind, input.pinned === true) ?? false;
  });
  ipcMain.handle(channels.windowLyricsAppearance, async (event, input: { opacity?: number; locked?: boolean; fontSize?: number; color?: string } = {}) => {
    if (!isAllowedSender(window, event) && fromWindow(event as unknown as Electron.IpcMainEvent) !== 'aux') throw new Error('IPC 来源不受信任');
    const patch: { opacity?: number; locked?: boolean; fontSize?: number; color?: string } = {};
    if (typeof input?.opacity === 'number' && Number.isFinite(input.opacity)) patch.opacity = input.opacity;
    if (typeof input?.locked === 'boolean') patch.locked = input.locked;
    if (typeof input?.fontSize === 'number' && Number.isFinite(input.fontSize)) patch.fontSize = input.fontSize;
    if (typeof input?.color === 'string') patch.color = input.color;
    const applied = hooks.onLyricsAppearance?.(patch);
    return applied ? ok(applied) : fail({ kind: 'unknown', message: '桌面歌词不可用', retryable: true });
  });
  ipcMain.on(channels.playerRequestState, event => {
    if (fromWindow(event) !== 'aux') return;
    hooks.onRequestState?.(event.sender);
  });
  ipcMain.on(channels.windowShowMain, event => {
    if (fromWindow(event) !== 'aux') return;
    hooks.onShowMain?.();
  });
}

// A snapshot crosses from the renderer into three windows, so it is validated once here rather than
// trusted by each consumer.
function sanitizeSnapshot(input: unknown): PlayerSnapshot | null {
  if (!input || typeof input !== 'object') return null;
  const value = input as Record<string, unknown>;
  const text = (item: unknown, max: number) => (typeof item === 'string' ? item.slice(0, max) : '');
  const seconds = (item: unknown) => (typeof item === 'number' && Number.isFinite(item) && item >= 0 && item <= 24 * 3600 ? item : 0);
  const lyrics = Array.isArray(value.lyrics)
    ? value.lyrics.filter((line): line is string => typeof line === 'string').slice(0, 2000).map(line => line.slice(0, 400))
    : [];
  const lyricIndex = typeof value.lyricIndex === 'number' && Number.isInteger(value.lyricIndex) ? value.lyricIndex : -1;
  return {
    title: text(value.title, 200),
    artists: text(value.artists, 200),
    ...(typeof value.coverUrl === 'string' && value.coverUrl.startsWith('https://') ? { coverUrl: value.coverUrl.slice(0, 800) } : {}),
    playing: value.playing === true,
    position: seconds(value.position),
    duration: seconds(value.duration),
    lyrics,
    lyricIndex: lyricIndex >= -1 && lyricIndex < lyrics.length ? lyricIndex : -1,
  };
}
