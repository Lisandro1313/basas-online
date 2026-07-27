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
  humanCount?: number;
  playerNames?: string[];
  round?: number;
  totalRounds?: number;
  gameId?: string | null;
}

/** Datos de la sala que se pueden listar sin exponer nada sensible. */
function summary(state: RoomState) {
  const players = [...state.players, ...(state.pending ?? [])];
  return {
    name: state.name ?? `Sala ${state.code}`,
    isPublic: state.isPublic ?? true,
    phase: state.phase,
    playerCount: players.length,
    humanCount: players.filter((p) => !p.isBot).length,
    playerNames: players.map((p) => p.name).slice(0, 8),
    round: state.round,
    totalRounds: state.totalRounds,
    gameId: state.gameId ?? null,
  };
}

const roomRef = (code: string) => adminDb().collection('rooms').doc(code.toUpperCase());

/** Doc público con solo el número de versión: es lo que escuchan los clientes. */
const pulseRef = (code: string) => adminDb().collection('pulse').doc(code.toUpperCase());

/**
 * Registra en la colección `games` (que no se limpia con la sala) el arranque y
 * el final de cada partida, para el historial. Corre dentro de la transacción
 * de la sala, así queda atómico con el cambio de estado.
 */
function recordGameTransitions(
  tx: FirebaseFirestore.Transaction,
  before: RoomState,
  after: RoomState,
  now: number
) {
  const games = adminDb().collection('games');

  // Arrancó una partida nueva (gameId nuevo).
  if (after.gameId && after.gameId !== before.gameId) {
    tx.set(games.doc(after.gameId), {
      code: after.code,
      name: after.name ?? `Sala ${after.code}`,
      players: after.players.map((p) => p.name).slice(0, 8),
      totalRounds: after.totalRounds,
      gameLength: after.gameLength ?? null,
      startedAt: now,
      updatedAt: now,
      status: 'playing',
      winner: null,
    });
  }

  // Terminó la partida.
  if (after.phase === 'gameOver' && before.phase !== 'gameOver' && after.gameId) {
    const winner = after.players.find((p) => p.id === after.winnerId);
    tx.set(
      games.doc(after.gameId),
      {
        status: 'finished',
        winner: winner?.name ?? null,
        winnerPoints: winner?.points ?? null,
        finishedAt: now,
        updatedAt: now,
      },
      { merge: true }
    );
  }
}

export interface GameSummary {
  id: string;
  code: string;
  name: string;
  players: string[];
  status: 'playing' | 'finished' | 'unfinished';
  winner: string | null;
  startedAt: number;
  finishedAt: number | null;
}

/** Una partida "en juego" más vieja que esto se considera abandonada. */
const GAME_STALE_MS = 90 * 60 * 1000;

/** Historial de partidas, de la más nueva a la más vieja. */
export async function listGames(limit = 60): Promise<GameSummary[]> {
  const db = adminDb();
  const now = Date.now();

  // Partidas que están REALMENTE en curso: sala existente, activa y con
  // actividad reciente. Una "en juego" que no está acá, no terminó.
  const roomsSnap = await db
    .collection('rooms')
    .where('updatedAt', '>=', now - ABANDON_MS)
    .get();
  const live = new Set<string>();
  for (const d of roomsSnap.docs) {
    const r = d.data() as RoomDoc;
    if (r.gameId && (r.phase === 'bidding' || r.phase === 'playing' || r.phase === 'roundEnd')) {
      live.add(r.gameId);
    }
  }

  const snap = await db.collection('games').orderBy('startedAt', 'desc').limit(limit).get();

  return snap.docs.map((d) => {
    const g = d.data();
    let status: GameSummary['status'] = g.status === 'finished' ? 'finished' : 'playing';
    // Sigue "en juego" solo si hay una sala viva con esta partida; si no, no terminó.
    if (status === 'playing' && !live.has(d.id)) status = 'unfinished';
    // Respaldo por tiempo, por las dudas.
    if (status === 'playing' && now - (g.updatedAt ?? g.startedAt ?? 0) > GAME_STALE_MS) {
      status = 'unfinished';
    }
    return {
      id: d.id,
      code: g.code ?? '',
      name: g.name ?? 'Sala',
      players: g.players ?? [],
      status,
      winner: g.winner ?? null,
      startedAt: g.startedAt ?? 0,
      finishedAt: g.finishedAt ?? null,
    };
  });
}

export interface TopScore {
  name: string;
  points: number;
  code: string;
  at: number | null;
}

/**
 * Ranking de los puntajes más altos históricos. El ganador de cada partida es
 * el que más puntos hizo, así que su puntaje final es el "récord" de esa mesa.
 * Separado por formato (corta / larga).
 */
export async function listTopScores(
  perList = 5
): Promise<{ corta: TopScore[]; larga: TopScore[] }> {
  const db = adminDb();
  // Ordena por puntaje del ganador (índice de campo único, automático). Solo
  // trae partidas terminadas: las que están en juego no tienen winnerPoints.
  const snap = await db.collection('games').orderBy('winnerPoints', 'desc').limit(300).get();

  const corta: TopScore[] = [];
  const larga: TopScore[] = [];
  for (const d of snap.docs) {
    const g = d.data();
    const pts = g.winnerPoints;
    if (typeof pts !== 'number' || !g.winner) continue;
    // Formato: preferimos el guardado; si es viejo y no lo tiene, lo inferimos
    // por la cantidad de manos (corta = 9, larga = 18).
    const esLarga = g.gameLength === 'larga' || (g.gameLength == null && (g.totalRounds ?? 0) > 12);
    const list = esLarga ? larga : corta;
    if (list.length < perList) {
      list.push({ name: g.winner, points: pts, code: g.code ?? '', at: g.finishedAt ?? null });
    }
    if (corta.length >= perList && larga.length >= perList) break;
  }
  return { corta, larga };
}

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

  const db = adminDb();
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new NotFoundError('No existe esa sala.');

    const doc = snap.data() as RoomDoc;
    const before = JSON.parse(doc.state) as RoomState;

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

    // Historial de partidas (colección aparte, no se borra con la sala).
    recordGameTransitions(tx, before, draft, updatedAt);

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
 * Una partida activa sin escrituras por 5 min está abandonada: con cualquier
 * cliente conectado se dispararían los timeouts/jugadas de bot cada ~30s, así
 * que 5 min sin nada = nadie la está jugando.
 */
const ABANDON_MS = 5 * 60 * 1000;
const ABANDON_PHASES = new Set(['bidding', 'playing']);

/**
 * Cierra por abandono y borra las salas que quedaron colgadas: partidas activas
 * sin actividad (nadie humano jugando) y salas viejas ociosas. Corre de forma
 * oportunista cuando alguien mira la lista de salas.
 */
async function cleanupStaleRooms() {
  const db = adminDb();
  const now = Date.now();
  try {
    const snap = await db
      .collection('rooms')
      .where('updatedAt', '<', now - ABANDON_MS)
      .orderBy('updatedAt', 'asc')
      .limit(20)
      .get();
    if (snap.empty) return;

    const batch = db.batch();
    let any = false;
    for (const d of snap.docs) {
      const doc = d.data() as RoomDoc;
      const age = now - (doc.updatedAt ?? 0);
      const abandonedGame = ABANDON_PHASES.has(doc.phase ?? '') && age >= ABANDON_MS;
      const idle = age >= ROOM_IDLE_MS;
      if (!abandonedGame && !idle) continue;

      // Si había una partida en juego, la dejamos como "no terminó".
      if (doc.gameId && (doc.phase === 'bidding' || doc.phase === 'playing' || doc.phase === 'roundEnd')) {
        batch.set(
          db.collection('games').doc(doc.gameId),
          { status: 'unfinished', finishedAt: now, updatedAt: now },
          { merge: true }
        );
      }
      batch.delete(d.ref);
      batch.delete(db.collection('pulse').doc(d.id));
      any = true;
    }
    if (any) await batch.commit();
  } catch {
    // La limpieza es best-effort: si falla, la lista sigue funcionando.
  }
}

/**
 * Lista las salas con actividad reciente, ordenadas por lo más nuevo.
 * Usa los campos asomados del documento, así no hace falta abrir cada estado.
 */
export async function listRooms(limit = 30): Promise<RoomSummary[]> {
  await cleanupStaleRooms(); // de paso, cerramos las mesas abandonadas
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
