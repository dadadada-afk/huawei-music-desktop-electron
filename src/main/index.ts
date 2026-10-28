import { app, BrowserWindow, dialog, globalShortcut, Menu, nativeImage, nativeTheme, Notification, screen, session, Tray } from 'electron';
import * as fs from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { registerIpc } from './ipc';
import { AuthManager } from './auth-manager';
import { createAuthManagerLifecycle } from './auth-manager-lifecycle.mjs';
import { applyNodeProxy, electronBypassRules, proxyConfigurationProblem, proxyRules, readProxySettings } from './proxy.mjs';
import { titleBarColors } from './titlebar.mjs';
import { shortcutStatus } from './shortcut-status.mjs';
import { shouldBlockMediaRequest } from '../safe-media-url.mjs';
import { loadSettings, updateSettings } from './storage';
import { loadJson, saveJson } from './json-store.cjs';
import { sanitizeWindowState } from './window-state.mjs';
import { TRAY_ICON_PNG_BASE64 } from './icons';
import { APP_DISPLAY_NAME } from '../shared/app-name.mjs';
import { channels } from '../shared/channels';
import type { AppSettings, AuxWindowKind, LyricsAppearance, PlayerCommand, PlayerSnapshot } from '../shared/types';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;
let closeBehavior: AppSettings['closeBehavior'] = 'quit';
// Mirrors settings.theme so createWindow can paint the title-bar overlay before settings load.
let activeTheme: AppSettings['theme'] = 'system';
// Set when Windows launches the app at login; the window is created but stays in the tray.
const startHidden = process.argv.includes('--hidden');
// The auxiliary windows own no playback state; they only mirror the last snapshot broadcast by the
// main window, which keeps the single <audio> element authoritative.
const auxWindows = new Map<AuxWindowKind, BrowserWindow>();
let latestSnapshot: PlayerSnapshot | null = null;
// Tracks the last toast so a state-only broadcast (pause, seek, volume) never re-notifies, and so a
// restart that restores the queue stays quiet.
let notifiedTrackKey = '';

/**
 * Tells the listener what started playing, but only when they cannot see it. With the window
 * focused the player bar already shows the same thing, so a toast there would be pure noise.
 */
function notifyBackgroundTrack(state: PlayerSnapshot): void {
  const key = `${state.title}\u0000${state.artists}`;
  if (key === notifiedTrackKey) return;
  notifiedTrackKey = key;
  // A restored queue arrives paused; announcing it would describe something that is not happening.
  if (!state.title || !state.playing) return;
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isFocused() && !mainWindow.isMinimized()) return;
  if (!Notification.isSupported()) return;
  new Notification({ title: state.title, body: state.artists || '未知艺人', silent: true }).show();
}

const rendererUrl = pathToFileURL(join(__dirname, '../renderer/index.html')).href;
const authManagerLifecycle = createAuthManagerLifecycle(async () => {
  const auth = new AuthManager(message => mainWindow?.webContents.send('auth:progress', message),
    () => session.defaultSession.clearStorageData({ storages: ['localstorage', 'indexdb', 'cachestorage'] }),
    // The official login page is embedded in the main window, so the window must outlive the flow.
    () => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null));
  await auth.restore();
  return auth;
});

// Launching with `electron out/main/index.js` cannot see package.json, so Electron falls back to
// the name "Electron" and would keep settings, queue and the login session in a second profile
// directory. Pinning the name keeps one profile no matter how the app is started, and it has to
// happen before the single-instance lock, which is keyed on the userData directory.
app.setName('huawei-music-desktop');
// Windows attributes toasts to the AppUserModelID, not the executable name; without it a
// notification either never appears or is labelled "electron.app.Electron". Same value the
// packaged shortcut uses, so the tray, taskbar and notifications all agree on one identity.
if (process.platform === 'win32') app.setAppUserModelId('com.huawei.music.desktop.study');

const hasSingleInstance = app.requestSingleInstanceLock();
if (!hasSingleInstance) app.quit();

function overlayColors(): { color: string; symbolColor: string } {
  const palette = titleBarColors(activeTheme, nativeTheme.shouldUseDarkColors);
  return { color: palette.background, symbolColor: palette.symbol };
}

async function createWindow(): Promise<void> {
  // Geometry is restored only when it still overlaps a connected display; otherwise the window is
  // centred by the OS instead of reopening off-screen after a monitor change.
  const stored = await loadJson(app.getPath('userData'), 'window-state', null, fs);
  const bounds = sanitizeWindowState(stored, screen.getAllDisplays().map(display => display.workArea));
  const window = new BrowserWindow({
    width: bounds?.width ?? 1180, height: bounds?.height ?? 760, minWidth: 960, minHeight: 640,
    ...(bounds?.x !== undefined && bounds?.y !== undefined ? { x: bounds.x, y: bounds.y } : {}),
    title: APP_DISPLAY_NAME,
    // No native title bar: the window title carried the whole "第三方客户端（学习版）" string, which
    // is disclaimer text, not an app name worth painting across the top. The OS keeps drawing the
    // minimise/maximise/close buttons through the overlay, so the window stays operable.
    titleBarStyle: 'hidden',
    ...(process.platform === 'win32'
      ? { titleBarOverlay: { ...overlayColors(), height: 34 } }
      : {}),
    // No in-window menu bar on Windows/Linux; the menu is removed below.
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true,
    },
  });
  mainWindow = window;
  if (bounds?.maximized) window.maximize();
  window.once('closed', () => { if (mainWindow === window) mainWindow = null; });
  // The saved close policy controls both title-bar actions; the default is tray for desktop use.
  window.on('close', event => {
    if (quitting || closeBehavior !== 'tray' || !tray) return;
    event.preventDefault();
    window.hide();
  });
  // The same opt-in covers the minimize button: one switch, both window controls, so a tray user
  // never gets a hidden window on one path and a taskbar entry on the other. Electron does not let
  // a listener cancel 'minimize', so the window is hidden right after it minimizes.
  window.on('minimize', () => {
    if (closeBehavior !== 'tray' || !tray) return;
    window.hide();
  });
  // Geometry is written at most once per settle instead of on every resize tick; the maximized flag
  // is recorded separately so restoring a maximized window does not overwrite its normal size.
  let boundsTimer: NodeJS.Timeout | null = null;
  const persistBounds = () => {
    if (window.isDestroyed()) return;
    const maximized = window.isMaximized();
    const area = maximized ? window.getNormalBounds() : window.getBounds();
    void saveJson(app.getPath('userData'), 'window-state', { ...area, maximized }, fs).catch(() => undefined);
  };
  const scheduleBounds = () => {
    if (boundsTimer) clearTimeout(boundsTimer);
    boundsTimer = setTimeout(() => { boundsTimer = null; persistBounds(); }, 500);
  };
  window.on('resize', scheduleBounds);
  window.on('move', scheduleBounds);
  window.on('maximize', scheduleBounds);
  window.on('unmaximize', scheduleBounds);
  window.on('close', () => {
    if (boundsTimer) { clearTimeout(boundsTimer); boundsTimer = null; }
    persistBounds();
  });
  try {
    const auth = await authManagerLifecycle.get();
    if (window.isDestroyed()) return;
    registerIpc(window, auth, {
      onCloseBehavior: value => { closeBehavior = value; },
      onSnapshot: state => {
        latestSnapshot = state;
        notifyBackgroundTrack(state);
        for (const helper of auxWindows.values()) {
          if (!helper.isDestroyed()) helper.webContents.send(channels.playerState, state);
        }
      },
      onCommand: command => sendPlayerCommand(command),
      onSeek: seconds => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channels.playerSeek, seconds); },
      onToggleAux: kind => toggleAuxWindow(kind),
      onShowMain: showMainWindow,
      onLyricsAppearance: patch => applyLyricsAppearance(patch),
      onRequestState: sender => { if (!sender.isDestroyed()) sender.send(channels.playerState, latestSnapshot); },
    });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    window.webContents.session.setPermissionCheckHandler(() => false);
    const blockUntrustedNavigation = (event: Electron.Event, url: string) => {
      if (url !== rendererUrl) event.preventDefault();
    };
    window.webContents.on('will-navigate', blockUntrustedNavigation);
    window.webContents.on('will-redirect', blockUntrustedNavigation);
    await window.loadFile(join(__dirname, '../renderer/index.html'));
    // Launched by the login item: come up in the tray instead of stealing focus at boot.
    if (startHidden && tray) window.hide();
  } catch (error) {
    if (!window.isDestroyed()) window.destroy();
    throw error;
  }
}

function sendPlayerCommand(command: PlayerCommand): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('player:command', command);
}

// Three lyric lines plus the hover bar. Derived from the type size so a user who scales the overlay
// up does not get the third line clipped by a fixed 168px frame.
function lyricsWindowHeight(fontSize: number): number {
  return Math.max(168, Math.round(fontSize * 2.7 + 70));
}

function createAuxWindow(kind: AuxWindowKind): BrowserWindow {
  const window = new BrowserWindow({
    width: kind === 'mini' ? 380 : 760,
    height: kind === 'mini' ? 132 : lyricsWindowHeight(lyricsAppearance.fontSize),
    minWidth: kind === 'mini' ? 340 : 320,
    minHeight: kind === 'mini' ? 132 : 120,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: kind === 'lyrics',
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: kind === 'lyrics',
    alwaysOnTop: kind === 'lyrics',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true,
    },
  });
  if (kind === 'lyrics') {
    window.setAlwaysOnTop(true, 'screen-saver');
    window.setOpacity(lyricsAppearance.opacity);
    window.setIgnoreMouseEvents(lyricsAppearance.locked, { forward: true });
  }
  auxWindows.set(kind, window);
  window.once('closed', () => {
    if (auxWindows.get(kind) !== window) return;
    auxWindows.delete(kind);
    notifyAuxState(kind, false);
  });
  // The helper starts empty otherwise: it may load before the main window has broadcast anything.
  window.webContents.once('did-finish-load', () => {
    if (window.isDestroyed()) return;
    if (latestSnapshot) window.webContents.send(channels.playerState, latestSnapshot);
    // Same reason for the overlay appearance: the window is created with the saved opacity and
    // click-through already applied, but its toolbar would otherwise paint the defaults.
    if (kind === 'lyrics') window.webContents.send(channels.lyricsAppearanceState, { ...lyricsAppearance });
    window.showInactive();
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  void window.loadFile(join(__dirname, '../renderer/index.html'), { hash: kind }).catch(() => undefined);
  return window;
}

function toggleAuxWindow(kind: AuxWindowKind): boolean {
  const existing = auxWindows.get(kind);
  if (existing && !existing.isDestroyed()) { existing.close(); return false; }
  createAuxWindow(kind);
  notifyAuxState(kind, true);
  return true;
}

// Desktop lyric overlay appearance. `locked` turns the window click-through so it never swallows a
// click meant for the desktop behind it; that also removes every in-window control, which is why the
// main window and the tray expose the same switch.
const lyricsAppearance: LyricsAppearance = { opacity: 1, locked: false, fontSize: 30, color: '#ffe9eb' };

function applyLyricsAppearance(patch: { opacity?: number; locked?: boolean; fontSize?: number; color?: string }): LyricsAppearance | null {
  if (typeof patch.opacity === 'number') {
    lyricsAppearance.opacity = Math.min(1, Math.max(0.3, patch.opacity));
  }
  if (typeof patch.locked === 'boolean') lyricsAppearance.locked = patch.locked;
  if (typeof patch.fontSize === 'number' && Number.isFinite(patch.fontSize)) {
    lyricsAppearance.fontSize = Math.min(64, Math.max(18, Math.round(patch.fontSize)));
  }
  if (typeof patch.color === 'string' && /^#[0-9a-f]{6}$/i.test(patch.color)) {
    lyricsAppearance.color = patch.color.toLowerCase();
  }
  const window = auxWindows.get('lyrics');
  if (window && !window.isDestroyed()) {
    window.setOpacity(lyricsAppearance.opacity);
    // Forwarding keeps hover/hit-testing cheap while the window itself stays transparent to clicks.
    window.setIgnoreMouseEvents(lyricsAppearance.locked, { forward: true });
    // Grow (or shrink) the frame with the type size, but never below what the user resized it to.
    const [, currentHeight] = window.getSize();
    const wanted = lyricsWindowHeight(lyricsAppearance.fontSize);
    if (currentHeight < wanted) window.setSize(window.getSize()[0], wanted);
    window.webContents.send(channels.lyricsAppearanceState, { ...lyricsAppearance });
  }
  void updateSettings({
    lyricsOpacity: lyricsAppearance.opacity,
    lyricsLocked: lyricsAppearance.locked,
    lyricsFontSize: lyricsAppearance.fontSize,
    lyricsColor: lyricsAppearance.color,
  }).catch(() => undefined);
  if (tray) tray.setContextMenu(buildTrayMenu());
  return { ...lyricsAppearance };
}

// The tray can open a helper window without the renderer asking, so the main window is told instead
// of being left to infer it from its own last click.
function notifyAuxState(kind: AuxWindowKind, open: boolean): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channels.windowAuxState, { kind, open });
}

function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    void createWindow().catch(() => failStartup('应用启动失败', '无法重新创建应用窗口。请重启应用后重试。'));
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function buildTrayMenu(): Electron.Menu {
  return Menu.buildFromTemplate([
    { label: '显示窗口', click: showMainWindow },
    { type: 'separator' },
    { label: '播放 / 暂停', click: () => sendPlayerCommand('play-pause') },
    { label: '上一首', click: () => sendPlayerCommand('previous') },
    { label: '下一首', click: () => sendPlayerCommand('next') },
    { type: 'separator' },
    { label: '迷你播放器', click: () => { toggleAuxWindow('mini'); } },
    { label: '桌面歌词', click: () => { toggleAuxWindow('lyrics'); } },
    // Unlocking has to be reachable from outside the overlay: a locked overlay ignores the mouse.
    {
      label: '锁定桌面歌词（鼠标穿透）',
      type: 'checkbox',
      checked: lyricsAppearance.locked,
      accelerator: LYRICS_LOCK_ACCELERATOR,
      click: () => { applyLyricsAppearance({ locked: !lyricsAppearance.locked }); },
    },
    { type: 'separator' },
    { label: '退出程序', click: () => { quitting = true; app.quit(); } },
  ]);
}

function createTray(): void {
  try {
    const image = nativeImage.createFromDataURL(`data:image/png;base64,${TRAY_ICON_PNG_BASE64}`);
    tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image);
    tray.setToolTip(APP_DISPLAY_NAME);
    tray.setContextMenu(buildTrayMenu());
    tray.on('click', showMainWindow);
  } catch {
    // Some Linux desktops have no tray host; keep the normal window/quit behaviour.
    tray = null;
  }
}

// The default Electron menu (File/Edit/View/Window) is not this app's UI. Windows/Linux get no
// menu bar at all; macOS keeps only the minimal standard roles so Cmd+Q / copy / paste still work.
function configureApplicationMenu(): void {
  if (process.platform !== 'darwin') { Menu.setApplicationMenu(null); return; }
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: 'appMenu' },
    { role: 'editMenu' },
    { role: 'windowMenu' },
  ]));
}

function registerMediaKeys(): void {
  // Media keys work from anywhere; the Alt chords exist because many keyboards lack media keys and
  // because the user asked to skip tracks without switching back to the window.
  const bindings: [Electron.Accelerator, PlayerCommand][] = [
    ['MediaPlayPause', 'play-pause'],
    ['MediaNextTrack', 'next'],
    ['MediaPreviousTrack', 'previous'],
    ['CommandOrControl+Alt+P', 'play-pause'],
    ['CommandOrControl+Alt+Right', 'next'],
    ['CommandOrControl+Alt+Left', 'previous'],
    ['CommandOrControl+Alt+Up', 'volume-up'],
    ['CommandOrControl+Alt+Down', 'volume-down'],
  ];
  shortcutStatus.registered.length = 0;
  shortcutStatus.failed.length = 0;
  for (const [accelerator, command] of bindings) {
    try {
      if (globalShortcut.register(accelerator, () => sendPlayerCommand(command))) shortcutStatus.registered.push(accelerator);
      else shortcutStatus.failed.push(accelerator);
    } catch { shortcutStatus.failed.push(accelerator); }
  }
}

// Locking the overlay makes it click-through, so the in-window unlock button disappears with the
// rest of its controls. Without a system-wide chord the only ways back are the tray and the main
// window, and the user asked for a shortcut instead of hunting for those.
const LYRICS_LOCK_ACCELERATOR = 'CommandOrControl+Alt+L';

function registerLyricsLockShortcut(): void {
  try {
    const registered = globalShortcut.register(LYRICS_LOCK_ACCELERATOR,
      () => { applyLyricsAppearance({ locked: !lyricsAppearance.locked }); });
    if (!registered) console.warn(`[lyrics] ${LYRICS_LOCK_ACCELERATOR} is already taken; use the tray to unlock.`);
  } catch { /* Unsupported on this platform. */ }
}

function failStartup(title: string, message: string): void {
  dialog.showErrorBox(title, message);
  app.quit();
}

app.on('second-instance', () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    void createWindow().catch(() => failStartup('应用启动失败', '无法重新创建应用窗口。请重启应用后重试。'));
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
});

app.whenReady().then(() => {
  if (!hasSingleInstance) return;
  const proxyProblem = proxyConfigurationProblem();
  if (proxyProblem) {
    const detail = proxyProblem === 'unsupported'
      ? '检测到不支持的代理协议；当前仅支持 HTTP/HTTPS 代理。'
      : proxyProblem === 'credentials'
        ? '检测到带认证信息的代理；当前版本不支持代理认证。'
      : '检测到无法识别的代理配置。';
    dialog.showErrorBox('代理配置错误', `${detail}\n为避免绕过代理，本次不会直连网络。请修正进程代理环境变量后重启。`);
    app.quit();
    return;
  }
  const proxy = readProxySettings();
  applyNodeProxy(proxy);
  const settingsReady = loadSettings().then(settings => {
    closeBehavior = settings.closeBehavior;
    activeTheme = settings.theme;
    // Only a packaged build can register itself: in dev the login item would point at
    // electron.exe with no app path and open a blank shell on every boot.
    if (app.isPackaged) {
      app.setLoginItemSettings({ openAtLogin: settings.launchAtLogin, args: ['--hidden'] });
    }
    // themeSource is the single lever for the whole colour scheme: it drives prefers-color-scheme
    // in every renderer, so styles.css owns the switching and no window needs to be told twice.
    nativeTheme.themeSource = settings.theme;
    // Restored before any helper window exists, so a reopened overlay starts locked/faded as saved.
    lyricsAppearance.opacity = settings.lyricsOpacity;
    lyricsAppearance.locked = settings.lyricsLocked;
    lyricsAppearance.fontSize = settings.lyricsFontSize;
    lyricsAppearance.color = settings.lyricsColor;
  });
  configureApplicationMenu();
  // The tray reflects persisted lyric lock state, so create it only after settings restoration.
  void settingsReady.then(() => createTray());
  registerMediaKeys();
  registerLyricsLockShortcut();
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
    callback({ cancel: shouldBlockMediaRequest(details.resourceType, details.url) });
  });
  const rules = proxyRules(proxy);
  void Promise.all([settingsReady,
    rules ? session.defaultSession.setProxy({ mode: 'fixed_servers', proxyRules: rules, proxyBypassRules: electronBypassRules(proxy.bypass) }) : Promise.resolve(),
  ])
    .then(() => createWindow().catch(() => {
      failStartup('应用启动失败', '无法初始化应用窗口。请检查本机应用数据目录权限后重启。');
    }))
    .catch(() => failStartup('代理配置失败', '无法应用当前 HTTP(S) 代理配置。为避免绕过代理，本次不会直连网络。请检查代理设置后重启。'));
  app.on('activate', () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      void createWindow().catch(() => failStartup('应用启动失败', '无法重新创建应用窗口。请重启应用后重试。'));
    }
  });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

app.on('before-quit', () => { quitting = true; });
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  tray?.destroy();
  tray = null;
});
