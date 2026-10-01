/* 终端顶部走秒时钟 · 全站共用
   任何页面只要有 id="termClock" 的元素就会自动走起来。
   逻辑和项目档案页的 startClock 一致，抽出来是为了游戏页不用各写一份。 */
(function () {
  "use strict";

  var el = document.getElementById("termClock");
  if (!el) { return; }

  function pad(n) { return n < 10 ? "0" + n : String(n); }

  function tick() {
    var now = new Date();
    el.textContent = pad(now.getHours()) + ":" + pad(now.getMinutes()) + ":" + pad(now.getSeconds());
  }

  tick();
  window.setInterval(tick, 1000);
})();
