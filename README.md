# Basas Online

Juego de bazas con predicción (*Oh Hell / Estimación*) para jugar con amigos por internet.
Creás una sala, pasás el código, y a jugar.

## Reglas

- Baraja francesa de 52 cartas, del 2 al A (el as es la más alta).
- Cada ronda se reparten cartas (arranca en 5 y sube de a una hasta 10, según cuántos sean)
  y se da vuelta una carta que define el **palo de triunfo**.
- **Apuesta**: cada jugador predice *exactamente* cuántas bazas va a ganar.
  El que reparte apuesta último y **no puede hacer que la suma cierre justo**:
  siempre tiene que fallar alguien.
- **Juego**: hay que servir el palo de salida si tenés. Gana la baza el triunfo más alto;
  si no se jugó triunfo, la carta más alta del palo de salida.
- **Puntaje**: si clavaste tu predicción, `10 + 3 × bazas`. Si erraste, solo las bazas que hiciste.
- Gana quien más puntos junte al final de las rondas.

Se puede jugar de 2 a 6, y completar con bots.

## Cómo está armado

- **Next.js 15** (App Router) + React 19 + Tailwind 4, desplegado en Vercel.
- **Firebase Firestore** guarda el estado de cada sala y avisa los cambios en tiempo real.
- El **servidor es autoritativo**: valida turno, credenciales y reglas en cada jugada.
  El cliente no decide nada.

### Por qué nadie puede espiar las cartas

El estado completo (con todas las manos) vive en la colección `rooms`, que las
security rules dejan cerrada: desde el navegador es ilegible. Solo el backend la
toca, con el Admin SDK.

El listener de Firestore no puede escuchar ese estado, porque entonces todos verían
todo. Por eso existe `pulse`: documentos que solo tienen un número de versión por
sala. Los clientes escuchan ahí y, cuando cambia, piden por HTTP el estado
**redactado** (`src/lib/game/redact.ts`), que devuelve tu mano y solo la *cantidad*
de cartas de los demás.

```
navegador ──onSnapshot──> pulse/{code}  (público, solo versión)
     │                        ▲
     │ GET /api/rooms/[code]  │ bump
     ▼                        │
  API route ───Admin SDK────> rooms/{code}  (cerrado, estado completo)
     │
     └─> redact() ─> tu mano + conteo ajeno
```

### Estructura

```
src/
  app/
    page.tsx                    crear / entrar a una sala
    sala/[code]/page.tsx        la partida
    api/rooms/                  crear, entrar, leer estado, jugar
  components/                   mesa, cartas, lobby, resúmenes
  lib/
    game/                       motor puro: reglas, cartas, redacción
    rooms.ts                    persistencia con transacciones
    firebase-admin.ts           Firestore del lado del servidor
    client/                     sesión, config de Firebase y hook de sincronización
firestore.rules                 publicar una vez en Firebase
```

## Puesta en marcha

### 1. Firebase

1. Creá un proyecto en [console.firebase.google.com](https://console.firebase.google.com)
   (el plan gratis Spark alcanza y sobra para jugar con amigos).
2. **Firestore Database → Crear base de datos** (modo producción, la región más cercana).
3. **Firestore → Rules**: pegá el contenido de `firestore.rules` y publicá.
4. **Project settings → General → Tus apps → App web** (`</>`): copiá `apiKey`,
   `projectId` y `appId`.
5. **Project settings → Service accounts → Generar nueva clave privada**: del JSON
   que descarga salen `project_id`, `client_email` y `private_key`.

### 2. Local

```bash
cp .env.example .env.local   # y completá las claves
npm install
npm run dev
```

Abrí http://localhost:3000. Para probar el multijugador solo, abrí la sala en una
ventana normal y otra de incógnito (la identidad se guarda por navegador).

> ⚠️ `FIREBASE_PRIVATE_KEY` **nunca** lleva el prefijo `NEXT_PUBLIC_`.
> Si se la ponés, queda expuesta en el navegador y cualquiera puede leer todas las manos.
> Las `NEXT_PUBLIC_FIREBASE_*` sí son públicas a propósito: lo que protege los datos
> son las reglas de Firestore, no esconder esas claves.

### 3. Vercel

Importá el repo en Vercel y cargá las variables de entorno en
**Settings → Environment Variables** (Production, Preview y Development).
Next.js se detecta solo, no hace falta configurar nada más.

Al pegar `FIREBASE_PRIVATE_KEY` en Vercel, va entre comillas y con los `\n`
literales, tal cual viene en el JSON.

```bash
vercel env add FIREBASE_PRIVATE_KEY
# ...y el resto de las variables
vercel --prod
```

## Mantenimiento

Las salas quedan guardadas en Firestore. Para limpiar las viejas, borrá a mano la
colección `rooms` desde la consola cada tanto, o programá una Cloud Function.
Con el uso normal de un grupo de amigos, el plan gratis no se acerca al límite.
