import { FaceRegion } from '@/types';

/**
 * Detect faces in an image using Canvas-based analysis.
 * Uses a lightweight skin-tone + feature detection approach
 * that works entirely in the browser without external dependencies.
 *
 * For production, swap in MediaPipe or TensorFlow.js face detection.
 */
export async function detectFaces(imageUrl: string): Promise<FaceRegion[]> {
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

        // Scale down for faster processing
        const scale = Math.min(1, 400 / Math.max(img.width, img.height));
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

  // Detect skin-tone pixels
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

  // Filter: face-shaped regions (roughly square, minimum size)
  const minSize = Math.min(width, height) * 0.05;
  const faces: FaceRegion[] = [];

  for (const region of regions) {
    const rw = region.maxX - region.minX;
    const rh = region.maxY - region.minY;
    const aspect = rw / (rh || 1);

    if (rw >= minSize && rh >= minSize && aspect > 0.5 && aspect < 2.0 && region.pixels > minSize * minSize * 0.3) {
      faces.push({
        x: region.minX / scale,
        y: region.minY / scale,
        width: rw / scale,
        height: rh / scale,
        confidence: Math.min(0.9, region.pixels / (rw * rh)),
      });
    }
  }

  return faces.slice(0, 10); // Max 10 faces
}

function isSkinTone(r: number, g: number, b: number): boolean {
  // YCbCr skin detection
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  const cb = -0.169 * r - 0.331 * g + 0.500 * b + 128;
  const cr = 0.500 * r - 0.419 * g - 0.081 * b + 128;

  return y > 80 && cb > 85 && cb < 135 && cr > 135 && cr < 180;
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

  for (let y = 0; y < height; y += 3) {
    for (let x = 0; x < width; x += 3) {
      const idx = y * width + x;
      if (map[idx] && !visited[idx]) {
        const region = floodFill(map, visited, width, height, x, y);
        if (region.pixels > 20) {
          regions.push(region);
        }
      }
    }
  }

  return regions.sort((a, b) => b.pixels - a.pixels).slice(0, 5);
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
