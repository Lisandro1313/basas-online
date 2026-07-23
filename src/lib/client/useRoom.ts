'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { clientDb } from './firebase';
import type { PublicState } from '@/lib/game/redact';
import type { Session } from './session';

export interface RoomHook {
  state: PublicState | null;
  error: string | null;
  live: boolean;
  busy: boolean;
  act: (payload: Record<string, unknown>, opts?: { silent?: boolean }) => Promise<void>;
  refresh: () => Promise<void>;
  dismissError: () => void;
}

/**
 * Mantiene el estado de la sala al día. Firestore avisa cuando cambia la versión
 * (documento `pulse`, que no lleva datos sensibles) y recién ahí pedimos el
 * estado redactado por HTTP. Además hay un polling lento de respaldo por si el
 * listener no está disponible o se corta.
 */
export function useRoom(code: string, session: Session | null): RoomHook {
  const [state, setState] = useState<PublicState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [busy, setBusy] = useState(false);
  const versionRef = useRef(0);
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const refresh = useCallback(async () => {
    const current = sessionRef.current;
    const params = new URLSearchParams();
    if (current) {
      params.set('playerId', current.playerId);
      params.set('token', current.token);
    }
    try {
      const res = await fetch(`/api/rooms/${code}?${params}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'No se pudo leer la sala.');
        return;
      }
      versionRef.current = data.version;
      setState(data.state);
    } catch {
      setError('Se cortó la conexión con el servidor.');
    }
  }, [code]);

  const act = useCallback(
    async (payload: Record<string, unknown>, opts: { silent?: boolean } = {}) => {
      const current = sessionRef.current;
      if (!current) return;
      // Las acciones silenciosas (avisos de turno vencido) no deben molestar:
      // es normal que otro jugador haya avisado primero y esta llegue tarde.
      if (!opts.silent) setBusy(true);
      try {
        const res = await fetch(`/api/rooms/${code}/action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...payload,
            playerId: current.playerId,
            token: current.token,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          if (!opts.silent) {
            setError(data.error ?? 'No se pudo hacer esa jugada.');
            await refresh();
          }
          return;
        }
        setState(data.state);
      } catch {
        if (!opts.silent) setError('Se cortó la conexión con el servidor.');
      } finally {
        if (!opts.silent) setBusy(false);
      }
    },
    [code, refresh]
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Tiempo real: escuchamos el latido de la sala.
  useEffect(() => {
    const db = clientDb();
    if (!db) return;

    const unsubscribe = onSnapshot(
      doc(db, 'pulse', code.toUpperCase()),
      (snap) => {
        setLive(true);
        const version = (snap.data()?.version as number | undefined) ?? 0;
        if (version > versionRef.current) void refresh();
      },
      () => setLive(false)
    );

    return () => {
      unsubscribe();
      setLive(false);
    };
  }, [code, refresh]);

  // Respaldo: si el listener anda consultamos poco; si no, más seguido.
  useEffect(() => {
    const interval = setInterval(() => void refresh(), live ? 10000 : 2500);
    return () => clearInterval(interval);
  }, [refresh, live]);

  return {
    state,
    error,
    live,
    busy,
    act,
    refresh,
    dismissError: () => setError(null),
  };
}
