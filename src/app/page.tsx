'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { lastName, rememberName, saveSession } from '@/lib/client/session';

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setName(lastName()), []);

  const create = async () => {
    if (!name.trim()) return setError('Poné tu nombre.');
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      rememberName(name);
      saveSession(data.code, { playerId: data.playerId, token: data.token, name });
      router.push(`/sala/${data.code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la sala.');
      setBusy(false);
    }
  };

  const join = () => {
    if (!name.trim()) return setError('Poné tu nombre.');
    if (code.trim().length < 4) return setError('Revisá el código de la sala.');
    rememberName(name);
    router.push(`/sala/${code.trim().toUpperCase()}`);
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 p-6">
      <header className="text-center">
        <h1 className="text-5xl font-black tracking-tight text-amber-300">Basas</h1>
        <p className="mt-2 text-white/70">
          Predecí cuántas bazas vas a ganar. Clavala y sumás.
        </p>
      </header>

      <div className="space-y-4 rounded-2xl border border-white/15 bg-black/30 p-5">
        <label className="block">
          <span className="text-sm text-white/70">Tu nombre</span>
          <input
            value={name}
            maxLength={16}
            onChange={(e) => setName(e.target.value)}
            placeholder="Lisandro"
            className="mt-1 w-full rounded-lg border border-white/20 bg-black/40 px-3 py-3 outline-none focus:border-amber-400"
          />
        </label>

        <button
          onClick={create}
          disabled={busy}
          className="w-full rounded-xl bg-amber-400 px-4 py-3 font-bold text-slate-900 hover:bg-amber-300 disabled:opacity-40"
        >
          {busy ? 'Creando…' : 'Crear sala'}
        </button>

        <Link
          href="/salas"
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/15 px-4 py-3 font-semibold hover:bg-white/25"
        >
          Ver salas
        </Link>

        <div className="flex items-center gap-3 text-xs text-white/40">
          <span className="h-px flex-1 bg-white/15" />o<span className="h-px flex-1 bg-white/15" />
        </div>

        <div className="flex gap-2">
          <input
            value={code}
            maxLength={5}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && join()}
            placeholder="CÓDIGO"
            className="w-full rounded-lg border border-white/20 bg-black/40 px-3 py-3 text-center font-mono text-xl tracking-[0.25em] outline-none focus:border-amber-400"
          />
          <button
            onClick={join}
            className="shrink-0 rounded-xl bg-white/15 px-5 font-semibold hover:bg-white/25"
          >
            Entrar
          </button>
        </div>

        {error && <p className="text-center text-sm text-rose-300">{error}</p>}
      </div>

      <details className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/70">
        <summary className="cursor-pointer font-semibold text-white">
          Cómo se juega
        </summary>
        <ul className="mt-3 list-disc space-y-1.5 pl-5">
          <li>Cada ronda se reparten cartas y se da vuelta una que marca el <b>triunfo</b>.</li>
          <li>Antes de jugar, cada uno <b>predice</b> cuántas bazas va a ganar.</li>
          <li>El que reparte apuesta último y no puede hacer que la suma cierre justo: siempre alguien falla.</li>
          <li>Hay que <b>seguir el palo</b> de salida si tenés. Gana el triunfo más alto, o si no la carta más alta del palo de salida.</li>
          <li>Si clavás tu predicción: <b>10 + 3 por baza</b>. Si errás, solo las bazas que hiciste.</li>
        </ul>
      </details>

      <footer className="pt-2 text-center">
        <p className="text-xs tracking-wide text-white/35">
          Hecho por{' '}
          <span
            className="cursor-help text-white/55"
            title="Manuel Elena de ReMotos, Dimitrukun y Lut"
          >
            Lisandro Etcheverry y asociados
          </span>
        </p>
      </footer>
    </main>
  );
}
