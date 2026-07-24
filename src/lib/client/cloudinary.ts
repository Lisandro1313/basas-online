'use client';

/** ¿Está configurado Cloudinary? Si no, el botón "+" ni aparece. */
export function cloudinaryEnabled(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME);
}

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB
const MAX_SECONDS = 6;

/** Lee la duración de un video sin reproducirlo. */
function videoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(v.duration);
    };
    v.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No se pudo leer el video.'));
    };
    v.src = url;
  });
}

/**
 * Sube un video corto a Cloudinary y devuelve su URL.
 *
 * Pide una firma a nuestro servidor y sube directo desde el navegador, así el
 * secret nunca viaja al cliente y no pasamos por el límite de body de Vercel.
 */
export async function uploadEmote(file: File): Promise<string> {
  if (!file.type.startsWith('video/')) throw new Error('Tiene que ser un video.');
  if (file.size > MAX_BYTES) throw new Error('El video pesa demasiado (máx 20 MB).');

  const dur = await videoDuration(file).catch(() => 0);
  if (dur > MAX_SECONDS + 0.5) {
    throw new Error(`El video es muy largo (máx ${MAX_SECONDS} segundos).`);
  }

  const signRes = await fetch('/api/cloudinary/sign', { method: 'POST' });
  if (!signRes.ok) throw new Error('No se pudo preparar la subida.');
  const { cloudName, apiKey, timestamp, folder, signature } = await signRes.json();

  const form = new FormData();
  form.append('file', file);
  form.append('api_key', apiKey);
  form.append('timestamp', String(timestamp));
  form.append('folder', folder);
  form.append('signature', signature);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/video/upload`, {
    method: 'POST',
    body: form,
  });
  const data = await res.json();
  if (!res.ok || !data.secure_url) {
    throw new Error(data.error?.message ?? 'Cloudinary rechazó el video.');
  }
  return data.secure_url as string;
}

/** Reduce una imagen a un lado máximo antes de subirla, para no gastar cuota. */
async function shrinkImage(file: File, maxSide = 1280, quality = 0.82): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo procesar la imagen.');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('No se pudo procesar la imagen.'))),
      'image/jpeg',
      quality
    )
  );
}

/** Recorta cuadrado desde el centro y reduce a `size` px. Para avatares. */
async function squareCrop(file: File, size = 256, quality = 0.85): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo procesar la imagen.');
  ctx.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    size,
    size
  );
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('No se pudo procesar la imagen.'))),
      'image/jpeg',
      quality
    )
  );
}

/**
 * Sube un avatar cuadrado a Cloudinary y devuelve su URL. Así el avatar viaja
 * como una URL corta en el estado, en vez de una data URL pesada que se baja
 * en cada actualización.
 */
export async function uploadAvatar(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Tiene que ser una imagen.');
  const blob = await squareCrop(file);
  return uploadBlob(blob, 'image');
}

/** Firma y sube un blob a Cloudinary; devuelve la URL segura. */
async function uploadBlob(blob: Blob, kind: 'image' | 'video'): Promise<string> {
  const signRes = await fetch('/api/cloudinary/sign', { method: 'POST' });
  if (!signRes.ok) throw new Error('No se pudo preparar la subida.');
  const { cloudName, apiKey, timestamp, folder, signature } = await signRes.json();

  const form = new FormData();
  form.append('file', blob);
  form.append('api_key', apiKey);
  form.append('timestamp', String(timestamp));
  form.append('folder', folder);
  form.append('signature', signature);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${kind}/upload`, {
    method: 'POST',
    body: form,
  });
  const data = await res.json();
  if (!res.ok || !data.secure_url) {
    throw new Error(data.error?.message ?? 'Cloudinary rechazó el archivo.');
  }
  return data.secure_url as string;
}

/** Sube una foto del chat a Cloudinary y devuelve su URL. */
export async function uploadChatImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Tiene que ser una imagen.');

  const blob = await shrinkImage(file);

  const signRes = await fetch('/api/cloudinary/sign', { method: 'POST' });
  if (!signRes.ok) throw new Error('No se pudo preparar la subida.');
  const { cloudName, apiKey, timestamp, folder, signature } = await signRes.json();

  const form = new FormData();
  form.append('file', blob);
  form.append('api_key', apiKey);
  form.append('timestamp', String(timestamp));
  form.append('folder', folder);
  form.append('signature', signature);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: 'POST',
    body: form,
  });
  const data = await res.json();
  if (!res.ok || !data.secure_url) {
    throw new Error(data.error?.message ?? 'Cloudinary rechazó la imagen.');
  }
  return data.secure_url as string;
}
