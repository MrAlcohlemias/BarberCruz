const imageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

export function validatePhoto(file: Pick<File, "type" | "size">): void {
  if (!imageTypes.has(file.type))
    throw new Error(
      "Elige una foto JPG, PNG o WebP. Si es HEIC, conviértela a JPG.",
    );
  if (file.size > MAX_PHOTO_BYTES)
    throw new Error("La foto debe ocupar como máximo 10 MB.");
  if (!file.size) throw new Error("La foto está vacía. Elige otra imagen.");
}

/** Resize and re-encode locally so uploads contain no original photo metadata. */
export async function preparePhoto(
  file: File,
  maxDimension = 512,
): Promise<Blob> {
  validatePhoto(file);
  const objectUrl = URL.createObjectURL(file);
  try {
    const photo = new Image();
    photo.src = objectUrl;
    await photo.decode().catch(() => {
      throw new Error(
        "No se ha podido abrir esa foto. Prueba con otra imagen JPG o PNG.",
      );
    });
    if (!photo.naturalWidth || !photo.naturalHeight)
      throw new Error("La imagen no tiene un tamaño válido.");
    const scale = Math.min(
      1,
      maxDimension / Math.max(photo.naturalWidth, photo.naturalHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(photo.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(photo.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Tu navegador no permite preparar la foto.");
    context.fillStyle = "#202020";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(photo, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob || blob.size > 2 * 1024 * 1024)
            reject(
              new Error("No se ha podido reducir la foto. Elige otra imagen."),
            );
          else resolve(blob);
        },
        "image/jpeg",
        0.82,
      );
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function photoDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("No se ha podido leer la foto."));
    reader.readAsDataURL(blob);
  });
}

export function avatarSource(profile: {
  avatar: string;
  avatarUrl?: string;
}): string | undefined {
  if (profile.avatarUrl) return profile.avatarUrl;
  if (
    /^https:\/\//.test(profile.avatar) ||
    /^data:image\/jpeg;base64,/.test(profile.avatar)
  )
    return profile.avatar;
  return undefined;
}

export function avatarObjectPath(
  avatar: string,
  userId: string,
): string | null {
  const prefix = `avatars/${userId}/`;
  const file = avatar.slice(prefix.length);
  return avatar.startsWith(prefix) && /^[0-9a-f-]{36}\.jpg$/i.test(file)
    ? avatar.slice("avatars/".length)
    : null;
}
