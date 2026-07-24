import { NextResponse } from 'next/server';
import { listRooms } from '@/lib/rooms';
import { errorResponse } from '../../_error';

export const dynamic = 'force-dynamic';

/**
 * GET /api/rooms/list — salas con actividad reciente.
 * Solo devuelve el resumen (nombre, quiénes están, en qué mano van): nunca
 * cartas ni tokens.
 */
export async function GET() {
  try {
    return NextResponse.json({ rooms: await listRooms() });
  } catch (err) {
    return errorResponse(err);
  }
}
