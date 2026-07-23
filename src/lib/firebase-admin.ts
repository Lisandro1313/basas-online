import { cert, getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

/**
 * Firestore con credenciales de servicio: ignora las security rules y es lo
 * único que puede leer o escribir las salas. Nunca importar desde el cliente.
 */
export function adminDb() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  // En Vercel la clave se pega con \n literales, hay que devolverles el salto.
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      'Faltan FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL y/o FIREBASE_PRIVATE_KEY en las variables de entorno.'
    );
  }

  const app = getApps().length
    ? getApp()
    : initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });

  return getFirestore(app);
}
