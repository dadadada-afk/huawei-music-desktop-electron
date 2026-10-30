// Windows groups taskbar buttons, toasts and jump lists by AppUserModelID, and the shell caches
// the icon it first saw under an id — running the app through electron.exe during development
// therefore pinned Electron's stock icon to the shared id on this machine. Keep this value equal
// to package.json "build.appId", which electron-builder stamps on the installed shortcut; a test
// asserts that, and development gets its own id so a dev run can never poison the packaged one.
export const APP_USER_MODEL_ID = 'org.hwmusicdesktop.unofficial.internal';
export const APP_USER_MODEL_ID_DEV = 'org.hwmusicdesktop.unofficial.internal.dev';
