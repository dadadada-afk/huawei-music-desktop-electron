import { contextBridge, ipcRenderer } from 'electron';
import { channels } from '../shared/channels';
import type { AppearanceSettings, AuxWindowKind, DesktopApi, ExportRequest, LyricsAppearance, PlayerCommand, PlayerSnapshot } from '../shared/types';

const api: DesktopApi = {
  auth: {
    status: () => ipcRenderer.invoke(channels.authStatus),
    login: () => ipcRenderer.invoke(channels.authLogin),
    logout: () => ipcRenderer.invoke(channels.authLogout),
    cancelLogin: () => ipcRenderer.invoke(channels.authCancelLogin),
    onProgress: listener => {
      const wrapped = (_event: Electron.IpcRendererEvent, message: string) => listener(message);
      ipcRenderer.on('auth:progress', wrapped);
      return () => ipcRenderer.removeListener('auth:progress', wrapped);
    },
  },
  music: {
    favorites: input => ipcRenderer.invoke(channels.musicFavorites, input),
    favoritesSummary: () => ipcRenderer.invoke(channels.musicFavoritesSummary),
    playlists: input => ipcRenderer.invoke(channels.musicPlaylists, input),
    playlistDetail: input => ipcRenderer.invoke(channels.musicPlaylistDetail, input),
    search: input => ipcRenderer.invoke(channels.musicSearch, input),
    history: () => ipcRenderer.invoke(channels.musicHistory),
    discover: input => ipcRenderer.invoke(channels.musicDiscover, input),
    album: input => ipcRenderer.invoke(channels.musicAlbum, input),
    artist: input => ipcRenderer.invoke(channels.musicArtist, input),
    lyrics: input => ipcRenderer.invoke(channels.musicLyrics, input),
    resolvePlayback: input => ipcRenderer.invoke(channels.musicResolvePlayback, input),
    reportPlayback: input => ipcRenderer.invoke(channels.musicReportPlayback, input),
    favoriteState: input => ipcRenderer.invoke(channels.musicFavoriteState, input),
    setFavorite: input => ipcRenderer.invoke(channels.musicSetFavorite, input),
    createPlaylist: input => ipcRenderer.invoke(channels.musicCreatePlaylist, input),
    updatePlaylistDescription: input => ipcRenderer.invoke(channels.musicUpdatePlaylistDescription, input),
    deletePlaylist: input => ipcRenderer.invoke(channels.musicDeletePlaylist, input),
  },
  export: {
    list: (input: ExportRequest) => ipcRenderer.invoke(channels.exportList, input),
  },
  share: {
    cover: (input: { url: string }) => ipcRenderer.invoke(channels.shareCover, input),
    save: (input: { dataUrl: string; suggestedName: string }) => ipcRenderer.invoke(channels.shareSave, input),
  },
  settings: {
    get: () => ipcRenderer.invoke(channels.settingsGet),
    update: input => ipcRenderer.invoke(channels.settingsUpdate, input),
  },
  queue: {
    load: () => ipcRenderer.invoke(channels.queueLoad),
    save: input => ipcRenderer.invoke(channels.queueSave, input),
  },
  fonts: {
    list: () => ipcRenderer.invoke(channels.fontsList),
  },
  lyrics: {
    importLocal: trackId => ipcRenderer.invoke(channels.lyricsImport, { trackId }),
    removeLocal: trackId => ipcRenderer.invoke(channels.lyricsRemoveLocal, { trackId }),
    cacheInfo: () => ipcRenderer.invoke(channels.lyricsCacheInfo),
    clearCache: input => ipcRenderer.invoke(channels.lyricsClearCache, input ?? {}),
  },
  window: {
    minimize: () => ipcRenderer.invoke(channels.windowMinimize),
    setCloseBehavior: input => ipcRenderer.invoke(channels.windowSetCloseBehavior, input),
    // Screen coordinates: the helper window moves while the pointer travels, so client coords drift.
    dragStart: (point: { x: number; y: number }) => ipcRenderer.send(channels.auxDragStart, point),
    dragMove: (point: { x: number; y: number }) => ipcRenderer.send(channels.auxDragMove, point),
    dragEnd: () => ipcRenderer.send(channels.auxDragEnd),
  },
  app: {
    quit: () => ipcRenderer.invoke(channels.appQuit),
    shortcuts: () => ipcRenderer.invoke(channels.appShortcuts),
  },
  player: {
    onCommand: listener => {
      const wrapped = (_event: Electron.IpcRendererEvent, command: PlayerCommand) => listener(command);
      ipcRenderer.on(channels.playerCommand, wrapped);
      return () => ipcRenderer.removeListener(channels.playerCommand, wrapped);
    },
    broadcast: state => ipcRenderer.send(channels.playerBroadcast, state),
    onState: listener => {
      const wrapped = (_event: Electron.IpcRendererEvent, state: PlayerSnapshot | null) => listener(state);
      ipcRenderer.on(channels.playerState, wrapped);
      return () => ipcRenderer.removeListener(channels.playerState, wrapped);
    },
    control: command => ipcRenderer.send(channels.playerControl, command),
    requestState: () => ipcRenderer.send(channels.playerRequestState),
    seek: seconds => ipcRenderer.send(channels.playerSeek, seconds),
    onSeek: listener => {
      const wrapped = (_event: Electron.IpcRendererEvent, seconds: number) => listener(seconds);
      ipcRenderer.on(channels.playerSeek, wrapped);
      return () => ipcRenderer.removeListener(channels.playerSeek, wrapped);
    },
    adjustLyricOffset: delta => ipcRenderer.send(channels.playerLyricOffset, delta),
    onLyricOffset: listener => {
      const wrapped = (_event: Electron.IpcRendererEvent, delta: number) => listener(delta);
      ipcRenderer.on(channels.playerLyricOffset, wrapped);
      return () => ipcRenderer.removeListener(channels.playerLyricOffset, wrapped);
    },
    toggleAux: kind => ipcRenderer.invoke(channels.windowToggleAux, { kind }),
    auxState: () => ipcRenderer.invoke(channels.windowAuxQuery),
    setAuxPinned: (kind, pinned) => ipcRenderer.invoke(channels.windowPinAux, { kind, pinned }),
    onAuxState: listener => {
      const wrapped = (_event: Electron.IpcRendererEvent, state: { kind: AuxWindowKind; open: boolean }) => listener(state);
      ipcRenderer.on(channels.windowAuxState, wrapped);
      return () => ipcRenderer.removeListener(channels.windowAuxState, wrapped);
    },
    showMain: () => ipcRenderer.send(channels.windowShowMain),
    setLyricsAppearance: input => ipcRenderer.invoke(channels.windowLyricsAppearance, input),
    onLyricsAppearance: listener => {
      const wrapped = (_event: Electron.IpcRendererEvent, state: LyricsAppearance) => listener(state);
      ipcRenderer.on(channels.lyricsAppearanceState, wrapped);
      return () => ipcRenderer.removeListener(channels.lyricsAppearanceState, wrapped);
    },
    onAppearance: listener => {
      const wrapped = (_event: Electron.IpcRendererEvent, state: { theme?: string; appearance?: AppearanceSettings }) => listener(state);
      ipcRenderer.on(channels.appearanceChanged, wrapped);
      return () => ipcRenderer.removeListener(channels.appearanceChanged, wrapped);
    },
  },
  onNotice: listener => {
    const wrapped = (_event: Electron.IpcRendererEvent, message: string) => listener(message);
    ipcRenderer.on(channels.appNotice, wrapped);
    return () => ipcRenderer.removeListener(channels.appNotice, wrapped);
  },
};

contextBridge.exposeInMainWorld('desktop', api);
