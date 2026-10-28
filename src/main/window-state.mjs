// Main-window geometry is app state, not a user preference, so it lives in its own file.
// Pure clamping keeps a window last closed on a detached display from reopening off-screen.
//
// @param {unknown} value   whatever was on disk
// @param {Array<{x:number,y:number,width:number,height:number}>} workAreas  connected displays
// @returns {{x?:number,y?:number,width:number,height:number,maximized:boolean}|null}

const MIN_WIDTH = 960;
const MIN_HEIGHT = 640;
const MAX_EDGE = 8000;
// A stored position is only reused when at least this much of the window stays on a display.
const VISIBLE_MARGIN = 80;

function whole(value) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null;
}

export function sanitizeWindowState(value, workAreas) {
  if (!value || typeof value !== 'object') return null;
  const width = whole(value.width);
  const height = whole(value.height);
  if (width === null || height === null) return null;
  const size = {
    width: Math.min(Math.max(width, MIN_WIDTH), MAX_EDGE),
    height: Math.min(Math.max(height, MIN_HEIGHT), MAX_EDGE),
  };
  const areas = Array.isArray(workAreas)
    ? workAreas.filter(area => area && whole(area.width) !== null && whole(area.height) !== null)
    : [];
  const x = whole(value.x);
  const y = whole(value.y);
  const visible = x !== null && y !== null && areas.some(area =>
    x + size.width > area.x + VISIBLE_MARGIN && x < area.x + area.width - VISIBLE_MARGIN
    && y + size.height > area.y + VISIBLE_MARGIN && y < area.y + area.height - VISIBLE_MARGIN);
  return { ...(visible ? { x, y } : {}), ...size, maximized: value.maximized === true };
}
