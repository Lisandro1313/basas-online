'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { clientDb } from './firebase';
import { getVolume } from './audio';
import type { Session } from './session';

/**
 * Canal de voz entre humanos por WebRTC, en malla (cada par de humanos conectados
 * abre una conexión directa). La señalización (quién está y las ofertas/candidatos)
 * va por Firestore, en la rama `voice/<code>`.
 *
 * Notas honestas:
 *  - Usa STUN gratis de Google. En la mayoría de las redes hogareñas conecta; en
 *    algunas (NAT simétrico) haría falta un TURN, que no tenemos.
 *  - Los bots no están acá: su "voz" es el TTS que ya suena en cada cliente.
 */

const STUN: RTCConfiguration = {
  iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }],
};

const HEARTBEAT_MS = 12000;
const STALE_MS = 35000;

export interface VoicePeer {
  id: string;
  name: string;
  speaking: boolean;
}

export interface VoiceHook {
  available: boolean;
  joined: boolean;
  connecting: boolean;
  muted: boolean;
  error: string | null;
  peers: VoicePeer[];
  speakingSelf: boolean;
  join: () => Promise<void>;
  leave: () => void;
  toggleMute: () => void;
}

export function useVoice(code: string, session: Session | null, myName: string): VoiceHook {
  const db = clientDb();
  const available = Boolean(
    db && typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia
  );

  const [joined, setJoined] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [peers, setPeers] = useState<VoicePeer[]>([]);
  const [speakingSelf, setSpeakingSelf] = useState(false);

  const myId = session?.playerId ?? '';
  const localStream = useRef<MediaStream | null>(null);
  const pcs = useRef<Map<string, RTCPeerConnection>>(new Map());
  const audioEls = useRef<Map<string, HTMLAudioElement>>(new Map());
  const analysers = useRef<Map<string, () => void>>(new Map());
  const unsubs = useRef<Array<() => void>>([]);
  const cleanupRef = useRef<() => void>(() => {});

  // El slider de "canal de voz" cambia el volumen de lo que escuchás de los demás.
  useEffect(() => {
    const onVol = (e: Event) => {
      const d = (e as CustomEvent<{ kind: string; value: number }>).detail;
      if (d?.kind !== 'voice') return;
      audioEls.current.forEach((el) => (el.volume = d.value));
    };
    window.addEventListener('basas:volume', onVol);
    return () => window.removeEventListener('basas:volume', onVol);
  }, []);

  /** Detecta si un stream tiene voz (para el indicador de "hablando"). */
  const watchLevel = useCallback((id: string, stream: MediaStream, isSelf: boolean) => {
    try {
      const AC =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const ac = new AC();
      const src = ac.createMediaStreamSource(stream);
      const analyser = ac.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      let raf = 0;
      const tick = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        const speaking = avg > 12;
        if (isSelf) setSpeakingSelf(speaking);
        else
          setPeers((prev) =>
            prev.map((p) => (p.id === id ? { ...p, speaking } : p))
          );
        raf = requestAnimationFrame(tick);
      };
      tick();
      analysers.current.set(id, () => {
        cancelAnimationFrame(raf);
        ac.close().catch(() => {});
      });
    } catch {
      /* el indicador es opcional */
    }
  }, []);

  const join = useCallback(async () => {
    if (!db || !myId || joined || connecting) return;
    setConnecting(true);
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStream.current = stream;
      watchLevel('self', stream, true);

      const peersCol = collection(db, 'voice', code, 'peers');
      const myRef = doc(peersCol, myId);

      // Anunciar presencia + latido.
      await setDoc(myRef, { name: myName, at: Date.now(), hb: serverTimestamp() });
      const hb = setInterval(() => {
        void setDoc(myRef, { name: myName, at: Date.now(), hb: serverTimestamp() }, { merge: true });
      }, HEARTBEAT_MS);

      const signalsCol = collection(db, 'voice', code, 'signals');

      // Crea (o devuelve) la conexión con un par.
      const ensurePc = (peerId: string): RTCPeerConnection => {
        let pc = pcs.current.get(peerId);
        if (pc) return pc;
        pc = new RTCPeerConnection(STUN);
        stream.getTracks().forEach((t) => pc!.addTrack(t, stream));

        pc.onicecandidate = (e) => {
          if (e.candidate) {
            void setDoc(doc(signalsCol), {
              from: myId,
              to: peerId,
              type: 'candidate',
              data: JSON.stringify(e.candidate),
              at: Date.now(),
            });
          }
        };
        pc.ontrack = (e) => {
          let el = audioEls.current.get(peerId);
          if (!el) {
            el = document.createElement('audio');
            el.autoplay = true;
            audioEls.current.set(peerId, el);
          }
          el.srcObject = e.streams[0];
          el.volume = getVolume('voice');
          void el.play().catch(() => {});
          watchLevel(peerId, e.streams[0], false);
        };
        pcs.current.set(peerId, pc);
        return pc;
      };

      // El par con id menor inicia (evita que ambos oferten a la vez).
      const startOffer = async (peerId: string) => {
        const pc = ensurePc(peerId);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await setDoc(doc(signalsCol), {
          from: myId,
          to: peerId,
          type: 'offer',
          data: JSON.stringify(offer),
          at: Date.now(),
        });
      };

      // Presencia: al aparecer un par nuevo, conectamos.
      const seen = new Set<string>();
      const unsubPeers = onSnapshot(peersCol, (snap) => {
        const list: VoicePeer[] = [];
        const nowIds = new Set<string>();
        const nowMs = Date.now();
        snap.forEach((d) => {
          const data = d.data() as { name?: string; at?: number };
          if (d.id === myId) return;
          if (data.at && nowMs - data.at > STALE_MS) {
            void deleteDoc(d.ref).catch(() => {}); // limpiar fantasmas
            return;
          }
          nowIds.add(d.id);
          list.push({
            id: d.id,
            name: data.name ?? '???',
            speaking: peers.find((p) => p.id === d.id)?.speaking ?? false,
          });
          if (!seen.has(d.id)) {
            seen.add(d.id);
            if (myId < d.id) void startOffer(d.id); // el menor inicia
          }
        });
        // Cerrar conexiones de los que se fueron.
        for (const [pid, pc] of pcs.current) {
          if (!nowIds.has(pid)) {
            pc.close();
            pcs.current.delete(pid);
            audioEls.current.get(pid)?.remove();
            audioEls.current.delete(pid);
            analysers.current.get(pid)?.();
            analysers.current.delete(pid);
            seen.delete(pid);
          }
        }
        setPeers(list);
      });

      // Señales dirigidas a mí: ofertas, respuestas y candidatos.
      const unsubSignals = onSnapshot(signalsCol, (snap) => {
        snap.docChanges().forEach(async (ch) => {
          if (ch.type !== 'added') return;
          const s = ch.doc.data() as { from: string; to: string; type: string; data: string };
          if (s.to !== myId) return;
          void deleteDoc(ch.doc.ref).catch(() => {}); // consumida
          const pc = ensurePc(s.from);
          try {
            if (s.type === 'offer') {
              await pc.setRemoteDescription(JSON.parse(s.data));
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              await setDoc(doc(signalsCol), {
                from: myId,
                to: s.from,
                type: 'answer',
                data: JSON.stringify(answer),
                at: Date.now(),
              });
            } else if (s.type === 'answer') {
              await pc.setRemoteDescription(JSON.parse(s.data));
            } else if (s.type === 'candidate') {
              await pc.addIceCandidate(JSON.parse(s.data));
            }
          } catch {
            /* señal fuera de orden: se ignora */
          }
        });
      });

      unsubs.current = [unsubPeers, unsubSignals];

      // Cómo desconectarse (se llama al salir o desmontar).
      cleanupRef.current = () => {
        clearInterval(hb);
        unsubs.current.forEach((u) => u());
        unsubs.current = [];
        pcs.current.forEach((pc) => pc.close());
        pcs.current.clear();
        audioEls.current.forEach((el) => el.remove());
        audioEls.current.clear();
        analysers.current.forEach((stop) => stop());
        analysers.current.clear();
        localStream.current?.getTracks().forEach((t) => t.stop());
        localStream.current = null;
        void deleteDoc(myRef).catch(() => {});
        seen.clear();
      };

      setJoined(true);
    } catch (e) {
      setError(
        e instanceof DOMException && e.name === 'NotAllowedError'
          ? 'No diste permiso al micrófono.'
          : 'No se pudo activar el micrófono.'
      );
    } finally {
      setConnecting(false);
    }
  }, [db, myId, joined, connecting, code, myName, peers, watchLevel]);

  const leave = useCallback(() => {
    cleanupRef.current();
    cleanupRef.current = () => {};
    setJoined(false);
    setPeers([]);
    setSpeakingSelf(false);
    setMuted(false);
  }, []);

  const toggleMute = useCallback(() => {
    const s = localStream.current;
    if (!s) return;
    const next = !muted;
    s.getAudioTracks().forEach((t) => (t.enabled = !next));
    setMuted(next);
  }, [muted]);

  // Al desmontar (salir de la sala), cortar todo.
  useEffect(() => {
    return () => cleanupRef.current();
  }, []);

  // Si se cierra la pestaña, borrar la presencia.
  useEffect(() => {
    const onUnload = () => cleanupRef.current();
    window.addEventListener('pagehide', onUnload);
    return () => window.removeEventListener('pagehide', onUnload);
  }, []);

  return {
    available,
    joined,
    connecting,
    muted,
    error,
    peers,
    speakingSelf,
    join,
    leave,
    toggleMute,
  };
}
