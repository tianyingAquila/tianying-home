import {CARDS,POOL,THEMES} from './cards.mjs';
import {esc,button as btn,card,showInfo,closeInfo} from './ui.mjs';
import {installEmbed,embedded} from './embed.mjs';
import {BattleMotion} from './motion.mjs';
import {installInteractions} from './interactions.mjs';
const root=document.getElementById('chaosApp');
const motion=new BattleMotion(root);let interactions,presenting=false,draining=false,presentationEpoch=0,skipPresentation=true;const incoming=[];
const read=(k,f)=>{try{return JSON.parse(localStorage.getItem(k))??f;}catch{return f;}};
const write=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));}catch{}};
let room=null,lobby=[],socket=null,online=false,busy=false,theme='全部',query='',fee='',tribe='',effect='',selected=null,position=null,choice=0,target=null,mode='free',difficulty='normal',deck=read('chaos.deck',[]),saved=read('chaos.auth',null),sound=read('chaos.sound',true),lastEvents='',attempt=0,reconnectTimer=null;
const requests=new Map();let audio;
const starterDeck=()=>['CS2_065','EX1_008','CS2_120','CS2_172','EX1_015','EX1_096','EX1_506','CS2_125','EX1_019','EX1_556','CS2_179','CS2_182','CS2_151','CS2_200','CS2_222'].flatMap(x=>[x,x]);
const solo=()=>!!room?.difficulty;
let motionMode=read('chaos.motion','full');document.documentElement.dataset.motion=motionMode;
function tone(){if(!sound)return;try{audio||=new AudioContext();const o=audio.createOscillator(),g=audio.createGain();o.type='sine';o.frequency.value=410;g.gain.setValueAtTime(.025,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.08);o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+.08);}catch{}}
function toast(s){const t=document.getElementById('toast');t.textContent=s;clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.textContent='',4500);}
function send(type,payload={}){
  if(presenting)return Promise.reject(Error('正在播放结算，请稍候'));
  if(!online)return Promise.reject(Error('尚未连接服务器'));
  const requestId=crypto.randomUUID?.()||Date.now()+'-'+Math.random();busy=true;render();
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{requests.delete(requestId);busy=false;render();reject(Error('请求未确认，请检查连接后重试'));},15000);requests.set(requestId,{resolve,reject,timer});socket.send(JSON.stringify({type,payload,requestId,version:room?.version}));});
}
function connect(){
  if(socket&&[0,1].includes(socket.readyState))return;
  // GAME OS uses srcdoc, whose own location is about:srcdoc. Its <base>
  // retains the actual game origin and must also anchor the socket URL.
  const origin=new URL(document.baseURI);
  socket=new WebSocket(`${origin.protocol==='https:'?'wss:':'ws:'}//${origin.host}/chaos-cards/ws`);
  socket.onopen=()=>{online=true;attempt=0;skipPresentation=true;render();if(saved)send('resume',saved).catch(e=>{saved=null;room=null;write('chaos.auth',null);toast(e.message);render();});};
  socket.onmessage=e=>{try{const m=JSON.parse(e.data);
    if(m.type==='auth'){saved={room:m.room,token:m.token};write('chaos.auth',saved);}
    if(m.type==='state'){incoming.push(m.room);void drainStates();}
    if(m.type==='lobby')lobby=m.rooms;
    if(m.type==='left'){cancelPresentation();room=null;saved=null;write('chaos.auth',null);clearSelection();}
    if(m.type==='taken'){cancelPresentation();online=false;socket.onclose=null;socket.close();room=null;saved=null;write('chaos.auth',null);toast('已在另一个页面接管座位，请返回大厅重新进入');}
    if(m.type==='ack'||m.type==='error'){const p=requests.get(m.requestId);if(p){clearTimeout(p.timer);requests.delete(m.requestId);m.type==='ack'?p.resolve():p.reject(Error(m.message));}busy=requests.size>0;if(m.type==='error')toast(m.message);}
    render();
  }catch(e){toast('消息读取失败：'+e.message);}};
  socket.onclose=()=>{cancelPresentation();clearSelection();online=false;busy=false;for(const p of requests.values()){clearTimeout(p.timer);p.reject(Error('连接已断开，正在重连'));}requests.clear();render();clearTimeout(reconnectTimer);reconnectTimer=setTimeout(connect,Math.min(5000,800*1.5**attempt++));};
  socket.onerror=()=>{};
}
function cancelPresentation(){presentationEpoch++;incoming.length=0;presenting=false;motion.reset();delete root.dataset.animating;}
async function drainStates(){
  if(draining)return;draining=true;
  try{while(incoming.length){const next=incoming.shift(),previous=room,epoch=presentationEpoch;
    if(next.mode==='free'&&next.players[next.you]?.deck?.length===30&&(!previous||previous.id!==next.id))deck=[...next.players[next.you].deck];
    const animate=!skipPresentation&&previous?.id===next.id&&previous.game?.phase==='playing'&&next.game?.visualId!==previous.game?.visualId&&next.game?.visual?.length&&motion.available;skipPresentation=false;
    if(animate){
      const landed=selected?.landed&&next.game.visual.some(e=>e.type==='summon'&&e.target===selected.card)?{card:playCard(),position}:null;
      clearSelection();interactions?.hide();presenting=true;root.dataset.animating='true';
      room={...next,phase:'playing',game:{...previous.game,events:next.game.events,deadline:next.game.deadline}};
      if(landed?.card){room.game.players=structuredClone(previous.game.players);const p=room.game.players[next.you];p.hand=p.hand.filter(h=>h.uid!==landed.card.uid);p.board.splice(landed.position,0,previewMinion(landed.card));p.mana-=landed.card.cost;p.handCount--;}render(true);
      const removed=new Set();
      try{for(const event of next.game.visual){if(epoch!==presentationEpoch)break;if(event.type==='summon')removed.add(event.target);const commit=()=>{
        if(epoch!==presentationEpoch)return;
        room.game={...room.game,players:event.players.map((p,i)=>({...p,hand:previous.game.players[i].hand.filter(h=>!removed.has(h.uid))}))};render(true);
      };if(landed?.card?.uid===event.target&&event.type==='summon'){commit();await motion.animate(motion.entity(event.target),[{transform:'scale(1.05)'},{transform:'scale(1)'}],180);}else await motion.play(event,commit);}}catch(error){console.error('结算动画',error);}finally{motion.reset();presenting=false;delete root.dataset.animating;}
    }
    if(epoch!==presentationEpoch)continue;
    room=next;if(previous?.game?.turn!==next.game?.turn||previous?.game?.phase!==next.game?.phase)clearSelection();
    if(room.game){const ev=room.game.events.join('|');if(lastEvents&&ev!==lastEvents)tone();lastEvents=ev;}render();
  }}finally{draining=false;}
}
function clearSelection(){selected=null;position=null;target=null;choice=0;interactions?.sync();}
function getName(){return document.getElementById('nickname')?.value||read('chaos.nick','旅人');}
function nickname(){return `<label>临时昵称 <input id="nickname" maxlength="16" value="${esc(read('chaos.nick','旅人'))}"></label>`;}
const top=()=>`<header class="cc-top"><div><h1>混乱牌战</h1><span>把随从摆上桌，组合由你决定。</span></div><div class="cc-top-actions">${!embedded?'<a href="games.html">返回 GAME OS</a>':''}${btn(motionMode==='full'?'动画：完整':'动画：简化','motion')}${btn(sound?'音效：开':'音效：关','sound')}${room?btn(solo()?'退出人机':'离开房间','leave') :''}<span class="cc-online ${online?'connected':''}">${online?'已连接':'连接中…'}</span></div></header><p class="cc-portrait">手机横屏可以更完整地展示棋盘与手牌。</p>`;
function lobbyHTML(){return `<section class="cc-lobby"><div class="cc-intro"><h2>一张桌，两副牌。</h2><p>自由搭配主题卡池，或让三选一决定这局的惊喜。</p><div class="cc-sample">${['CS2_120','EX1_556','EX1_298'].map(id=>card(id)).join('')}</div></div><aside class="cc-lobby-form">${nickname()}<label>构筑方式<select id="mode"><option value="free" ${mode==='free'?'selected':''}>自由选卡</option><option value="draft" ${mode==='draft'?'selected':''}>随机三选一</option></select></label><label>电脑难度<select id="difficulty"><option value="normal" ${difficulty==='normal'?'selected':''}>普通</option><option value="easy" ${difficulty==='easy'?'selected':''}>简单</option></select></label>${btn('与电脑对战','ai','',busy||!online,'cc-primary')}<p class="cc-solo-hint">选好卡组即可开始，不用创建房间。</p>${btn('创建公开房间','create','',busy||!online)}${btn('创建不列出的房间','private','',busy||!online)}<hr><label>输入房间号<input id="roomCode" inputmode="numeric" maxlength="6" placeholder="六位房间号"></label>${btn('加入房间','join','',busy||!online)}<h3>等待中的公开房间</h3><div class="cc-room-list">${lobby.length?lobby.map(r=>btn(`${r.id}　${r.nick}　${r.mode==='free'?'自由':'三选一'}`,'join-room',`data-room="${r.id}"`,busy)).join(''):'<p>暂时没有等待中的房间。你可以先开一桌。</p>'}</div></aside></section>`;}
function roomBar(){return `<div class="cc-room-bar"><strong>${solo()?'人机练习':'房间 '+room.id}</strong><span>${room.mode==='free'?'自由构筑':'随机三选一'}</span>${room.players.map((p,i)=>`<span class="cc-seat ${i===room.you?'is-you':''}">${p?esc(p.nick)+(p.ai?'':p.online?' · 在线':' · 离线'):'等待玩家'}</span>`).join('')}</div>`;}
function deckPanel(){const list=room.mode==='draft'?room.players[room.you].deck:deck,counts={};for(const id of list)counts[id]=(counts[id]||0)+1;return `<aside class="cc-deck"><h3>我的卡组 <b>${list.length}/30</b></h3><div class="cc-curve" aria-label="费用分布">${[0,1,2,3,4,5,6,7].map(n=>{const count=list.filter(id=>(n===7?CARDS[id]?.cost>=7:CARDS[id]?.cost===n)).length;return `<span title="${n}${n===7?'+':''}费 ${count}张"><i style="height:${Math.max(2,count*4)}px"></i>${n}${n===7?'+':''}</span>`;}).join('')}</div><div class="cc-deck-list">${Object.entries(counts).sort((a,b)=>CARDS[a[0]].cost-CARDS[b[0]].cost).map(([id,n])=>`<div><button data-act="info" data-id="${id}">${CARDS[id].cost}　${esc(CARDS[id].name)}</button><b>×${n}</b>${room.mode==='free'?btn('−','remove',`data-id="${id}"`,busy||room.players[room.you].ready):''}</div>`).join('')}</div><div class="cc-deck-controls">${room.mode==='free'?btn('基础卡组','starter','',room.players[room.you].ready||busy)+btn('清空','clear-deck','',room.players[room.you].ready||busy):''}${btn(room.players[room.you].ready?'撤销准备':solo()?'开始对战':'准备完成','ready','',busy||(!room.players[room.you].ready&&list.length!==30),'cc-primary')}${solo()?'<p>选好卡组就开战，无需等待。</p>':`<p>对方：${room.players[1-room.you]?.ready?'已准备':(room.players[1-room.you]?.count||0)+'/30'}</p>`}</div></aside>`;}
function catalog(){const counts={};for(const id of deck)counts[id]=(counts[id]||0)+1;const filtered=POOL.filter(c=>(theme==='全部'||c.themes.includes(theme))&&(!query||c.name.includes(query)||c.text.includes(query))&&(fee===''||(fee==='7+'?c.cost>=7:c.cost===Number(fee)))&&(!tribe||c.tribe===tribe)&&(!effect||c.features.some(t=>t.includes(effect))));return `<p class="cc-catalog-count">${filtered.length} 张卡牌 · 可自由混搭主题</p><div class="cc-catalog-grid">${filtered.map(c=>card(c.id,{count:counts[c.id]||0,action:'add',label:counts[c.id]>=2?'已满两张':'加入卡组',disabled:busy||room.players[room.you].ready||deck.length>=30||(counts[c.id]||0)>=2})).join('')}</div>`;}
function buildHTML(){const own=room.players[room.you];if(room.mode==='draft')return `<section class="cc-build cc-drafting"><div><h2>三选一 <span>${Math.min(30,own.deck.length+1)}/30</span></h2><p>每轮选一张。候选完全随机，选定后不回退。</p><div class="cc-offers">${own.offers.map(id=>card(id,{action:'pick',label:'选这张',disabled:busy})).join('')}</div>${own.deck.length===30?'<p class="cc-complete">卡组已完成，准备好就可以开战。</p>':''}</div>${deckPanel()}</section>`;
  return `<section class="cc-build"><div class="cc-pool"><nav class="cc-themes" aria-label="主题卡池">${['全部',...THEMES].map(t=>btn(t,'theme',`data-theme="${t}"`,false,t===theme?'is-current':'')).join('')}</nav><div class="cc-filters"><input id="search" placeholder="搜索牌名或效果" value="${esc(query)}"><select id="fee"><option value="">所有费用</option>${[0,1,2,3,4,5,6,'7+'].map(n=>`<option value="${n}" ${String(n)===fee?'selected':''}>${n}费</option>`).join('')}</select><select id="tribe"><option value="">所有种族</option>${[['BEAST','野兽'],['MURLOC','鱼人'],['DRAGON','龙'],['DEMON','恶魔']].map(([v,n])=>`<option value="${v}" ${tribe===v?'selected':''}>${n}</option>`).join('')}</select><select id="effect"><option value="">所有效果</option>${['战吼','亡语','嘲讽','冲锋','圣盾','潜行','风怒','抽牌','治疗','冻结'].map(t=>`<option ${effect===t?'selected':''}>${t}</option>`).join('')}</select></div><div id="catalog">${catalog()}</div></div>${deckPanel()}</section>`;}
function mulliganHTML(){const g=room.game,p=g.players[room.you],picked=selected?.type==='mulligan'?selected.cards:[];return `<section class="cc-mulligan"><h2>留下想要的起手牌</h2><p>点选要换走的牌，未选中的保留。剩余 <span data-countdown></span></p><div class="cc-offers">${p.hand.map(c=>card(c.id,{action:'mulligan-card',label:picked.includes(c.uid)?'将换掉':'保留中',data:`data-uid="${c.uid}"`,selected:picked.includes(c.uid),disabled:p.mulligan||busy})).join('')}</div>${btn(p.mulligan?'等待对方…':'确认换牌','mulligan','',p.mulligan||busy,'cc-primary')}</section>`;}
function legal(){return room?.game?.options||{plays:{},attacks:{}};}
function playCard(){return room?.game?.players[room.you].hand.find(h=>h.uid===selected?.card);}
function previewMinion(h){const c=CARDS[h.id];return {...c,...h,health:c.health,maxHealth:c.health,attack:c.attack,keys:c.keywords||[],ready:false};}
function targetOptions(){return selected?.type==='play'?(selected.landed&&!selected.choosing?legal().plays[selected.card]?.[choice]||[]:[]):selected?.type==='attack'?legal().attacks[selected.from]||[]:[];}
function battleHTML(){
  const g=room.game,you=room.you,me=g.players[you],opp=g.players[1-you],ours=g.active===you,play=selected?.type==='play',attack=selected?.type==='attack',targets=targetOptions(),h=playCard(),landed=play&&selected.landed&&h;
  const hero=(p,i)=>`<button class="cc-hero ${g.active===i?'is-active':''} ${targets.includes(p.uid)?'is-target':''}" data-act="target" data-entity="${p.uid}" data-uid="${p.uid}" ${targets.includes(p.uid)?'':'disabled'}><strong>${esc(room.players[i].nick)}</strong><b>♥ ${p.hp}</b><span>法力 ${p.mana-(i===you&&landed?h.cost:0)}/${p.maxMana}　牌库 ${p.deckCount}　手牌 ${p.handCount-(i===you&&landed?1:0)}</span></button>`;
  const slot=index=>btn('放在这里','position',`data-position="${index}"`,busy,'cc-drop-slot');
  const row=(p,i)=>{
    const units=[...p.board];if(i===you&&landed)units.splice(position,0,previewMinion(h));
    return `<div class="cc-board-row ${i===you?'cc-own-board':'cc-enemy-board'}">${units.map((m,index)=>`${i===you&&play&&!landed?slot(index):''}<div class="cc-unit ${targets.includes(m.uid)?'is-target':''} ${landed&&m.uid===h.uid?'cc-pending-unit':''}">${card(m.id,{small:true,stats:m,uid:m.uid,selected:selected?.from===m.uid,gesture:targets.includes(m.uid)?'target':i===you&&!landed&&Object.hasOwn(legal().attacks,m.uid)?'attacker':'',disabled:busy||presenting})}</div>`).join('')}${i===you&&play&&!landed?slot(units.length):''}${!units.length&&!play?'<span class="cc-empty-board">等待随从上场</span>':''}</div>`;
  };
  const action=landed?`<strong>${esc(CARDS[h.id].name)}已放置</strong>${selected.choosing?`<span>选择效果 ${CARDS[h.id].choices.map((x,i)=>btn(x,'choice',`data-choice="${i}"`,busy)).join('')}</span>`:'<span>将箭头指向亮起的角色，点击或松手选定目标。</span>'}<small>Esc / 右键收回</small>`:play?'<span>把牌拖到己方场地，松手放置；也可以点击空位。</span>':attack?'<span>拖向亮起的敌方角色，松手攻击；也可以点击目标。</span>':`<span>${ours?'拖动手牌上场 · 从己方随从拖出箭头攻击':'等待对方行动。'}</span>`;
  return `<section class="cc-battle">${hero(opp,1-you)}${row(opp,1-you)}<div class="cc-turnbar"><span>${presenting?'结算中…':ours?'你的回合':'对方回合'} · 第 ${g.turn} 回合</span><b data-countdown></b>${btn('结束回合','end','',busy||!ours||presenting||!!landed,'cc-primary')}</div>${row(me,you)}${hero(me,you)}<div class="cc-actionbar">${action}${selected?btn('收回 / 取消','cancel','',busy):''}</div><div class="cc-hand">${me.hand.filter(x=>!landed||x.uid!==h.uid).map(x=>card(x.id,{small:true,stats:{cost:x.cost},uid:x.uid,hand:true,selected:selected?.card===x.uid,gesture:'hand',disabled:busy||!ours||presenting||!!landed||!Object.hasOwn(legal().plays,x.uid)})).join('')||'<p>手牌为空</p>'}</div><details class="cc-events"><summary>最近发生的事</summary>${g.events.slice(-8).reverse().map(x=>`<p>${esc(x)}</p>`).join('')}</details></section>`;
}
async function commitPlay(uid=null){
  if(!selected?.landed||busy||presenting)return;
  const payload={card:selected.card,position,choice,target:uid};
  try{await send('play',payload);clearSelection();render();}catch(e){clearSelection();render();toast(e.message);}
}
async function landCard(uid,slot){
  if(busy||presenting||!Object.hasOwn(legal().plays,uid))return;
  selected={type:'play',card:uid,landed:true,choosing:!!CARDS[room.game.players[room.you].hand.find(h=>h.uid===uid)?.id]?.choices};
  position=slot;target=null;choice=0;render();
  if(!selected.choosing&&!targetOptions().length)await commitPlay();
}
async function chooseTarget(uid){
  if(busy||presenting||!targetOptions().includes(uid))return;
  if(selected.type==='play')return commitPlay(uid);
  const from=selected.from;clearSelection();
  try{await send('attack',{from,target:uid});}catch(e){toast(e.message);}render();
}
function render(force=false){
  if(presenting&&!force)return;interactions?.hide();
  let body;if(!room)body=lobbyHTML();else {
    body=roomBar();
    if(room.phase==='waiting')body+=`<section class="cc-wait"><h2>房间已就绪</h2><p>把房间号 <strong>${room.id}</strong> 发给朋友。</p>${btn('复制房间号','copy-room')}${room.host===room.you?btn('开始构筑','start','',busy||!room.players.every(Boolean),'cc-primary'):'<p>等待房主开始构筑</p>'}</section>`;
    if(room.phase==='building')body+=buildHTML()+`<div class="cc-reset">${room.host===room.you?btn('重开构筑 / 切换玩法','reset','',busy):''}</div>`;
    if(room.phase==='mulligan')body+=mulliganHTML();
    if(room.phase==='playing')body+=battleHTML();
    if(room.phase==='finished'){const g=room.game;body+=`<section class="cc-result"><h2>${room.interrupted?'对局中断':g?.winner===null?'平局':g?.winner===room.you?'你获胜了':'本局结束'}</h2><p>${esc(room.interrupted||g?.reason||'')}</p><p>共 ${g?.turn||0} 回合</p>${btn(room.players[room.you].rematch?'等待对方同意…':'再来一局','rematch','',busy||room.players[room.you].rematch,'cc-primary')}</section>`;}
  }
  root.innerHTML=top()+body;root.classList.toggle('is-offline',!online);interactions?.sync();updateClock();
}
function updateClock(){const deadline=room?.game?.deadline;for(const el of root.querySelectorAll('[data-countdown]')){const n=Math.max(0,Math.ceil((deadline-Date.now())/1000));el.textContent=`${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`;el.classList.toggle('is-urgent',n<=20);}}
setInterval(updateClock,1000);
document.addEventListener('input',e=>{if(e.target.id==='nickname')write('chaos.nick',e.target.value);if(e.target.id==='search'){query=e.target.value;document.getElementById('catalog').innerHTML=catalog();}});
document.addEventListener('change',e=>{if(e.target.id==='mode')mode=e.target.value;if(e.target.id==='difficulty')difficulty=e.target.value;if(['fee','tribe','effect'].includes(e.target.id)){if(e.target.id==='fee')fee=e.target.value;if(e.target.id==='tribe')tribe=e.target.value;if(e.target.id==='effect')effect=e.target.value;document.getElementById('catalog').innerHTML=catalog();}});
document.addEventListener('click',async e=>{const el=e.target.closest('[data-act]');if(!el||el.disabled||presenting)return;const a=el.dataset.act,id=el.dataset.id;try{
  if(a==='info'){if(targetOptions().includes(el.closest('[data-entity]')?.dataset.entity))await chooseTarget(el.closest('[data-entity]').dataset.entity);else showInfo(id);return;}if(a==='close-info'){closeInfo();return;}
  if(a==='motion'){motionMode=motionMode==='full'?'reduced':'full';write('chaos.motion',motionMode);document.documentElement.dataset.motion=motionMode;render();return;}
  if(a==='sound'){sound=!sound;write('chaos.sound',sound);tone();render();return;}
  if(a==='theme'){theme=el.dataset.theme;render();return;}
  if(a==='add'){if(deck.length<30&&deck.filter(x=>x===id).length<2){deck.push(id);write('chaos.deck',deck);}render();return;}
  if(a==='remove'){deck.splice(deck.indexOf(id),1);write('chaos.deck',deck);render();return;}
  if(a==='clear-deck'){deck=[];write('chaos.deck',deck);render();return;}
  if(a==='starter'){deck=starterDeck();write('chaos.deck',deck);render();return;}
  if(a==='copy-room'){await navigator.clipboard.writeText(room.id);toast('已复制房间号');return;}
  if(a==='cancel'){clearSelection();render();return;}
  if(a==='hand'){if(busy||selected?.landed)return;selected={type:'play',card:el.dataset.uid};choice=0;position=null;target=null;render();return;}
  if(a==='attacker'){if(busy||selected?.landed)return;selected={type:'attack',from:el.dataset.uid};target=null;render();return;}
  if(a==='target'){await chooseTarget(el.dataset.uid);return;}
  if(a==='position'){await landCard(selected.card,Number(el.dataset.position));return;}
  if(a==='choice'){if(busy)return;choice=Number(el.dataset.choice);selected.choosing=false;render();if(!targetOptions().length)await commitPlay();return;}
  if(a==='mulligan-card'){if(selected?.type!=='mulligan')selected={type:'mulligan',cards:[]};const k=el.dataset.uid;selected.cards=selected.cards.includes(k)?selected.cards.filter(x=>x!==k):[...selected.cards,k];render();return;}
  if(a==='create'||a==='private'||a==='ai'){const name=getName();write('chaos.nick',name);if(a==='ai'&&mode==='free'&&deck.length!==30){deck=starterDeck();write('chaos.deck',deck);}await send('create',{nick:name,mode,public:a==='create',ai:a==='ai'?difficulty:''});}
  else if(a==='join'||a==='join-room'){const code=a==='join-room'?el.dataset.room:document.getElementById('roomCode').value;await send('join',{room:code.trim(),nick:getName()});}
  else if(a==='start')await send('start');
  else if(a==='reset'){if(confirm('重开会清空双方本轮构筑。是否继续并切换构筑方式？'))await send('reset',{mode:room.mode==='free'?'draft':'free'});}
  else if(a==='ready'){if(!room.players[room.you].ready&&room.mode==='free')await send('deck',{deck});await send('ready',{ready:!room.players[room.you].ready});}
  else if(a==='pick')await send('pick',{card:id});
  else if(a==='mulligan')await send('mulligan',{cards:selected?.type==='mulligan'?selected.cards:[]});
  else if(a==='end'){clearSelection();await send('end');}
  else if(a==='rematch')await send('rematch');
  else if(a==='leave'){if(room.game&&room.phase!=='finished'&&!confirm('离开正在进行的对局会认输。确定离开？'))return;await send('leave');}
}catch(e){toast(e.message);}});
function escape(){if(document.querySelector('dialog')){closeInfo();return true;}if(selected){clearSelection();render();return true;}return false;}
if(!embedded)document.addEventListener('keydown',e=>{if(e.key==='Escape')escape();});
interactions=installInteractions(root,{
  canDrag:uid=>online&&!busy&&!presenting&&!selected?.landed&&room?.phase==='playing'&&Object.hasOwn(legal().plays,uid),
  canAttack:uid=>online&&!busy&&!presenting&&!selected?.landed&&room?.phase==='playing'&&Object.hasOwn(legal().attacks,uid),
  beginDrag:uid=>{selected={type:'play',card:uid};position=null;target=null;choice=0;render();},
  beginAttack:uid=>{selected={type:'attack',from:uid};target=null;render();},
  dropCard:landCard,
  chooseTarget,
  aim:()=>!busy&&!presenting&&targetOptions().length?{source:selected.type==='attack'?selected.from:selected.card,targets:targetOptions()}:null,
  cancel:()=>{if(busy)return;clearSelection();render();}
});
render();installEmbed(connect,escape);
