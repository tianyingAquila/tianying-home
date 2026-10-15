// Raster illustrations use native lazy loading; names and all game values remain HTML.
export function art(id){
  const file=encodeURIComponent(id);
  return `<img class="cc-art cc-raster-art" src="assets/img/chaos-cards/cards-v1/${file}.webp?v=1" width="384" height="384" loading="lazy" decoding="async" draggable="false" alt="" aria-hidden="true" data-illustration="${id}">`;
}
