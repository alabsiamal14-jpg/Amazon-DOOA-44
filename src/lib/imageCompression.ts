/**
 * Client-side image compression utilities to keep product images fast,
 * cacheable in localStorage, and well below Firestore's 1 MiB document size limit.
 */

export interface ImageCompressionOptions {
  maxDimension?: number;
  maxDataUrlLength?: number;
  initialQuality?: number;
}

const DEFAULT_MAX_DIMENSION = 1000;
const DEFAULT_MAX_DATA_URL_LENGTH = 360_000; // ~270 KB binary, safe for Firestore 1 MiB limit & localStorage
const DEFAULT_INITIAL_QUALITY = 0.82;

function readFileAsRawDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('فشل قراءة ملف الصورة'));
    reader.readAsDataURL(file);
  });
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('تعذر تحميل الصورة للمعالجة'));
    img.src = src;
  });
}

function renderCompressedCanvas(
  img: HTMLImageElement,
  targetMaxDim: number,
  quality: number
): string {
  const naturalW = img.naturalWidth || img.width || targetMaxDim;
  const naturalH = img.naturalHeight || img.height || targetMaxDim;
  const scale = Math.min(1, targetMaxDim / Math.max(naturalW, naturalH));
  const width = Math.max(1, Math.round(naturalW * scale));
  const height = Math.max(1, Math.round(naturalH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable');
  }

  // Fill white background so transparent PNG/WebP convert cleanly to JPEG
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  return canvas.toDataURL('image/jpeg', quality);
}

export async function compressDataUrlIfNeeded(
  dataUrl: string,
  options: ImageCompressionOptions = {}
): Promise<string> {
  if (!dataUrl || !dataUrl.startsWith('data:image/')) {
    return dataUrl;
  }

  const maxDimension = options.maxDimension ?? DEFAULT_MAX_DIMENSION;
  const maxDataUrlLength = options.maxDataUrlLength ?? DEFAULT_MAX_DATA_URL_LENGTH;
  const initialQuality = options.initialQuality ?? DEFAULT_INITIAL_QUALITY;

  if (dataUrl.length <= maxDataUrlLength) {
    return dataUrl;
  }

  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    return dataUrl;
  }

  try {
    const img = await loadImageElement(dataUrl);
    const dimensionSteps = [maxDimension, Math.min(800, maxDimension), 640, 480];
    const qualitySteps = [initialQuality, 0.72, 0.6, 0.48, 0.36];

    let bestResult = dataUrl;

    for (const dim of dimensionSteps) {
      for (const q of qualitySteps) {
        const candidate = renderCompressedCanvas(img, dim, q);
        if (candidate.length < bestResult.length) {
          bestResult = candidate;
        }
        if (candidate.length <= maxDataUrlLength) {
          return candidate;
        }
      }
    }

    return bestResult;
  } catch (err) {
    console.warn('[imageCompression] Fallback to original data URL:', err);
    return dataUrl;
  }
}

export async function compressImageFileToDataUrl(
  file: File | Blob,
  options: ImageCompressionOptions = {}
): Promise<string> {
  const rawDataUrl = await readFileAsRawDataUrl(file);
  const maxDimension = options.maxDimension ?? DEFAULT_MAX_DIMENSION;
  const maxDataUrlLength = options.maxDataUrlLength ?? DEFAULT_MAX_DATA_URL_LENGTH;
  const initialQuality = options.initialQuality ?? DEFAULT_INITIAL_QUALITY;

  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    return rawDataUrl;
  }

  // Always normalize large images or oversized dimensions through canvas
  try {
    const img = await loadImageElement(rawDataUrl);
    const needsResize =
      (img.naturalWidth || 0) > maxDimension || (img.naturalHeight || 0) > maxDimension;

    if (!needsResize && rawDataUrl.length <= maxDataUrlLength) {
      return rawDataUrl;
    }

    const dimensionSteps = [maxDimension, Math.min(800, maxDimension), 640, 480];
    const qualitySteps = [initialQuality, 0.72, 0.6, 0.48, 0.36];

    let bestResult = rawDataUrl;
    for (const dim of dimensionSteps) {
      for (const q of qualitySteps) {
        const candidate = renderCompressedCanvas(img, dim, q);
        if (candidate.length < bestResult.length) {
          bestResult = candidate;
        }
        if (candidate.length <= maxDataUrlLength) {
          return candidate;
        }
      }
    }

    return bestResult;
  } catch {
    return rawDataUrl;
  }
}
