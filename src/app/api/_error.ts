import { NextResponse } from 'next/server';
import { RuleError } from '@/lib/game/engine';
import { ConflictError, NotFoundError } from '@/lib/rooms';

export function errorResponse(err: unknown) {
  if (err instanceof RuleError) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  if (err instanceof NotFoundError) {
    return NextResponse.json({ error: err.message }, { status: 404 });
  }
  if (err instanceof ConflictError) {
    return NextResponse.json({ error: err.message }, { status: 409 });
  }
  const message = err instanceof Error ? err.message : 'Error inesperado.';
  console.error('API error:', message);
  return NextResponse.json({ error: message }, { status: 500 });
}
