import { Injectable, inject } from '@angular/core';
import { Camera, EncodingType, MediaResult, MediaTypeSelection } from '@capacitor/camera';
import { APP_ENVIRONMENT } from '../../../core/config/app-environment';

export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

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
 * Output is always JPEG/PNG/WebP within the size limit (`maxUploadMb`). Photos are never resized or
 * re-compressed (image quality matters for the AI assessment): HEIC/HEIF is converted to full-size JPEG
 * where the platform can decode it, and anything over the limit is rejected.
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

/** Keeps accepted images as-is; converts other formats to full-size JPEG. Rejects anything over maxBytes. */
export async function normalizeImage(blob: Blob, maxBytes: number): Promise<Blob> {
  const accepted = (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(blob.type);
  const image = accepted ? blob : await toJpeg(blob);
  if (image.size > maxBytes) throw new ImageRejectedError('Image is too large.');
  return image;
}

async function toJpeg(blob: Blob): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    throw new ImageRejectedError('Unsupported image format.');
  }
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) throw new ImageRejectedError('Unsupported image format.');
    context.drawImage(bitmap, 0, 0);
    const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.95));
    if (!jpeg) throw new ImageRejectedError('Unsupported image format.');
    return jpeg;
  } finally {
    bitmap.close();
  }
}
