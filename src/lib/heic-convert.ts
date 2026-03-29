/**
 * Convert HEIC/HEIF images to JPEG for browser preview.
 * Uses heic2any for client-side conversion.
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

export async function convertHeicToJpeg(file: File): Promise<{ blob: Blob; url: string }> {
  // Dynamic import to avoid SSR issues
  const heic2any = (await import('heic2any')).default;

  const result = await heic2any({
    blob: file,
    toType: 'image/jpeg',
    quality: 0.92,
  });

  // heic2any can return Blob | Blob[]
  const blob = Array.isArray(result) ? result[0] : result;
  const url = URL.createObjectURL(blob);

  return { blob, url };
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
