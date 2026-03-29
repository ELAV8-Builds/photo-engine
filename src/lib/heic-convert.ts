/**
 * Convert HEIC/HEIF images to JPEG for browser preview.
 *
 * Strategy (in order):
 * 1. Check magic bytes to confirm HEIC format (catches misidentified files)
 * 2. Try native browser decoding (works on Safari/macOS) via canvas extraction
 * 3. Try heic-to (modern, uses libheif 1.21.2 — handles latest iPhone formats)
 * 4. Fall back to heic2any library conversion with timeout + retry
 * 5. All paths produce a JPEG blob the browser can display anywhere
 */

// ---------------------------------------------------------------------------
// HEIC Detection
// ---------------------------------------------------------------------------

/** Quick check by filename / MIME type */
export function isHeicFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    name.endsWith('.heic') ||
    name.endsWith('.heif') ||
    file.type === 'image/heic' ||
    file.type === 'image/heif'
  );
}

/**
 * Robust HEIC detection via magic bytes. Reads the first 12 bytes and checks
 * for an ISO Base Media File Format 'ftyp' box with HEIC-related brands.
 * This catches HEIC files even when the OS reports an empty or wrong MIME type.
 */
export async function isHeicByMagicBytes(file: File): Promise<boolean> {
  try {
    const buffer = await file.slice(0, 12).arrayBuffer();
    if (buffer.byteLength < 12) return false;

    const view = new DataView(buffer);
    // ISO BMFF: bytes 4-7 should be 'ftyp' (0x66747970)
    if (view.getUint32(4) !== 0x66747970) return false;

    // Bytes 8-11: major brand
    const brand = String.fromCharCode(
      view.getUint8(8),
      view.getUint8(9),
      view.getUint8(10),
      view.getUint8(11),
    );
    return ['heic', 'heix', 'hevc', 'mif1', 'msf1', 'hevx'].includes(brand);
  } catch {
    return false;
  }
}

/**
 * Combined HEIC detection: filename/MIME first (fast), then magic bytes (definitive).
 */
export async function isDefinitelyHeic(file: File): Promise<boolean> {
  if (isHeicFile(file)) return true;

  // Some systems report HEIC files as application/octet-stream or empty type
  if (
    file.type === '' ||
    file.type === 'application/octet-stream' ||
    file.type === 'application/x-unknown'
  ) {
    return isHeicByMagicBytes(file);
  }

  return false;
}

// ---------------------------------------------------------------------------
// Conversion utilities
// ---------------------------------------------------------------------------

function canvasToJpegBlob(canvas: HTMLCanvasElement | OffscreenCanvas, quality = 0.92): Promise<Blob> {
  if (canvas instanceof OffscreenCanvas) {
    return canvas.convertToBlob({ type: 'image/jpeg', quality });
  }
  return new Promise((resolve, reject) => {
    (canvas as HTMLCanvasElement).toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Canvas toBlob returned null'))),
      'image/jpeg',
      quality,
    );
  });
}

/**
 * Wrap a promise with a timeout. Rejects with a clear error if the operation
 * takes longer than `ms` milliseconds.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms / 1000}s`)),
      ms,
    );
    promise
      .then((val) => {
        clearTimeout(timer);
        resolve(val);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

// ---------------------------------------------------------------------------
// Strategy 1: Native browser decode (Safari/macOS, Chrome 122+)
// ---------------------------------------------------------------------------

async function tryNativeDecode(file: File): Promise<{ blob: Blob; url: string } | null> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = new Image();
    const loaded = await withTimeout(
      new Promise<boolean>((resolve) => {
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        img.src = objectUrl;
      }),
      10000,
      'Native HEIC decode',
    );

    if (!loaded || img.naturalWidth === 0) return null;

    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(img, 0, 0);

    // Verify the canvas actually has image data (not just blank)
    const pixel = ctx.getImageData(
      Math.floor(canvas.width / 2),
      Math.floor(canvas.height / 2),
      1,
      1,
    ).data;
    const isBlank = pixel[0] === 0 && pixel[1] === 0 && pixel[2] === 0 && pixel[3] === 0;
    if (isBlank) return null;

    const blob = await canvasToJpegBlob(canvas);
    const url = URL.createObjectURL(blob);
    console.log(`[HEIC] Native decode succeeded for ${file.name} (${img.naturalWidth}x${img.naturalHeight})`);
    return { blob, url };
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

// ---------------------------------------------------------------------------
// Strategy 2: heic-to (modern, libheif 1.21.2)
// ---------------------------------------------------------------------------

async function tryHeicTo(file: File): Promise<{ blob: Blob; url: string } | null> {
  try {
    const { heicTo } = await import('heic-to');

    const jpegBlob = await withTimeout(
      heicTo({
        blob: file,
        type: 'image/jpeg',
        quality: 0.92,
      }),
      30000,
      'heic-to conversion',
    );

    if (!jpegBlob || jpegBlob.size === 0) return null;

    const url = URL.createObjectURL(jpegBlob);
    console.log(`[HEIC] heic-to succeeded for ${file.name} (${jpegBlob.size} bytes)`);
    return { blob: jpegBlob, url };
  } catch (err) {
    console.warn(`[HEIC] heic-to failed for ${file.name}:`, err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Strategy 3: heic2any library conversion (legacy fallback)
// ---------------------------------------------------------------------------

async function tryHeic2anySingle(file: File): Promise<{ blob: Blob; url: string }> {
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

async function tryHeic2any(file: File): Promise<{ blob: Blob; url: string } | null> {
  // First attempt with 30s timeout
  try {
    const result = await withTimeout(
      tryHeic2anySingle(file),
      30000,
      'heic2any conversion',
    );
    console.log(`[HEIC] heic2any succeeded for ${file.name}`);
    return result;
  } catch (err) {
    console.warn(`[HEIC] heic2any attempt 1 failed for ${file.name}:`, err);
  }

  // Retry once after a brief pause
  await new Promise((r) => setTimeout(r, 500));

  try {
    const result = await withTimeout(
      tryHeic2anySingle(file),
      30000,
      'heic2any retry',
    );
    console.log(`[HEIC] heic2any retry succeeded for ${file.name}`);
    return result;
  } catch (err) {
    console.warn(`[HEIC] heic2any retry also failed for ${file.name}:`, err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Strategy 4: createImageBitmap fallback (Chrome 120+, some browsers)
// ---------------------------------------------------------------------------

async function tryCreateImageBitmap(file: File): Promise<{ blob: Blob; url: string } | null> {
  try {
    const bitmap = await withTimeout(
      createImageBitmap(file),
      15000,
      'createImageBitmap',
    );

    if (bitmap.width === 0 || bitmap.height === 0) return null;

    // Draw to canvas and extract JPEG
    let canvas: HTMLCanvasElement | OffscreenCanvas;
    let ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

    if (typeof OffscreenCanvas !== 'undefined') {
      canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
    } else {
      canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      ctx = canvas.getContext('2d')!;
    }

    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();

    const blob = await canvasToJpegBlob(canvas);
    if (blob.size < 1000) return null; // Probably a blank image

    const url = URL.createObjectURL(blob);
    console.log(`[HEIC] createImageBitmap succeeded for ${file.name} (${bitmap.width}x${bitmap.height})`);
    return { blob, url };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main conversion function
// ---------------------------------------------------------------------------

export interface HeicConversionResult {
  blob: Blob;
  url: string;
}

/**
 * Convert a HEIC file to JPEG. Tries multiple strategies in order:
 * 1. Native browser decode (Safari, Chrome 122+)
 * 2. heic-to library (modern libheif 1.21.2, handles latest iPhone formats)
 * 3. heic2any library (legacy fallback)
 * 4. createImageBitmap (Chrome/Firefox experimental HEIC support)
 *
 * @throws Error if ALL conversion strategies fail
 */
export async function convertHeicToJpeg(file: File): Promise<HeicConversionResult> {
  console.log(`[HEIC] Starting conversion for ${file.name} (${file.size} bytes, type: "${file.type}")`);

  // Strategy 1: Native decode (Safari, Chrome with HEIC support)
  const native = await tryNativeDecode(file);
  if (native) return native;

  // Strategy 2: heic-to (modern libheif 1.21.2 — handles iPhone 14/15/16 HEIC)
  const heicToResult = await tryHeicTo(file);
  if (heicToResult) return heicToResult;

  // Strategy 3: heic2any (legacy, may fail on newer HEIC variants)
  const heic2anyResult = await tryHeic2any(file);
  if (heic2anyResult) return heic2anyResult;

  // Strategy 4: createImageBitmap (experimental browser support)
  const bitmapResult = await tryCreateImageBitmap(file);
  if (bitmapResult) return bitmapResult;

  // All strategies failed
  throw new Error(
    `HEIC conversion failed for ${file.name}: all 4 strategies failed. ` +
    `The file may be corrupted or use an unsupported HEIC variant.`,
  );
}

// ---------------------------------------------------------------------------
// Other media type checks
// ---------------------------------------------------------------------------

export function isVideoFile(file: File): boolean {
  return (
    file.type.startsWith('video/') ||
    /\.(mp4|mov|webm|avi|mkv|m4v)$/i.test(file.name)
  );
}

export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || isHeicFile(file);
}

export function isMediaFile(file: File): boolean {
  return isImageFile(file) || isVideoFile(file);
}
