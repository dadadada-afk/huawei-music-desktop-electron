import { useCallback, useEffect, useRef } from 'react';

/**
 * Drags the current window from anywhere inside it.
 *
 * `-webkit-app-region: drag` is smoother, but a drag region swallows mouse events: the overlay then
 * never fires :hover, so its frame and buttons stay invisible until the pointer lands exactly on one.
 * Tracking the pointer and moving the window over IPC keeps hit-testing intact.
 *
 * Buttons, inputs and links are exempt, otherwise every control would also drag the window.
 */
export function useWindowDrag(): (event: React.MouseEvent) => void {
  const dragging = useRef(false);
  const onMouseDown = useCallback((event: React.MouseEvent) => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest('button, input, a, select, label')) return;
    dragging.current = true;
    window.desktop.window.dragStart({ x: event.screenX, y: event.screenY });
  }, []);
  useEffect(() => {
    const move = (event: MouseEvent) => {
      if (!dragging.current) return;
      window.desktop.window.dragMove({ x: event.screenX, y: event.screenY });
    };
    // A release outside the window still ends the drag, otherwise the overlay would follow the
    // pointer forever after the first dropped mouseup.
    const stop = () => {
      if (!dragging.current) return;
      dragging.current = false;
      window.desktop.window.dragEnd();
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', stop);
    window.addEventListener('blur', stop);
    return () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', stop);
      window.removeEventListener('blur', stop);
    };
  }, []);
  return onMouseDown;
}
