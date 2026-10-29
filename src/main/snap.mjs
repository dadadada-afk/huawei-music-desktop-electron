// Pulls a dragged overlay onto a desktop edge. Kept free of Electron so the catch zones can be
// asserted without a display: the only inputs are the window box and the work area.
const SNAP_DISTANCE = 28;
const BOTTOM_CENTRE_ZONE = 72;

/**
 * @param {{ x: number, y: number }} position
 * @param {{ width: number, height: number }} size
 * @param {{ x: number, y: number, width: number, height: number }} area  work area, not the full display
 * @returns {{ x: number, y: number }}
 */
export function snapPosition(position, size, area) {
  const { x, y } = position;
  const { width, height } = size;
  let nextX = x;
  let nextY = y;
  if (Math.abs(x - area.x) <= SNAP_DISTANCE) nextX = area.x;
  if (Math.abs(x + width - (area.x + area.width)) <= SNAP_DISTANCE) nextX = area.x + area.width - width;
  if (Math.abs(y - area.y) <= SNAP_DISTANCE) nextY = area.y;
  if (Math.abs(y + height - (area.y + area.height)) <= SNAP_DISTANCE) nextY = area.y + area.height - height;
  const centreX = Math.round(area.x + (area.width - width) / 2);
  const nearBottom = Math.abs(y + height - (area.y + area.height)) <= BOTTOM_CENTRE_ZONE;
  if (nearBottom && Math.abs(x - centreX) <= BOTTOM_CENTRE_ZONE) {
    nextX = centreX;
    nextY = area.y + area.height - height;
  }
  return { x: nextX, y: nextY };
}
