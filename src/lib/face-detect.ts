import { FaceRegion } from '@/types';

/**
 * Face detection with MediaPipe primary + canvas skin-tone fallback.
 *
 * MediaPipe FaceDetection is already in package.json. It provides:
 * - Works on ALL skin tones (ML-based, not color-based)
 * - Sub-second detection per image
 * - Returns face landmarks (eyes, nose, mouth, ears)
 * - Works at any scale
 *
 * Falls back to skin-tone detection if MediaPipe fails to load (CDN issue, offline).
 */

// ---------------------------------------------------------------------------
// MediaPipe singleton (lazy-loaded)
// ---------------------------------------------------------------------------

type FaceDetectionModule = typeof import('@mediapipe/face_detection');

let mediapipePromise: Promise<InstanceType<FaceDetectionModule['FaceDetection']> | null> | null = null;
let mediapipeAvailable = true; // flipped to false after failure

async function getMediapipe(): Promise<InstanceType<FaceDetectionModule['FaceDetection']> | null> {
  if (!mediapipeAvailable) return null;

  if (!mediapipePromise) {
    mediapipePromise = (async () => {
      try {
        const { FaceDetection } = await import('@mediapipe/face_detection');

        const fd = new FaceDetection({
          locateFile: (file: string) =>
            `https://cdn.jsdelivr.net/npm/@mediapipe/face_detection@0.4/${file}`,
        });

        fd.setOptions({
          model: 'short',
          minDetectionConfidence: 0.5,
        });

        await fd.initialize();
        console.log('[FaceDetect] MediaPipe initialized successfully');
        return fd;
      } catch (err) {
        console.warn('[FaceDetect] MediaPipe failed to load, using fallback:', err);
        mediapipeAvailable = false;
        return null;
      }
    })();
  }

  return mediapipePromise;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Detect faces in an image. Uses MediaPipe if available, falls back to
 * canvas-based skin-tone detection.
 */
export async function detectFaces(imageUrl: string): Promise<FaceRegion[]> {
  // Try MediaPipe first
  const mp = await getMediapipe();
  if (mp) {
    try {
      const faces = await detectFacesMediaPipe(mp, imageUrl);
      if (faces.length > 0) {
        console.log(`[FaceDetect] MediaPipe found ${faces.length} face(s)`);
        return faces;
      }
    } catch (err) {
      console.warn('[FaceDetect] MediaPipe detection error, trying fallback:', err);
    }
  }

  // Fallback to skin-tone detection
  return detectFacesSkinTone(imageUrl);
}

/**
 * Detect faces in video at specific timestamps.
 * Returns a map of timestamp -> detected faces.
 */
export async function detectFacesInVideo(
  videoUrl: string,
  timestamps: number[],
): Promise<Map<number, FaceRegion[]>> {
  const results = new Map<number, FaceRegion[]>();

  try {
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';
    video.src = videoUrl;

    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('Failed to load video'));
      setTimeout(() => reject(new Error('Video load timeout')), 15000);
    });

    const mp = await getMediapipe();

    for (const ts of timestamps) {
      video.currentTime = ts;
      await new Promise<void>((resolve) => {
        video.onseeked = () => resolve();
      });

      if (mp) {
        try {
          const faces = await detectVideoFrameMediaPipe(mp, video);
          results.set(ts, faces);
          continue;
        } catch {
          // Fall through to skin-tone
        }
      }

      // Fallback: capture frame and run skin-tone detection
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0);
        const url = canvas.toDataURL('image/jpeg', 0.7);
        const faces = await detectFacesSkinTone(url);
        results.set(ts, faces);
      } else {
        results.set(ts, []);
      }
    }
  } catch (err) {
    console.warn('[FaceDetect] Video face detection failed:', err);
  }

  return results;
}

/**
 * Find the timestamp with the most/best faces from a detection map.
 */
export function getBestFaceFrame(
  faceMap: Map<number, FaceRegion[]>,
): { timestamp: number; faces: FaceRegion[] } | null {
  let bestTs = -1;
  let bestScore = 0;
  let bestFaces: FaceRegion[] = [];

  const entries = Array.from(faceMap.entries());
  for (const [ts, faces] of entries) {
    // Score = sum of (face area × confidence)
    const score = faces.reduce(
      (sum: number, f: FaceRegion) => sum + f.width * f.height * f.confidence,
      0,
    );
    if (score > bestScore) {
      bestScore = score;
      bestTs = ts;
      bestFaces = faces;
    }
  }

  if (bestTs < 0) return null;
  return { timestamp: bestTs, faces: bestFaces };
}

/**
 * Calculate smart crop center based on face regions
 */
export function getSmartCropCenter(
  faces: FaceRegion[],
  imageWidth: number,
  imageHeight: number
): { x: number; y: number } {
  if (faces.length === 0) {
    return { x: imageWidth / 2, y: imageHeight / 2 };
  }

  // Weight by face size (larger faces = more important)
  let totalWeight = 0;
  let weightedX = 0;
  let weightedY = 0;

  for (const face of faces) {
    const weight = face.width * face.height * face.confidence;
    weightedX += (face.x + face.width / 2) * weight;
    weightedY += (face.y + face.height / 2) * weight;
    totalWeight += weight;
  }

  return {
    x: weightedX / totalWeight,
    y: weightedY / totalWeight,
  };
}

// ---------------------------------------------------------------------------
// MediaPipe detection (primary)
// ---------------------------------------------------------------------------

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = url;
  });
}

async function detectFacesMediaPipe(
  fd: InstanceType<FaceDetectionModule['FaceDetection']>,
  imageUrl: string,
): Promise<FaceRegion[]> {
  const img = await loadImage(imageUrl);
  const w = img.naturalWidth;
  const h = img.naturalHeight;

  const faces = await new Promise<FaceRegion[]>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('MediaPipe timeout')), 10000);

    fd.onResults((results) => {
      clearTimeout(timeout);
      const detected: FaceRegion[] = results.detections.map((det) => {
        const bb = det.boundingBox;
        // NormalizedRect: xCenter/yCenter/width/height are 0-1 normalized
        return {
          x: (bb.xCenter - bb.width / 2) * w,
          y: (bb.yCenter - bb.height / 2) * h,
          width: bb.width * w,
          height: bb.height * h,
          confidence: 0.9, // MediaPipe doesn't expose score directly on boundingBox
        };
      });
      resolve(detected);
    });

    fd.send({ image: img }).catch(reject);
  });

  return faces.slice(0, 10);
}

async function detectVideoFrameMediaPipe(
  fd: InstanceType<FaceDetectionModule['FaceDetection']>,
  video: HTMLVideoElement,
): Promise<FaceRegion[]> {
  const w = video.videoWidth;
  const h = video.videoHeight;

  const faces = await new Promise<FaceRegion[]>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('MediaPipe timeout')), 5000);

    fd.onResults((results) => {
      clearTimeout(timeout);
      const detected: FaceRegion[] = results.detections.map((det) => {
        const bb = det.boundingBox;
        return {
          x: (bb.xCenter - bb.width / 2) * w,
          y: (bb.yCenter - bb.height / 2) * h,
          width: bb.width * w,
          height: bb.height * h,
          confidence: 0.9,
        };
      });
      resolve(detected);
    });

    fd.send({ image: video }).catch(reject);
  });

  return faces.slice(0, 10);
}

// ---------------------------------------------------------------------------
// Skin-tone fallback (existing approach, improved)
// ---------------------------------------------------------------------------

async function detectFacesSkinTone(imageUrl: string): Promise<FaceRegion[]> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve([]);
          return;
        }

        // Scale down for faster processing — use 600px instead of 400px for better accuracy
        const scale = Math.min(1, 600 / Math.max(img.width, img.height));
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const faces = findSkinRegions(imageData, scale);
        resolve(faces);
      } catch {
        resolve([]);
      }
    };
    img.onerror = () => resolve([]);
    img.src = imageUrl;
  });
}

function findSkinRegions(imageData: ImageData, scale: number): FaceRegion[] {
  const { data, width, height } = imageData;
  const skinMap = new Uint8Array(width * height);

  // Detect skin-tone pixels (expanded range for better coverage)
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    if (isSkinTone(r, g, b)) {
      skinMap[i / 4] = 1;
    }
  }

  // Find connected regions
  const regions = findConnectedRegions(skinMap, width, height);

  // Filter: face-shaped regions (roughly square-ish, minimum size)
  const minSize = Math.min(width, height) * 0.04; // Reduced from 0.05 for smaller faces
  const faces: FaceRegion[] = [];

  for (const region of regions) {
    const rw = region.maxX - region.minX;
    const rh = region.maxY - region.minY;
    const aspect = rw / (rh || 1);

    // Tighter aspect ratio filter (0.55-1.8 instead of 0.5-2.0) to reduce false positives
    if (rw >= minSize && rh >= minSize && aspect > 0.55 && aspect < 1.8 && region.pixels > minSize * minSize * 0.25) {
      faces.push({
        x: region.minX / scale,
        y: region.minY / scale,
        width: rw / scale,
        height: rh / scale,
        confidence: Math.min(0.7, region.pixels / (rw * rh)), // Lower max confidence for fallback
      });
    }
  }

  return faces.slice(0, 10);
}

function isSkinTone(r: number, g: number, b: number): boolean {
  // YCbCr skin detection — expanded ranges for better coverage across skin tones
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  const cb = -0.169 * r - 0.331 * g + 0.500 * b + 128;
  const cr = 0.500 * r - 0.419 * g - 0.081 * b + 128;

  // Widened ranges: lower Y threshold (60 from 80) for darker skin tones
  return y > 60 && cb > 77 && cb < 137 && cr > 133 && cr < 185;
}

interface Region {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  pixels: number;
}

function findConnectedRegions(map: Uint8Array, width: number, height: number): Region[] {
  const visited = new Uint8Array(width * height);
  const regions: Region[] = [];

  // Reduced stride from 3 to 2 for better small-face detection
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const idx = y * width + x;
      if (map[idx] && !visited[idx]) {
        const region = floodFill(map, visited, width, height, x, y);
        if (region.pixels > 15) { // Reduced from 20
          regions.push(region);
        }
      }
    }
  }

  return regions.sort((a, b) => b.pixels - a.pixels).slice(0, 8);
}

function floodFill(
  map: Uint8Array,
  visited: Uint8Array,
  width: number,
  height: number,
  startX: number,
  startY: number
): Region {
  const stack: [number, number][] = [[startX, startY]];
  const region: Region = {
    minX: startX,
    minY: startY,
    maxX: startX,
    maxY: startY,
    pixels: 0,
  };

  while (stack.length > 0 && region.pixels < 50000) {
    const point = stack.pop();
    if (!point) break;
    const [x, y] = point;
    const idx = y * width + x;

    if (x < 0 || x >= width || y < 0 || y >= height) continue;
    if (visited[idx] || !map[idx]) continue;

    visited[idx] = 1;
    region.pixels++;
    region.minX = Math.min(region.minX, x);
    region.minY = Math.min(region.minY, y);
    region.maxX = Math.max(region.maxX, x);
    region.maxY = Math.max(region.maxY, y);

    // Check neighbors (with stride for speed)
    stack.push([x + 2, y], [x - 2, y], [x, y + 2], [x, y - 2]);
  }

  return region;
}
