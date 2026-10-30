export const channels = {
  authStatus: 'auth:status',
  authLogin: 'auth:login',
  authLogout: 'auth:logout',
  authCancelLogin: 'auth:cancel-login',
  musicFavorites: 'music:favorites',
  musicFavoritesSummary: 'music:favorites-summary',
  musicPlaylists: 'music:playlists',
  musicPlaylistDetail: 'music:playlist-detail',
  musicSearch: 'music:search',
  musicHistory: 'music:history',
  musicDiscover: 'music:discover',
  musicAlbum: 'music:album',
  musicArtist: 'music:artist',
  musicLyrics: 'music:lyrics',
  musicResolvePlayback: 'music:resolve-playback',
  musicReportPlayback: 'music:report-playback',
  musicSetFavorite: 'music:set-favorite',
  musicFavoriteState: 'music:favorite-state',
  musicCreatePlaylist: 'music:create-playlist',
  musicUpdatePlaylistDescription: 'music:update-playlist-description',
  musicDeletePlaylist: 'music:delete-playlist',
  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  // Pushed to every window after a save: the helper windows are separate documents and cannot
  // inherit the token values the main window writes on its own :root.
  appearanceChanged: 'appearance:changed',
  fontsList: 'fonts:list',
  lyricsImport: 'lyrics:import',
  lyricsRemoveLocal: 'lyrics:remove-local',
  lyricsCacheInfo: 'lyrics:cache-info',
  lyricsClearCache: 'lyrics:clear-cache',
  queueLoad: 'queue:load',
  // Writes a user-chosen CSV next to wherever they point the save dialog.
  exportList: 'export:list',
  // Share card needs the cover as data, and a cross-origin <img> taints the canvas, so the main
  // process fetches it first (it is not bound by CORS) and hands back a data URL.
  shareCover: 'share:cover',
  appShortcuts: 'app:shortcuts',
  shareSave: 'share:save',
  queueSave: 'queue:save',
  windowMinimize: 'window:minimize',
  windowSetCloseBehavior: 'window:set-close-behavior',
  appQuit: 'app:quit',
  appNotice: 'app:notice',
  playerCommand: 'player:command',
  // Main window -> main process -> every auxiliary window. Fire-and-forget on purpose: a dropped
  // snapshot is corrected by the next one, so it must never queue behind an invoke round trip.
  playerBroadcast: 'player:broadcast',
  playerState: 'player:state',
  // Auxiliary windows -> main process -> main window, which owns the only <audio> element.
  playerControl: 'player:control',
  playerRequestState: 'player:request-state',
  playerSeek: 'player:seek',
  // The overlay nudges the offset from where the lyric is actually read: same relay shape as a seek
  // (helper -> main -> main window, which owns the value and the per-track memory).
  playerLyricOffset: 'player:lyric-offset',
  // Accepting a whole alignment suggestion: the same relay, but the value replaces the offset
  // instead of nudging it, so a 17 s correction does not have to be walked in step by step.
  playerLyricOffsetSet: 'player:lyric-offset-set',
  windowToggleAux: 'window:toggle-aux',
  windowPinAux: 'window:pin-aux',
  windowAuxState: 'window:aux-state',
  // The main window asks for the current helper-window state once on mount: the push above can be
  // missed when the overlay was reopened from the previous session before the renderer subscribed.
  windowAuxQuery: 'window:aux-query',
  // Both windows may change the overlay look: the lyrics window itself and the main window (which is
  // the only way back once the overlay is click-through).
  windowLyricsAppearance: 'window:lyrics-appearance',
  windowShowMain: 'window:show-main',
  // Dragging is done in JS rather than with -webkit-app-region: drag, because a drag region swallows
  // mouse events and the overlay then never reacts to hover. Screen coordinates, not client ones:
  // the window is moving while the pointer does.
  auxDragStart: 'aux:drag-start',
  auxDragMove: 'aux:drag-move',
  auxDragEnd: 'aux:drag-end',
  // Main process -> lyrics window, so its toolbar never shows a stale lock/opacity state.
  lyricsAppearanceState: 'lyrics:appearance-state',
} as const;

export type Channel = (typeof channels)[keyof typeof channels];
