/**
 * Convert HEIC/HEIF images to JPEG for browser preview.
 *
 * Strategy:
 * 1. Try native browser decoding (works on Safari/macOS) via canvas extraction
 * 2. Fall back to heic2any library conversion
 * 3. Both paths produce a JPEG blob the browser can display anywhere
 */

export function isHeicFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    name.endsWith('.heic') ||
    name.endsWith('.heif') ||
    file.type === 'image/heic' ||
    file.type === 'image/heif'
  );
}

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Canvas toBlob returned null'))),
      'image/jpeg',
      quality,
    );
  });
}

async function tryNativeDecode(file: File): Promise<{ blob: Blob; url: string } | null> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = new Image();
    const loaded = await new Promise<boolean>((resolve) => {
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = objectUrl;
    });

    if (!loaded || img.naturalWidth === 0) return null;

    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(img, 0, 0);
    const blob = await canvasToJpegBlob(canvas);
    const url = URL.createObjectURL(blob);
    return { blob, url };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function tryHeic2any(file: File): Promise<{ blob: Blob; url: string }> {
  const heic2any = (await import('heic2any')).default;

  const result = await heic2any({
    blob: file,
    toType: 'image/jpeg',
    quality: 0.92,
  });

  const blob = Array.isArray(result) ? result[0] : result;
  const url = URL.createObjectURL(blob);
  return { blob, url };
}

export async function convertHeicToJpeg(file: File): Promise<{ blob: Blob; url: string }> {
  const native = await tryNativeDecode(file);
  if (native) return native;

  return tryHeic2any(file);
}

export function isVideoFile(file: File): boolean {
  return file.type.startsWith('video/') ||
    /\.(mp4|mov|webm|avi|mkv|m4v)$/i.test(file.name);
}

export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || isHeicFile(file);
}

export function isMediaFile(file: File): boolean {
  return isImageFile(file) || isVideoFile(file);
}
