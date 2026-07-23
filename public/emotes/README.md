# Emotes de video (opcional)

El juego ya trae **stickers animados originales** (las caritas de trébol, pica,
etc., dibujadas en SVG). No hace falta ningún archivo acá para que funcionen.

Si además querés emotes con clips de video propios, este es el lugar. Un sticker
de tipo `video` busca su archivo en `public/emotes/<id>.mp4` y lo muestra en un
círculo con audio. Si el archivo no está, ese sticker simplemente no se ofrece.

## Cómo agregar uno

1. Poné tu clip acá con el nombre del id, por ejemplo `risa-trebol.mp4`.
2. Registralo en `src/lib/game/stickers.ts` cambiando ese sticker a
   `kind: 'video'` (o agregando uno nuevo con `kind: 'video'`).

Recomendaciones: clips **cortos** (2–4 s), cuadrados, livianos (unos pocos MB),
que se vean bien recortados en círculo.

## Sobre derechos de autor

Este repo se publica en internet: cualquiera que entre a la página se descarga
lo que haya en esta carpeta. Por eso **no se versionan clips con derechos de
autor** (escenas de anime, películas, etc.). Usá material propio o con licencia
libre. Si ponés clips solo en tu copia local y no los subís a git, es asunto
tuyo, pero no quedan incluidos en el deploy público por defecto.
