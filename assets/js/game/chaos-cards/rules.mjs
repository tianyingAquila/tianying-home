const standard=Object.freeze({boardLimit:7,manaLimit:10,drawPerTurn:1});
const crazy=Object.freeze({boardLimit:8,manaLimit:12,drawPerTurn:2});
export const MODES=Object.freeze({free:'自由构筑',draft:'随机三选一',crazy:'疯狂模式'});
export const rulesFor=mode=>mode==='crazy'?crazy:standard;
