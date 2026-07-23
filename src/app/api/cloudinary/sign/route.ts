import { createHash } from 'crypto';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/cloudinary/sign
 *
 * Devuelve una firma para que el navegador suba el video directo a Cloudinary,
 * sin pasar por acá (así no chocamos con el límite de body de Vercel) y sin que
 * el secret salga nunca del servidor.
 *
 * El navegador después hace POST a
 *   https://api.cloudinary.com/v1_1/<cloud>/video/upload
 * con: file, api_key, timestamp, folder, signature.
 */
export async function POST() {
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    return NextResponse.json({ error: 'Cloudinary no está configurado.' }, { status: 503 });
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const folder = 'basas-emotes';
  // La firma es sha1 de los parámetros ordenados + el secret. Deben ser
  // EXACTAMENTE los mismos que el navegador manda en la subida (menos file,
  // api_key y signature).
  const toSign = `folder=${folder}&timestamp=${timestamp}`;
  const signature = createHash('sha1').update(toSign + apiSecret).digest('hex');

  return NextResponse.json({ cloudName, apiKey, timestamp, folder, signature });
}
