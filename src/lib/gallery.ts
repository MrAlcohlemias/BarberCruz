import { preparePhoto } from "./avatar";
import type { GalleryPhoto } from "./types";

export const GALLERY_BUCKET = "haircuts";
export const MAX_GALLERY_CAPTION = 120;

export interface GalleryPhotoRow {
  id: string;
  object_path: string;
  caption: string;
  created_at: string;
}

export function prepareGalleryPhoto(file: File): Promise<Blob> {
  return preparePhoto(file, 1600);
}

/** Only gallery objects can be passed to the Storage removal API. */
export function isGalleryObjectPath(path: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/.test(
    path,
  );
}

export function galleryPhotoFromRow(
  row: GalleryPhotoRow,
  url: string,
): GalleryPhoto {
  return {
    id: row.id,
    path: row.object_path,
    url,
    caption: row.caption,
    createdAt: row.created_at,
  };
}

export function galleryUnavailableMessage(): string {
  return "Falta activar la galería en Supabase. Ejecuta supabase/gallery.sql en SQL Editor y vuelve a intentarlo.";
}

export function isGalleryNotConfigured(error: { code?: string }): boolean {
  return error.code === "42P01" || error.code === "PGRST205";
}
