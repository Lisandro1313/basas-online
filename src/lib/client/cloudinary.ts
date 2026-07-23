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
