import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { ImagePlus, Images, Trash2, Upload, X } from "lucide-react";
import type { GalleryPhoto } from "../lib/types";
import { prepareGalleryPhoto } from "../lib/gallery";
import Modal from "./Modal";
import "./gallery.css";

interface GalleryPanelProps {
  photos: GalleryPhoto[];
  onUploadGalleryPhoto: (photo: Blob, caption: string) => Promise<void>;
  onDeleteGalleryPhoto: (id: string) => Promise<void>;
  error: string;
  onToast: (message: string) => void;
}

export default function GalleryPanel({
  photos,
  onUploadGalleryPhoto,
  onDeleteGalleryPhoto,
  error: galleryError,
  onToast,
}: GalleryPanelProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  const [selection, setSelection] = useState<{
    blob: Blob;
    url: string;
  } | null>(null);
  const [caption, setCaption] = useState("");
  const [operation, setOperation] = useState<
    "prepare" | "upload" | "delete" | null
  >(null);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<GalleryPhoto | null>(null);
  const busy = operation !== null;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  useEffect(() => {
    const url = selection?.url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [selection?.url]);

  async function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || busyRef.current || galleryError) return;
    busyRef.current = true;
    setOperation("prepare");
    setError("");
    setSelection(null);
    try {
      const blob = await prepareGalleryPhoto(file);
      if (mountedRef.current) {
        setSelection({ blob, url: URL.createObjectURL(blob) });
      }
    } catch (cause) {
      if (mountedRef.current) {
        setError(
          cause instanceof Error
            ? cause.message
            : "No se ha podido abrir la foto.",
        );
      }
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setOperation(null);
    }
  }

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selection || busyRef.current || galleryError) return;
    busyRef.current = true;
    setOperation("upload");
    setError("");
    try {
      await onUploadGalleryPhoto(selection.blob, caption.trim());
      onToast("Foto publicada en la galería.");
      if (mountedRef.current) {
        setSelection(null);
        setCaption("");
      }
    } catch (cause) {
      if (mountedRef.current) {
        setError(
          cause instanceof Error
            ? cause.message
            : "No se ha podido publicar la foto.",
        );
      }
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setOperation(null);
    }
  }

  function closeDelete() {
    if (busyRef.current) return;
    setDeleting(null);
    setError("");
  }

  async function deletePhoto() {
    if (!deleting || busyRef.current || galleryError) return;
    busyRef.current = true;
    setOperation("delete");
    setError("");
    try {
      await onDeleteGalleryPhoto(deleting.id);
      onToast("Foto eliminada de la galería.");
      if (mountedRef.current) setDeleting(null);
    } catch (cause) {
      if (mountedRef.current) {
        setError(
          cause instanceof Error
            ? cause.message
            : "No se ha podido eliminar la foto.",
        );
      }
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setOperation(null);
    }
  }

  return (
    <>
      <div className="admin-toolbar">
        <div>
          <h2>Galería de cortes</h2>
          <p>
            Comparte tus trabajos. Las fotos publicadas aparecen en el inicio.
          </p>
        </div>
        <span className="admin-client-total">
          {photos.length} {photos.length === 1 ? "foto" : "fotos"}
        </span>
      </div>

      {galleryError && (
        <div className="admin-error gallery-setup-error" role="alert">
          {galleryError}
        </div>
      )}

      <form className="gallery-upload-card" onSubmit={publish}>
        <div className="gallery-upload-intro">
          <span className="gallery-upload-icon">
            <ImagePlus size={22} />
          </span>
          <div>
            <h3>Publicar un nuevo corte</h3>
            <p>
              Elige una foto de tu galería y añade una descripción si quieres.
            </p>
          </div>
        </div>
        <input
          ref={fileInput}
          className="gallery-file-input"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-label="Elegir foto del corte"
          onChange={choosePhoto}
          disabled={busy || !!galleryError}
        />

        {selection && (
          <div className="gallery-upload-preview">
            <img src={selection.url} alt="Vista previa de la foto elegida" />
            <button
              className="gallery-preview-remove"
              type="button"
              aria-label="Quitar foto elegida"
              disabled={busy}
              onClick={() => {
                setSelection(null);
                setError("");
              }}
            >
              <X size={18} />
            </button>
          </div>
        )}

        <div className="gallery-file-picker">
          <button
            className="admin-btn admin-btn-outline"
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={busy || !!galleryError}
          >
            <ImagePlus size={17} />
            {operation === "prepare"
              ? "Preparando foto…"
              : selection
                ? "Cambiar foto"
                : "Elegir foto"}
          </button>
          <small>JPG, PNG o WebP · Hasta 10 MB.</small>
        </div>

        <label className="gallery-caption-label">
          Descripción (opcional)
          <textarea
            aria-label="Descripción del corte (opcional)"
            value={caption}
            onChange={(event) => setCaption(event.target.value)}
            maxLength={120}
            rows={2}
            placeholder="Por ejemplo: degradado con textura"
            disabled={busy || !!galleryError}
          />
          <span className="gallery-caption-count">{caption.length}/120</span>
        </label>
        {error && !deleting && (
          <p className="gallery-action-error" role="alert">
            {error}
          </p>
        )}
        <div className="gallery-upload-footer">
          <p>Publica fotos que tengas permiso para compartir.</p>
          <button
            className="admin-btn admin-btn-lime"
            type="submit"
            disabled={!selection || busy || !!galleryError}
          >
            <Upload size={16} />
            {operation === "upload" ? "Publicando…" : "Publicar foto"}
          </button>
        </div>
      </form>

      {photos.length ? (
        <div className="gallery-admin-grid" aria-label="Fotos publicadas">
          {photos.map((photo, index) => (
            <article className="gallery-admin-photo" key={photo.id}>
              <img
                src={photo.url}
                alt={photo.caption || "Corte realizado en Barber Cruz"}
                loading="lazy"
                decoding="async"
              />
              <div className="gallery-admin-photo-footer">
                <p title={photo.caption || "Sin descripción"}>
                  {photo.caption || "Sin descripción"}
                </p>
                <button
                  className="gallery-delete-button"
                  type="button"
                  aria-label={`Eliminar foto ${index + 1}`}
                  disabled={busy || !!galleryError}
                  onClick={() => {
                    setDeleting(photo);
                    setError("");
                  }}
                >
                  <Trash2 size={17} />
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="gallery-admin-empty">
          <Images size={30} aria-hidden="true" />
          <h3>Tus próximos cortes, aquí</h3>
          <p>
            El carrusel del inicio permanecerá oculto hasta que publiques la
            primera foto.
          </p>
        </div>
      )}

      {deleting && (
        <Modal title="Eliminar foto de la galería" onClose={closeDelete}>
          <h2>¿Eliminar esta foto?</h2>
          <p className="gallery-delete-copy">
            Se retirará de la galería pública. Si es la última foto, el carrusel
            del inicio quedará oculto.
          </p>
          <img
            className="gallery-delete-preview"
            src={deleting.url}
            alt={deleting.caption || "Foto que se eliminará"}
          />
          {error && (
            <p className="gallery-action-error" role="alert">
              {error}
            </p>
          )}
          <div className="gallery-delete-actions">
            <button
              className="admin-btn admin-btn-outline"
              type="button"
              onClick={closeDelete}
              disabled={busy}
            >
              Conservar foto
            </button>
            <button
              className="admin-btn admin-btn-danger"
              type="button"
              onClick={deletePhoto}
              disabled={busy || !!galleryError}
            >
              <Trash2 size={16} />
              {operation === "delete" ? "Eliminando…" : "Eliminar foto"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
