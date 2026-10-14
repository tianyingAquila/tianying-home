export function art(id){
  let h=2166136261;for(const c of id)h=Math.imul(h^c.charCodeAt(0),16777619)>>>0;
  const colors=['#a95148','#477890','#56805b','#96733c','#76639c'],color=colors[h%5],kind=(h>>>4)%3;
  let shapes='';for(let i=0;i<5+(h%6);i++){
    const x=12+((h>>>(i%5))+(i*31))%136,y=10+((h>>>(i%9))+i*13)%55,r=3+((h>>>(i%12))%7);
    shapes+=kind===0?`<path d="M${x-r} ${y-r}l${2*r} ${2*r}m0 ${-2*r}l${-2*r} ${2*r}"/>`:kind===1?`<path d="M${x-8} ${y}h${12+r*2}"/>`:`<circle cx="${x}" cy="${y}" r="${r}"/>`;
  }
  return `<svg class="cc-art" viewBox="0 0 160 76" aria-hidden="true" data-pattern="${h}"><g fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round">${shapes}</g></svg>`;
}
