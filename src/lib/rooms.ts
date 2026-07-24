import { adminDb } from './firebase-admin';
import { RuleError } from './game/engine';
import type { RoomState } from './game/types';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin I, O, 0, 1

export function makeCode(): string {
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

export function makeId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function makeToken(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

export class NotFoundError extends Error {}
export class ConflictError extends Error {}

/**
 * Guardamos el estado como string JSON en un solo campo. Firestore no acepta
 * `undefined` y tiene reglas propias para anidar arrays; serializando a mano nos
 * ahorramos todo eso, y de la sala nunca necesitamos consultar por dentro.
 */
interface RoomDoc {
  state: string;
  version: number;
  updatedAt: number;
  /**
   * Campos "asomados" fuera del JSON para poder listar las salas. El estado
   * completo va serializado y no se puede consultar por dentro.
   */
  name?: string;
  isPublic?: boolean;
  phase?: string;
  playerCount?: number;
  playerNames?: string[];
  round?: number;
  totalRounds?: number;
}

/** Datos de la sala que se pueden listar sin exponer nada sensible. */
function summary(state: RoomState) {
  const players = [...state.players, ...(state.pending ?? [])];
  return {
    name: state.name ?? `Sala ${state.code}`,
    isPublic: state.isPublic ?? true,
    phase: state.phase,
    playerCount: players.length,
    playerNames: players.map((p) => p.name).slice(0, 8),
    round: state.round,
    totalRounds: state.totalRounds,
  };
}

const roomRef = (code: string) => adminDb().collection('rooms').doc(code.toUpperCase());

/** Doc público con solo el número de versión: es lo que escuchan los clientes. */
const pulseRef = (code: string) => adminDb().collection('pulse').doc(code.toUpperCase());

export async function loadRoom(code: string): Promise<{ state: RoomState; version: number }> {
  const snap = await roomRef(code).get();
  if (!snap.exists) throw new NotFoundError('No existe esa sala.');
  const doc = snap.data() as RoomDoc;
  return { state: JSON.parse(doc.state) as RoomState, version: doc.version };
}

export async function insertRoom(state: RoomState): Promise<void> {
  const now = Date.now();
  const ref = roomRef(state.code);

  const created = await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) return false; // colisión de código, muy poco probable
    tx.set(ref, {
      state: JSON.stringify(state),
      version: 1,
      updatedAt: now,
      ...summary(state),
    } satisfies RoomDoc);
    tx.set(pulseRef(state.code), { version: 1, updatedAt: now });
    return true;
  });

  if (!created) throw new ConflictError('Se repitió el código de sala, probá de nuevo.');
}

/**
 * Lee la sala, le aplica `mutate` y la guarda dentro de una transacción de
 * Firestore, así dos jugadas simultáneas no se pisan.
 */
export async function mutateRoom(
  code: string,
  mutate: (state: RoomState) => void
): Promise<RoomState> {
  const ref = roomRef(code);
  const pulse = pulseRef(code);

  return adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new NotFoundError('No existe esa sala.');

    const doc = snap.data() as RoomDoc;
    const draft = JSON.parse(doc.state) as RoomState;

    mutate(draft);

    const version = doc.version + 1;
    const updatedAt = Date.now();
    tx.set(ref, {
      state: JSON.stringify(draft),
      version,
      updatedAt,
      ...summary(draft),
    } satisfies RoomDoc);
    tx.set(pulse, { version, updatedAt });

    return draft;
  });
}

export interface RoomSummary {
  code: string;
  name: string;
  phase: string;
  playerCount: number;
  playerNames: string[];
  round: number;
  totalRounds: number;
  updatedAt: number;
}

/** Salas sin actividad por más de esto no se listan (evita mesas fantasma). */
export const ROOM_IDLE_MS = 30 * 60 * 1000;

/**
 * Lista las salas con actividad reciente, ordenadas por lo más nuevo.
 * Usa los campos asomados del documento, así no hace falta abrir cada estado.
 */
export async function listRooms(limit = 30): Promise<RoomSummary[]> {
  const db = adminDb();
  const since = Date.now() - ROOM_IDLE_MS;

  const snap = await db
    .collection('rooms')
    .where('updatedAt', '>=', since)
    .orderBy('updatedAt', 'desc')
    .limit(limit)
    .get();

  return (
    snap.docs
      .map((d) => {
        const doc = d.data() as RoomDoc;
        return {
          code: d.id,
          name: doc.name ?? `Sala ${d.id}`,
          phase: doc.phase ?? 'lobby',
          playerCount: doc.playerCount ?? 0,
          playerNames: doc.playerNames ?? [],
          round: doc.round ?? 0,
          totalRounds: doc.totalRounds ?? 0,
          updatedAt: doc.updatedAt ?? 0,
          isPublic: doc.isPublic ?? true,
        };
      })
      // Fuera: privadas, terminadas y vacías.
      .filter((r) => r.isPublic && r.phase !== 'gameOver' && r.playerCount > 0)
      // Primero las que están en lobby (se entra sin esperar), luego lo más nuevo.
      .sort((a, b) => {
        const aLobby = a.phase === 'lobby' ? 0 : 1;
        const bLobby = b.phase === 'lobby' ? 0 : 1;
        return aLobby - bLobby || b.updatedAt - a.updatedAt;
      })
      .map(({ isPublic: _omit, ...r }) => r)
  );
}

export function assertToken(state: RoomState, playerId: string, token: string) {
  const expected = state.tokens[playerId];
  if (!expected || expected !== token) {
    throw new RuleError('Credenciales inválidas para esta sala.');
  }
}
