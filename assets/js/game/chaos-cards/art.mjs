// Original SVG doodles. Shared silhouettes and subject-specific props keep the whole deck light.
const p=(d,f='none')=>`<path d="${d}" fill="${f}"/>`,c=(x,y,r,f='var(--paint)')=>`<circle cx="${x}" cy="${y}" r="${r}" fill="${f}"/>`,e=(x,y,rx,ry,f='var(--paint)')=>`<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${f}"/>`;
const eye=(x,y)=>c(x,y,2,'#42434b'),face=(x=80,y=36)=>eye(x-7,y)+eye(x+7,y)+p(`M${x-4} ${y+8}q4 3 8 0`);
const props={
 sword:p('M120 77V48m-8 6h16m-13-9V30l5-10 5 10v15Z','#fff7df'),
 shield:p('M110 43q12-8 24 0v17q-4 10-12 16-9-6-12-16Z','var(--accent)')+p('M122 45v21m-7-14h14'),
 bow:p('M119 22q28 27 0 54l10-27ZM113 49h30m-5-4 5 4-5 4'),
 staff:p('M122 78V34')+c(122,26,9,'var(--accent)')+p('M117 26h10m-5-5v10'),
 flag:p('M119 80V16m0 3h25l-7 10 7 10h-25','var(--accent)'),
 bottle:p('M118 40v10q-15 22 0 24h12q15-2 0-24V40Z','var(--accent)')+p('M116 40h16m-18 22h20')+c(124,56,2,'#fff'),
 book:p('M108 49q9-6 15 0 7-6 15 0v25q-8-5-15 0-6-5-15 0Z','#fff7df')+p('M123 49v25m-10-17h6m9 0h6m-21 7h6'),
 hammer:p('M121 79V43m-12-17h25v17h-25Z','var(--accent)'),
 knife:p('M118 75 126 45 138 28 138 46 123 60','#fff7df'),
 bomb:c(123,65,12,'#9a9aaa')+p('M123 53q-3-15 10-14m0-7v5m4-2 4-3'),
 orb:c(123,58,11,'var(--accent)')+p('M123 40v-5m0 46v-5m-18-18h-5m46 0h-5'),
 lantern:p('M113 48h20l3 26h-26Z','var(--accent)')+p('M117 48v-6q6-10 12 0v6m-6 7v12'),
 chicken:e(124,66,13,9,'#fff7df')+c(132,55,6,'#fff7df')+p('M137 54l6 3-6 2','var(--accent)')+eye(133,54),
 flute:p('M107 44 139 34m-23 7 3 6m5-8 3 5m4-8 3 5'),
 coins:c(119,71,6,'#e8c77e')+c(131,71,6,'#e8c77e')+c(125,61,6,'#e8c77e')
};
function person(kind){
 const hood=['priest','rogue','cult','seer','mage'].includes(kind);
 let s=p('M49 83q1-31 31-31t30 31Z','var(--paint)');
 if(hood)s+=p('M55 53Q45 15 80 10q34 5 25 43Z','var(--paint)');
 s+=e(80,36,19,22,'#f4d9bd')+face();
 s+=hood?p('M59 37Q59 15 80 14q24 3 20 24L85 26 74 32Z','var(--paint)'):p('M60 32q-3-19 19-20l22 8-2 15-10-10-11 4-8-4Z','var(--accent)');
 if(['knight','guard'].includes(kind))s+=p('M59 33V25q20-23 41 0v8m-41 0h41M80 11v15','#bdcbd0')+p('M63 59 80 70 96 59M80 70v13');
 if(['gnome','engineer'].includes(kind))s+=c(73,36,6,'#f5f7eb')+c(88,36,6,'#f5f7eb')+p('M79 36h3')+eye(73,36)+eye(88,36);
 if(kind==='seer')s+=p('M66 47 80 69 94 47','#f7f0e0');
 if(kind==='bandaged')s+=p('M61 26 98 33m-36 9 33 7M58 66l40 10m-38-1 26-15');
 if(kind==='rogue')s+=p('M63 41h34l-3 14H67Z','var(--accent)');
 if(kind==='cult')s+=p('M65 60 80 71l16-11')+c(80,72,4,'var(--accent)');
 if(kind==='priest')s+=p('M73 63h14m-7-6v16');
 return s;
}
function animal(kind){
 if(kind==='croc')return p('M29 66 13 46 41 54q9-24 39-20l14 12h43q15 12-1 20H91l-3 13H77l-3-13H56l-5 13H39l2-13Z','var(--paint)')+p('M94 55h44m-29 0 4 5 4-5m8 0 4 5 4-5M45 46l5-9 6 3 6-10 7 5 9-10 8 12')+c(94,43,7,'#fff7df')+eye(96,43);
 if(kind==='boar')return e(77,54,34,23)+p('M43 52q-16-17-17-2m30 22-3 10m36-10 4 10')+p('M96 35l5-18 11 18','var(--paint)')+e(109,50,20,19)+e(125,57,12,9,'var(--accent)')+eye(106,43)+p('M116 61q-9 12-12-4','#fff7df')+eye(123,56)+eye(129,56);
 if(kind==='raptor')return p('M47 61 18 72 44 48 62 45 75 26q4-10 17-10h25l10 18-8 10H95L84 62 90 79H76L66 65l-5 14H47l8-18Z','var(--paint)')+p('M95 35h29m-21 0 3 6 5-6M91 48l13 7m-10 4 10-4')+eye(103,25);
 if(kind==='snake')return p('M47 78q-25-16 0-24t21 12q0 15-17 3m9 9q47 13 41-26-22-1-23-20-1-18 23-18t24 19q-1 18-23 19','var(--paint)')+eye(94,30)+eye(111,30)+p('M101 39v13m0 0-5 5m5-5 5 5M86 23l7 3m16 0 8-3');
 if(kind==='owl')return e(80,54,30,29)+p('M51 43 50 15 70 27m21 0 19-12-1 29','var(--paint)')+c(68,42,13,'#fff7df')+c(93,42,13,'#fff7df')+eye(69,42)+eye(92,42)+p('M76 52h10l-5 8Z','var(--accent)')+p('M60 62l7 8m33-8-7 8m-25 12-4 3m29-3 4 3');
 if(kind==='bird'||kind==='vulture')return p('M70 65Q28 64 23 29q16 5 32 18L45 18q26 8 32 30 17-22 41-29l-12 27 30-17q-9 38-42 37L84 82Z','var(--paint)')+e(83,49,12,21)+c(85,28,12,kind==='vulture'?'#e9c7b1':'var(--paint)')+p('M96 26 110 32 96 36','var(--accent)')+eye(88,26)+p('M53 46l12 9m40-9-10 9');
 if(kind==='squirrel')return p('M68 65Q16 74 24 34q9-27 30-13 14 16-5 23 17 0 16 20','var(--accent)')+e(85,62,20,20)+c(91,35,16)+p('M78 24 80 10 90 20m8 1 11-9-1 17','var(--paint)')+eye(93,33)+p('M107 38l7 3m-23 9 10 13m-18 17h24')+e(104,64,8,10,'#cba16d');
 if(kind==='rhino')return e(76,55,36,23)+p('M47 65v17h13V69m31 0v13h13V64','var(--paint)')+e(111,50,23,22)+p('M123 50 134 25 140 53Z','#fff7df')+p('M99 30 92 20l16 9','var(--paint)')+eye(110,44);
 const bear=['bear','panda'].includes(kind),wolf=['wolf','hyena','gnoll'].includes(kind);
 let s=e(78,58,32,20)+p('M49 60 30 46 20 51m34 20-3 12h10m30-12 5 12h10');
 if(kind==='lion')s+=c(107,42,29,'var(--accent)');
 s+=bear?c(89,24,9)+c(118,24,9):p('M88 33 87 14 102 27m7-1 15-12-1 25','var(--paint)');
 s+=e(105,43,23,22,kind==='panda'?'#fcf6e7':'var(--paint)');
 if(kind==='panda')s+=e(97,40,6,7,'#777981')+e(115,40,6,7,'#777981');
 s+=eye(97,40)+eye(115,40)+e(107,51,wolf?13:10,8,'#f9e8cd')+p('M103 48h7l-4 5Z','#42434b')+p('M106 53v4m-6 0q6 5 12 0');
 if(kind==='tiger')s+=p('M48 46l8 11m8-16 7 13m9-11 5 12m13-31 4 8m9-8-2 8m-21 9 7 4m25-5-7 4');
 if(wolf)s+=p('M91 60l5 9 6-6m-30-23 3-7 7 6');
 return s;
}
function creature(kind){
 if(kind==='fish')return p('M59 27 64 12 77 24 91 11 98 28M58 49 35 40l7 20 17 3m44-14 21-9-5 20-15 3M64 73l-9 11h16l5-9m14-2 10 11h13l-10-17','var(--accent)')+e(81,52,28,28)+c(67,34,12,'#fff7df')+c(94,34,12,'#fff7df')+eye(68,35)+eye(93,35)+e(81,56,14,8,'var(--accent)')+p('M72 56h18m-23 11 4 3m20-3 4 3');
 if(kind==='dragon')return p('M68 49Q41 6 20 26l7 31 14-12 9 20m44-16q27-43 48-23l-7 31-14-12-9 20','var(--accent)')+p('M63 72q-31 16-32-4l-9 8q14 18 43 4')+e(82,59,22,24)+e(84,63,12,18,'#f7e7be')+p('M65 25 62 12l15 9m14 0 14-9-4 20','var(--accent)')+e(82,32,23,18)+eye(73,30)+eye(92,30)+p('M74 42q9 4 17-1m-21 38-5 5m26-5 5 5');
 if(kind==='tree')return p('M63 78 66 45 41 45 25 27l10-7 17 16 14-1V17h25v19l16-3 14-17 10 7-17 24-23 1 4 30 15 7H86l-6-13-7 13H49Z','var(--paint)')+c(58,22,13,'var(--accent)')+c(80,15,15,'var(--accent)')+c(103,23,14,'var(--accent)')+eye(72,48)+eye(85,48)+p('M72 60q6 5 13 0M74 69v10');
 if(kind==='golem')return p('M55 35h51l-4 37H59Z','var(--paint)')+p('M53 46 33 57l9 7 17-10m45-8 21 10-5 10-19-10M65 72l-3 13h12l3-13m12 0 2 13h12l-5-13','var(--accent)')+p('M58 20h45v19H58Z','var(--paint)')+eye(70,28)+eye(92,28)+p('M73 53h14m-7-7v14M51 16h59')+p('M66 16 74 8h15l11 8','var(--accent)');
 if(kind==='catapult')return c(52,74,12,'#dac49b')+c(111,74,12,'#dac49b')+p('M41 66h82v8H41Zm24-5 9-26h13l16 26M79 55l35-37m-3-6 14 11-11 9-14-11Z','var(--paint)')+c(116,16,8,'var(--accent)');
 if(kind==='spring')return e(80,73,34,9,'#badbd3')+p('M56 70 62 54h36l6 16M64 52h32l-6-11H70Z','var(--paint)')+p('M80 50V26q0-19-14-17m14 25q10-25 23-15M80 35q-18-23-27-10')+c(65,13,3,'#a0d6dd')+c(106,21,3,'#a0d6dd')+c(51,30,3,'#a0d6dd');
 if(kind==='wisp')return e(49,36,14,9,'#f8efd9')+e(110,36,14,9,'#f8efd9')+c(80,46,23)+face(80,43)+p('M45 65l-5 5m78-3 5 5M80 14V8');
 if(kind==='ghost')return p('M50 68q-10-48 25-48 37-7 39 34l-2 24-14-7-9 10-12-9-12 8Z','var(--paint)')+face(81,44)+p('M38 30l-3-8m85 4 6-6M34 63l-7 3m97-4 8 5');
 if(kind==='fire')return p('M51 79Q21 49 59 28l3 18Q85 32 78 7q35 24 26 45l14-18q30 34-6 46Z','var(--paint)')+p('M65 77q-15-20 9-32l5 13 13-21q23 29 4 41Z','var(--accent)')+eye(71,64)+eye(92,64)+p('M77 72h9');
 if(kind==='water'||kind==='wind')return p('M56 77q-28-5-17-22 9-13 23-1m-6 12q-20-28 1-43 13-8 28-5L99 7q5 16-4 24 35-1 28 23-3 9-16 5m-3-15q25 37-7 36Z','var(--paint)')+face(81,43)+p('M58 68q20 10 38-1m-27-41 13-1');
 if(kind==='sun')return c(80,46,24,'var(--paint)')+face(80,43)+p('M80 10V3m0 85v-7M43 46h-8m90 0h-8M53 19l-6-6m60 6 6-6M53 73l-6 6m60-6 6 6');
 if(kind==='faceless')return p('M52 79Q30 51 59 27q3-14 22-13 28 1 27 33l15 29-14-4-8 10-9-11-13 10-9-11Z','var(--paint)')+p('M70 41q10-12 23 0m-18 7q-9 24 4 30m5-30q-3 19 11 23')+eye(71,37)+eye(92,37);
 if(kind==='cow')return p('M48 82q-2-30 31-30t33 30Z','var(--paint)')+p('M60 29Q34 29 42 9l20 12m37 8q25 0 18-20L96 21','#fff7df')+e(80,36,25,25)+e(80,48,22,13,'var(--accent)')+eye(70,31)+eye(91,31)+eye(72,48)+eye(88,48)+p('M68 65 80 77l14-12');
 let s=p('M42 81q-10-31 15-34 0-31 24-32 27 1 28 32 22 1 13 34Z','var(--paint)')+face(82,37)+e(82,66,20,14,'var(--accent)');
 if(kind==='demon'||kind==='void')s+=p('M60 23 49 6 69 18m31 5 13-17-22 12','var(--accent)')+p('M69 47l4 9 6-7m8 0 6 7 4-9','#fff7df');
 if(kind==='yeti')s+=p('M60 20 53 9l17 8m27 3 10-11-19 8','#fff7df')+p('M53 55l4 7 5-7m33 3 5 9 5-9m-35 9 6 9 6-9');
 if(kind==='abomination')s+=p('M64 26 99 30m-29-7-1 8m10-8-1 8m10-7-1 8M68 65l30 8m-22-9-2 8m11-6-2 8m11-6-2 8');
 if(kind==='giant')s+=p('M45 68q8-13 15 0m37-47 8 4m-48 7 5 3')+p('M67 14 69 7l10 8 9-8 6 11','var(--accent)');
 return s;
}
// Explicit subject / prop / palette for every collectible and token.
const specs={
CS2_231:['wisp','',4],CS2_065:['void','',4],CS2_169:['bird','',2],CS2_171:['boar','',0],CS2_188:['warrior','flag',0],CS2_189:['rogue','bow',1],CS2_235:['priest','book',2],DS1_175:['wolf','',1],EX1_001:['priest','orb',2],EX1_008:['knight','shield',5],EX1_010:['wolf','knife',4],EX1_011:['seer','staff',1],EX1_029:['gnome','bottle',1],EX1_319:['demon','',0],EX1_508:['fish','staff',4],EX1_509:['fish','orb',3],
CS2_120:['croc','',1],CS2_172:['raptor','',0],CS2_173:['fish','sword',3],CS2_203:['owl','',5],CS2_237:['vulture','',5],EX1_015:['engineer','book',3],EX1_045:['giant','',5],EX1_049:['panda','bottle',1],EX1_059:['gnome','bottle',4],EX1_076:['mage','orb',4],EX1_082:['gnome','bomb',0],EX1_096:['rogue','coins',2],EX1_162:['wolf','',5],EX1_341:['spring','',2],EX1_362:['knight','shield',2],EX1_506:['fish','flag',1],EX1_531:['hyena','',2],EX1_616:['ghost','',4],NEW1_019:['rogue','knife',0],NEW1_021:['seer','book',0],NEW1_037:['engineer','hammer',5],
CS2_122:['warrior','flag',2],CS2_124:['wolf','flag',0],CS2_125:['bear','',5],CS2_181:['bandaged','sword',3],CS2_196:['rogue','bow',5],EX1_005:['warrior','bow',0],EX1_007:['cult','book',4],EX1_019:['priest','staff',0],EX1_020:['knight','sword',0],EX1_044:['warrior','coins',1],EX1_050:['fish','book',3],EX1_083:['engineer','hammer',2],EX1_085:['engineer','orb',4],EX1_102:['catapult','',5],EX1_103:['fish','lantern',4],EX1_170:['snake','',1],EX1_412:['wolf','',0],EX1_507:['fish','shield',0],EX1_556:['golem','',2],EX1_590:['knight','orb',0],tt_004:['abomination','',1],
CS2_033:['water','',3],CS2_179:['guard','shield',1],CS2_182:['yeti','',3],DS1_070:['warrior','flute',5],EX1_025:['engineer','hammer',1],EX1_043:['dragon','',4],EX1_048:['guard','staff',3],EX1_093:['guard','shield',4],EX1_116:['warrior','chicken',0],EX1_335:['sun','',2],EX1_587:['seer','flute',3],EX1_595:['cult','staff',0],
CS2_151:['knight','sword',5],CS2_226:['wolf','shield',3],DS1_055:['priest','bottle',3],EX1_028:['tiger','',2],EX1_097:['abomination','',5],EX1_165:['seer','staff',1],EX1_310:['demon','sword',4],EX1_399:['giant','sword',0],EX1_564:['faceless','',4],NEW1_041:['rhino','',5],CS2_042:['fire','',0],CS2_200:['ogre','',5],EX1_016:['rogue','bow',4],EX1_032:['cow','shield',2],EX1_067:['knight','flag',3],EX1_110:['cow','hammer',5],EX1_283:['water','',5],EX1_534:['lion','',2],NEW1_040:['gnoll','knife',0],CS2_088:['guard','staff',2],CS2_222:['knight','flag',4],EX1_249:['fire','orb',2],NEW1_008:['tree','book',1],CS2_232:['tree','shield',5],EX1_298:['fire','hammer',0],NEW1_010:['wind','sword',3],EX1_561:['dragon','',0],EX1_562:['dragon','',5],EX1_586:['giant','',3],NEW1_030:['dragon','bomb',0],
EX1_506a:['fish','knife',1],CS2_boar:['boar','',5],skele21:['golem','',5],EX1_025t:['dragon','hammer',3],EX1_116t:['dragon','',1],CS2_152:['knight','',3],EX1_110t:['cow','sword',0],EX1_534t:['hyena','',5],NEW1_040t:['gnoll','shield',5],EX1_tk28:['squirrel','',2],EX1_tk29:['raptor','',1],EX1_165t1:['cat','',1],EX1_165t2:['bear','',1]
};
const palettes=[['#e7a28b','#f1ce7c'],['#b9d0aa','#d7dfaa'],['#e9cc82','#e9a37f'],['#a9ced8','#b7bce1'],['#c4b4da','#dba5b4'],['#c8c7ba','#e1c29e']];
const animals=new Set('croc boar raptor snake owl bird vulture squirrel rhino tiger lion cat bear panda wolf hyena gnoll'.split(' '));
const people=new Set('priest rogue cult seer mage gnome engineer knight guard bandaged warrior'.split(' '));
const cache=new Map();
export function art(id){
 if(cache.has(id))return cache.get(id);
 const [kind,accessory,n]=specs[id]||['wisp','',4],[paint,accent]=palettes[n];
 let drawing=(people.has(kind)?person(kind):animals.has(kind)?animal(kind):creature(kind))+(props[accessory]||'');
 if(id==='skele21')drawing+=p('M79 20 73 34 86 44 76 57m-22 8-8 10');
 if(id==='NEW1_030')drawing+=p('M69 24 77 35 70 48m20-23-4 12 9 11');
 if(id==='EX1_025t')drawing+=c(82,61,6,'#fff7df')+p('M82 55v12m-6-6h12');
 const svg=`<svg class="cc-art" viewBox="0 0 160 96" aria-hidden="true" data-illustration="${id}" style="--paint:${paint};--accent:${accent}"><ellipse cx="80" cy="85" rx="51" ry="4" fill="#ded6c7" opacity=".6"/><g fill="none" stroke="#53525a" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">${drawing}</g></svg>`;
 cache.set(id,svg);return svg;
}
