/**
 * Renders a share card (cover + three lyric lines) onto a canvas.
 *
 * The cover must arrive as a data URL: a plain cross-origin <img> taints the canvas and makes
 * toDataURL throw, which is why the main process fetches it first.
 */

export type ShareLine = { text: string; current: boolean };

export type ShareCardInput = {
  title: string;
  artists: string;
  lines: ShareLine[];
  accent: string;
  /** `data:image/...` or empty when the track has no artwork. */
  cover?: string;
  dark: boolean;
};

export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1440;
/** Reading width for lyrics; keeps long lines from touching the canvas edge. */
const TEXT_WIDTH = CARD_WIDTH - 200;

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Shrinks the font until the text fits, so a long title never overflows the card. */
function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, startSize: number, family: string, weight: number) {
  let size = startSize;
  do {
    ctx.font = `${weight} ${size}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 4;
  } while (size > 16);
  return size;
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('cover load failed'));
    image.src = src;
  });
}

export function renderShareCard(input: ShareCardInput, cover?: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const family = getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif';
  const ink = input.dark ? '#f2f3f7' : '#1c1f26';
  const dim = input.dark ? 'rgba(242,243,247,0.45)' : 'rgba(28,31,38,0.45)';

  // Backdrop: a soft diagonal wash tinted by the current accent, darker in dark mode.
  const base = input.dark ? ['#15161b', '#1d1f27'] : ['#fbf7f6', '#f1ecea'];
  const wash = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
  wash.addColorStop(0, base[0]);
  wash.addColorStop(1, base[1]);
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  const glow = ctx.createRadialGradient(CARD_WIDTH * 0.72, CARD_HEIGHT * 0.16, 0, CARD_WIDTH * 0.72, CARD_HEIGHT * 0.16, CARD_WIDTH * 0.9);
  glow.addColorStop(0, `${input.accent}33`);
  glow.addColorStop(1, 'transparent');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Cover, or a placeholder disc that still reads as intentional.
  const artSize = 460;
  const artX = (CARD_WIDTH - artSize) / 2;
  const artY = 150;
  ctx.save();
  roundRect(ctx, artX, artY, artSize, artSize, 28);
  ctx.clip();
  if (cover) {
    ctx.drawImage(cover, artX, artY, artSize, artSize);
  } else {
    ctx.fillStyle = input.dark ? '#262832' : '#e7e1de';
    ctx.fillRect(artX, artY, artSize, artSize);
    ctx.fillStyle = input.accent;
    ctx.font = `600 120px ${family}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('♪', CARD_WIDTH / 2, artY + artSize / 2);
  }
  ctx.restore();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  // Title + artists.
  let y = artY + artSize + 96;
  const titleSize = fitText(ctx, input.title, TEXT_WIDTH, 60, family, 700);
  ctx.fillStyle = ink;
  ctx.font = `700 ${titleSize}px ${family}`;
  ctx.fillText(input.title, CARD_WIDTH / 2, y);

  y += 56;
  ctx.fillStyle = dim;
  ctx.font = `400 34px ${family}`;
  ctx.fillText(input.artists, CARD_WIDTH / 2, y);

  // Lyrics: the sung line is the anchor, the neighbours stay quiet around it.
  y += 130;
  for (const line of input.lines) {
    const size = line.current ? 46 : 38;
    const weight = line.current ? 700 : 400;
    const text = line.text || '';
    fitText(ctx, text, TEXT_WIDTH, size, family, weight);
    ctx.font = `${weight} ${size}px ${family}`;
    ctx.fillStyle = line.current ? input.accent : dim;
    ctx.fillText(text, CARD_WIDTH / 2, y);
    y += line.current ? 74 : 62;
  }

  // Footer mark.
  ctx.fillStyle = dim;
  ctx.font = `400 26px ${family}`;
  ctx.fillText('华为音乐 · 学习版', CARD_WIDTH / 2, CARD_HEIGHT - 70);

  return canvas;
}
