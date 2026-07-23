# Sonidos

Por defecto el juego **sintetiza** todos los sonidos con Web Audio
(`src/lib/client/audio.ts`). No hace falta ningún archivo acá.

Si querés usar samples reales, dejalos en esta carpeta con estos nombres exactos
y se usan automáticamente en lugar de la síntesis. No hay que tocar código:

| Archivo | Cuándo suena |
|---|---|
| `card-play.mp3` | al tirar una carta a la mesa |
| `card-deal.mp3` | al repartir, arranque de ronda |
| `trick-won.mp3` | cuando alguien se lleva la baza |
| `bid.mp3` | al confirmar la apuesta |
| `your-turn.mp3` | cuando te toca jugar |
| `tick.mp3` | últimos 5 segundos del turno |

Recomendaciones:

- **Cortos**: entre 80 y 400 ms. Un sonido largo se pisa con el siguiente.
- **Livianos**: mp3 a 96–128 kbps alcanza de sobra; son ruidos, no música.
- **Sin silencio al principio**, o se va a sentir desincronizado del click.
- **Normalizados pero no al tope**: el juego les aplica su propia ganancia.

Dónde conseguirlos con licencia libre:

- [freesound.org](https://freesound.org) filtrando por licencia CC0
- [pixabay.com/sound-effects](https://pixabay.com/sound-effects/)

Buscá términos como *card flip*, *card deal*, *poker chips*, *card shuffle*.

Si un archivo falta o no se puede decodificar, el juego vuelve solo a la
síntesis: nunca se queda mudo.
