// Card illustrations are raster assets; all names, rules and values remain HTML.
export function art(id){
  const file=encodeURIComponent(id);
  return `<img class="cc-art cc-raster-art" src="assets/img/chaos-cards/cards-v1/${file}.webp?v=2" width="384" height="384" loading="lazy" decoding="async" draggable="false" alt="" aria-hidden="true" data-illustration="${id}">`;
}
