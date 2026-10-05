export interface DuotoneColors {
  dark: readonly [number, number, number];
  light: readonly [number, number, number];
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

export function getContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable');
  }
  return ctx;
}

export function createScaledCanvas(img: HTMLImageElement, maxDimension: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const naturalWidth = img.naturalWidth;
  const naturalHeight = img.naturalHeight;
  const scale = Math.min(1, maxDimension / Math.max(naturalWidth, naturalHeight));
  canvas.width = Math.max(1, Math.round(naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(naturalHeight * scale));
  const ctx = getContext(canvas);
  ctx.imageSmoothingQuality = 'high';
  return canvas;
}

export function drawPlain(canvas: HTMLCanvasElement, img: HTMLImageElement): void {
  const ctx = getContext(canvas);
  ctx.filter = 'none';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
}

export function drawWithFilter(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  filter: string,
): void {
  const ctx = getContext(canvas);
  ctx.filter = filter;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  ctx.filter = 'none';
}

export function applyDuotone(canvas: HTMLCanvasElement, colors: DuotoneColors): void {
  const ctx = getContext(canvas);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const [dr, dg, db] = colors.dark;
  const [lr, lg, lb] = colors.light;
  for (let i = 0; i < data.length; i += 4) {
    const luminance = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
    data[i] = dr + (lr - dr) * luminance;
    data[i + 1] = dg + (lg - dg) * luminance;
    data[i + 2] = db + (lb - db) * luminance;
  }
  ctx.putImageData(imageData, 0, 0);
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png'): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('canvas.toBlob returned null'));
      }
    }, type);
  });
}

export function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}
