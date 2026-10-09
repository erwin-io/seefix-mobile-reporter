import { Injectable, inject } from '@angular/core';
import { Camera, EncodingType, MediaResult, MediaTypeSelection } from '@capacitor/camera';
import { APP_ENVIRONMENT } from '../../../core/config/app-environment';

export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const MAX_EDGE_PX = 2560;

export interface SelectedPhoto {
  id: string;
  blob: Blob;
  fileName: string;
  mimeType: string;
  size: number;
  /** Object URL for previews; revoke with `release()`. */
  previewUrl: string;
}

export class PhotoPermissionError extends Error {
  constructor() {
    super('Photo access was denied.');
  }
}

export interface GalleryOutcome {
  photos: SelectedPhoto[];
  rejected: number;
}

/**
 * Camera / gallery capture via @capacitor/camera 8 (`takePhoto`, `chooseFromGallery`).
 * On the web the plugin falls back to a standard file picker.
 * Output is always JPEG/PNG/WebP within the upload size limit; HEIC/HEIF and
 * oversized images are re-encoded to JPEG where the platform can decode them.
 */
@Injectable({ providedIn: 'root' })
export class PhotoPickerService {
  private readonly env = inject(APP_ENVIRONMENT);
  private sequence = 0;

  /** Resolves null when the user cancels. */
  async takePhoto(): Promise<SelectedPhoto | null> {
    try {
      const result = await Camera.takePhoto({
        quality: 85,
        correctOrientation: true,
        encodingType: EncodingType.JPEG,
        saveToGallery: false,
        editable: 'no',
      });
      return await this.toSelectedPhoto(result);
    } catch (error) {
      return this.handlePickerError(error, null);
    }
  }

  async chooseFromGallery(limit: number): Promise<GalleryOutcome> {
    try {
      const { results } = await Camera.chooseFromGallery({
        mediaType: MediaTypeSelection.Photo,
        allowMultipleSelection: limit > 1,
        limit,
        quality: 85,
        editable: 'no',
      });
      const photos: SelectedPhoto[] = [];
      let rejected = 0;
      for (const result of results.slice(0, limit)) {
        const photo = await this.toSelectedPhoto(result).catch(() => null);
        if (photo) photos.push(photo);
        else rejected += 1;
      }
      rejected += Math.max(0, results.length - limit);
      return { photos, rejected };
    } catch (error) {
      return this.handlePickerError(error, { photos: [], rejected: 0 });
    }
  }

  release(photo: SelectedPhoto): void {
    URL.revokeObjectURL(photo.previewUrl);
  }

  private async toSelectedPhoto(result: MediaResult): Promise<SelectedPhoto> {
    const raw = await readMediaBlob(result);
    const blob = await normalizeImage(raw, this.env.maxUploadBytes);
    this.sequence += 1;
    const extension = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
    return {
      id: `photo-${Date.now()}-${this.sequence}`,
      blob,
      fileName: `report-photo-${this.sequence}.${extension}`,
      mimeType: blob.type,
      size: blob.size,
      previewUrl: URL.createObjectURL(blob),
    };
  }

  private handlePickerError<T>(error: unknown, cancelled: T): T {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    if (message.includes('cancel') || message.includes('no image') || message.includes('dismiss')) return cancelled;
    if (message.includes('denied') || message.includes('permission') || message.includes('access')) {
      throw new PhotoPermissionError();
    }
    throw error;
  }
}

async function readMediaBlob(result: MediaResult): Promise<Blob> {
  if (result.webPath) {
    const response = await fetch(result.webPath);
    return response.blob();
  }
  if (result.thumbnail) {
    const dataUrl = result.thumbnail.startsWith('data:')
      ? result.thumbnail
      : `data:image/${result.metadata?.format ?? 'jpeg'};base64,${result.thumbnail}`;
    return (await fetch(dataUrl)).blob();
  }
  throw new Error('The selected photo could not be read.');
}

export class ImageRejectedError extends Error {}

/** Keeps accepted images as-is; re-encodes anything else (or too large) to JPEG. */
export async function normalizeImage(blob: Blob, maxBytes: number): Promise<Blob> {
  const accepted = (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(blob.type);
  if (accepted && blob.size <= maxBytes) return blob;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    throw new ImageRejectedError('Unsupported image format.');
  }

  try {
    for (const [edge, quality] of [
      [MAX_EDGE_PX, 0.85],
      [2048, 0.75],
      [1600, 0.7],
    ] as const) {
      const encoded = await encodeJpeg(bitmap, edge, quality);
      if (encoded && encoded.size <= maxBytes) return encoded;
    }
  } finally {
    bitmap.close();
  }
  throw new ImageRejectedError('Image is too large.');
}

function encodeJpeg(bitmap: ImageBitmap, maxEdge: number, quality: number): Promise<Blob | null> {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext('2d');
  if (!context) return Promise.resolve(null);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}
