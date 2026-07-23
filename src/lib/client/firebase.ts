'use client';

import { getApp, getApps, initializeApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';

/**
 * Config pública de Firebase. No son secretos: quién puede leer qué lo deciden
 * las security rules (ver firestore.rules), que dejan leer solo `pulse`.
 */
export function clientDb(): Firestore | null {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;

  // Sin config el juego igual anda: cae al polling de respaldo.
  if (!apiKey || !projectId || !appId) return null;

  const app = getApps().length
    ? getApp()
    : initializeApp({
        apiKey,
        projectId,
        appId,
        authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? `${projectId}.firebaseapp.com`,
      });

  return getFirestore(app);
}
