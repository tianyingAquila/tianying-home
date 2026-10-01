/* ==========================================================================
   引擎 · 固定步长主循环与战斗结算
   --------------------------------------------------------------------------
   逻辑固定 60Hz，渲染按 rAF 并做插值——这样 2x 倍速和低端手机上行为一致，
   不会出现"手机上怪走得慢一点所以更好守"这种事。

   子弹与粒子走对象池，粒子有硬上限（config.LIMITS）。
   标签页切到后台停渲染，回来时不补算积压时间（否则回来瞬间会被怪淹）。

   一局 = 一张地图。地图决定尺寸、路径、可用塔、出场敌人和波次；
   切地图就是 setMap() 后 reset()。
   ========================================================================== */
(function (root) {
  "use strict";

  var TD = root.TD || (root.TD = {});
  var cfg = TD.config;

  var STEP = 1 / cfg.LIMITS.stepHz;

  function Engine(mapId) {
    this.setMap(mapId || 1);
  }

  Engine.prototype.setMap = function (mapId) {
    this.map = cfg.mapById(mapId);
    this.reset();
  };

  Engine.prototype.reset = function () {
    var map = this.map;
    this.grid = new TD.Grid(map);
    this.waves = map.waves;

    this.state = "ready";      /* ready | running | paused | won | lost */
    this.lives = map.lives || cfg.RULES.lives;
    this.startLives = this.lives;
    this.gold = map.gold || cfg.RULES.gold;
    this.speed = 1;

    this.time = 0;             /* 游戏内累计秒数（受倍速影响） */
    this.realTime = 0;         /* 真实用时（秒，不受倍速影响、暂停不计），记录榜用它排名 */
    this.acc = 0;              /* 步长累加器 */

    this.waveIndex = 0;        /* 下一波的下标 */
    this.waveActive = false;
    this.waveTimer = cfg.RULES.firstWaveDelay;
    this.schedule = [];
    this.scheduleAt = 0;
    this.spawnedThisWave = 0;

    this.enemies = [];
    this.towers = [];
    this.bullets = [];
    this.particles = [];
    this.floaters = [];        /* 金币跳字等飘字 */

    this.bulletPool = [];
    this.particlePool = [];

    this.stats = { kills: 0, leaked: 0, built: 0, goldEarned: 0 };
    this.events = [];          /* 给 UI 消费的一次性事件 */
  };

  /* 这张图允许造的塔（商店、快捷键都按它过滤） */
  Engine.prototype.towerKeys = function () {
    return this.map.towers;
  };

  /* ------------------------------------------------------------------ 建造 */

  Engine.prototype.canAfford = function (n) { return this.gold >= n; };

  Engine.prototype.build = function (typeKey, c, r) {
    var def = cfg.TOWERS[typeKey];
    if (!def) { return false; }
    if (this.map.towers.indexOf(typeKey) < 0) { return false; }
    if (!this.grid.canBuild(c, r)) { return false; }
    if (!this.canAfford(def.cost)) { return false; }

    var t = new TD.Tower(typeKey, c, r);
    t.placedAt = this.time;
    this.towers.push(t);
    this.grid.place(c, r, t);
    this.gold -= def.cost;
    this.stats.built += 1;

    this.pushParticles(c, r, 10, cfg.PALETTE.accent, 0.9);
    return true;
  };

  Engine.prototype.upgrade = function (tower) {
    var cost = tower.upgradeCost();
    if (cost === null || !this.canAfford(cost)) { return false; }
    this.gold -= cost;
    tower.upgrade();
    this.pushParticles(tower.c, tower.r, 14, cfg.PALETTE.gold, 1.1);
    return true;
  };

  Engine.prototype.sell = function (tower) {
    var back = tower.sellValue();
    this.gold += back;
    this.grid.remove(tower.c, tower.r);
    var i = this.towers.indexOf(tower);
    if (i >= 0) { this.towers.splice(i, 1); }
    this.pushParticles(tower.c, tower.r, 8, cfg.PALETTE.faint, 0.8);
    this.pushFloater(tower.c, tower.r, "+" + back, cfg.PALETTE.gold);
    return back;
  };

  /* ------------------------------------------------------------------ 波次 */

  Engine.prototype.totalWaves = function () { return this.waves.length; };

  Engine.prototype.currentWaveNo = function () {
    if (this.waveActive) { return this.waveIndex; }
    return Math.min(this.waveIndex + 1, this.totalWaves());
  };

  /* 记录榜用的"打到第几波"：赢了就是总波数；输了算死在哪一波
     （失败只会发生在波次进行中，此时 waveIndex 就是正在打的那一波） */
  Engine.prototype.reachedWave = function () {
    if (this.state === "won") { return this.totalWaves(); }
    return Math.max(1, this.waveIndex);
  };

  Engine.prototype.startNextWave = function () {
    if (this.waveIndex >= this.waves.length) { return false; }

    var wave = this.waves[this.waveIndex];
    this.schedule = TD.buildSchedule(wave, this.grid.paths);
    this.scheduleAt = 0;
    this.spawnedThisWave = 0;
    this.waveActive = true;
    this.waveIndex += 1;
    this.events.push({ type: "wave", no: wave.no, note: wave.note || "" });
    return true;
  };

  /* 提前叫下一波：跳过剩余喘息时间，奖励金币（鼓励熟练玩家加速） */
  Engine.prototype.callWaveEarly = function () {
    if (this.state !== "running" || this.waveActive) { return false; }
    if (this.waveIndex >= this.waves.length) { return false; }
    var bonus = Math.max(0, Math.round(this.waveTimer * 5));
    this.gold += bonus;
    this.stats.goldEarned += bonus;
    this.waveTimer = 0;
    if (bonus > 0) { this.events.push({ type: "bonus", gold: bonus }); }
    return true;
  };

  /* 在某条路的某个位置生成一只敌人。
     at 省略 = 从出怪口出发；分裂体、召唤物则从母体所在的位置出发。 */
  Engine.prototype.spawn = function (key, path, at) {
    if (this.enemies.length >= cfg.LIMITS.maxEnemies) { return null; }

    var waveNo = Math.max(1, this.waveIndex);
    var e = new TD.Enemy(key, waveNo, this.map, path || 0);
    e.dist = Math.max(0, at || 0);
    var pos = this.grid.positionAt(e.path, e.dist);
    e.c = pos.c;
    e.r = pos.r;
    e.dc = pos.dc;
    e.dr = pos.dr;
    this.enemies.push(e);
    return e;
  };

  /* 分裂者死亡：原地裂成几只分裂体，前后错开一点，看起来是"炸开"而不是叠在一起 */
  Engine.prototype.splitApart = function (e) {
    var s = e.type.split;
    var i;
    for (i = 0; i < s.count; i++) {
      var spread = (i - (s.count - 1) / 2) * 0.32;
      var m = this.spawn(s.type, e.path, e.dist + spread);
      if (!m) { return; }
      m.bounty = s.bounty;
      m.hitDx = Math.cos(i * 2.1);
      m.hitDy = Math.sin(i * 2.1);
      m.hitTime = 0.16;
    }
    this.pushParticles(e.c, e.r, 8, cfg.PALETTE.steel, 1.2);
  };

  /* 召唤者放出小怪：落在它身前一点点的路上，并记在它名下（数量上限按名下计） */
  Engine.prototype.summonFrom = function (e, count) {
    var s = e.type.summon;
    var i;
    for (i = 0; i < count; i++) {
      var m = this.spawn(s.type, e.path, e.dist + 0.25 + i * 0.3);
      if (!m) { return; }
      m.bounty = s.bounty;
      m.master = e;
      e.minionsAlive += 1;
    }
    e.summonPulse = 0.32;
    this.pushParticles(e.c, e.r, 10, cfg.PALETTE.steel, 1.0);
  };

  /* ------------------------------------------------------------------ 粒子 */

  Engine.prototype.pushParticles = function (c, r, count, color, power) {
    var limit = cfg.LIMITS.maxParticles;
    var i;

    for (i = 0; i < count; i++) {
      if (this.particles.length >= limit) { return; }

      var p = this.particlePool.pop() || {};
      var ang = Math.random() * Math.PI * 2;
      var sp = (0.9 + Math.random() * 1.6) * (power || 1);

      p.c = c;
      p.r = r;
      p.vc = Math.cos(ang) * sp;
      p.vr = Math.sin(ang) * sp;
      p.life = 0.30 + Math.random() * 0.34;
      p.maxLife = p.life;
      p.color = color;
      p.size = 1.2 + Math.random() * 1.8;
      p.shard = false;
      this.particles.push(p);
    }
  };

  /* 死亡碎片：沿惯性方向飞散，比四散粒子更像"碎掉" */
  Engine.prototype.pushShards = function (e) {
    var limit = cfg.LIMITS.maxParticles;
    var count = e.boss ? 18 : (e.elite ? 12 : (e.minion ? 3 : 7));
    var i;

    for (i = 0; i < count; i++) {
      if (this.particles.length >= limit) { return; }

      var p = this.particlePool.pop() || {};
      var ang = Math.random() * Math.PI * 2;
      var sp = 0.7 + Math.random() * 1.5;

      p.c = e.c;
      p.r = e.r;
      p.vc = Math.cos(ang) * sp + e.dc * 0.7;
      p.vr = Math.sin(ang) * sp + e.dr * 0.7;
      p.life = 0.34 + Math.random() * 0.4;
      p.maxLife = p.life;
      p.color = e.boss ? cfg.PALETTE.alert : cfg.PALETTE.steel;
      p.size = e.boss ? 2.4 : (e.minion ? 1.2 : 1.6);
      p.shard = true;
      p.rot = Math.random() * Math.PI;
      p.vrot = (Math.random() - 0.5) * 9;
      this.particles.push(p);
    }
  };

  Engine.prototype.pushFloater = function (c, r, text, color) {
    if (this.floaters.length > 26) { return; }
    this.floaters.push({ c: c, r: r, text: text, color: color, life: 0.9, maxLife: 0.9 });
  };

  /* ------------------------------------------------------------------ 子弹 */

  Engine.prototype.fireBullet = function (spec) {
    if (this.bullets.length >= cfg.LIMITS.maxBullets) { return; }

    var b = this.bulletPool.pop() || {};
    b.kind = spec.kind;
    b.c = spec.fromC;
    b.r = spec.fromR;
    b.fromC = spec.fromC;
    b.fromR = spec.fromR;
    b.target = spec.target;
    b.damage = spec.damage;
    b.range = spec.range;
    b.splash = spec.splash;
    b.slow = spec.slow;
    b.slowTime = spec.slowTime;
    b.pierce = spec.pierce;
    b.aoe = spec.aoe;
    b.chain = spec.chain;
    b.owner = spec.owner;
    b.dead = false;
    b.trail = 0;
    b.marks = [];

    /* 瞬时弹种（轨炮射线、光环脉冲、连锁闪电）不飞行：开火当步就结算，
       之后只作为"视觉残影"按 life 淡出。其余按速度飞。 */
    if (spec.instant) {
      b.instant = true;
      /* 可见时长（游戏内时间，2× 倍速下实际减半）：够看清命中了谁，又不拖影 */
      b.life = spec.kind === "aura" ? 0.42 : 0.34;
      b.maxLife = b.life;
      b.speed = 0;
      b.beamC = spec.fromC;
      b.beamR = spec.fromR;
    } else {
      b.instant = false;
      b.speed = spec.kind === "mortar" ? 7.5 : 13.5;
      b.life = 2.2;
      b.maxLife = 2.2;
    }

    this.bullets.push(b);

    if (b.instant) { this.resolveHit(b); }
  };

  Engine.prototype.resolveHit = function (b) {
    var target = b.target;
    var hitC = target && target.alive ? target.c : b.c;
    var hitR = target && target.alive ? target.r : b.r;
    var i;

    if (b.aoe) {
      /* 光环脉冲：塔周围射程内的全部敌人一起吃满额伤害，必中，没有弹道 */
      var rr = b.range * b.range;
      for (i = 0; i < this.enemies.length; i++) {
        var a = this.enemies[i];
        if (!a.alive) { continue; }
        var ax = a.c - b.fromC;
        var ay = a.r - b.fromR;
        if (ax * ax + ay * ay > rr) { continue; }
        this.damage(a, b.damage, b, b.fromC, b.fromR);
      }
    } else if (b.chain) {
      /* 连锁闪电：先打主目标，再从上一个落点跳向最近的、还没被打过的敌人。
         跳跃伤害减半；路径记在 marks 里，渲染成一条折线。 */
      var cur = target && target.alive ? target : null;
      var hitSet = [];
      var dmg = b.damage;
      var fromC = b.fromC;
      var fromR = b.fromR;
      var hops = 0;

      while (cur && hops <= b.chain.jumps) {
        b.marks.push({ c: cur.c, r: cur.r });
        hitSet.push(cur);
        this.damage(cur, dmg, b, fromC, fromR);
        this.pushParticles(cur.c, cur.r, 3, cfg.PALETTE.gold, 0.6);
        fromC = cur.c;
        fromR = cur.r;
        dmg = b.damage * b.chain.ratio;
        hops += 1;

        var next = null;
        var bestD = b.chain.jumpRange * b.chain.jumpRange;
        for (i = 0; i < this.enemies.length; i++) {
          var cand = this.enemies[i];
          if (!cand.alive || hitSet.indexOf(cand) >= 0) { continue; }
          var cx = cand.c - fromC;
          var cy = cand.r - fromR;
          var d2 = cx * cx + cy * cy;
          if (d2 <= bestD) { bestD = d2; next = cand; }
        }
        cur = next;
      }
    } else if (b.splash > 0) {
      /* 溅射：范围内全部吃伤害，中心全额、边缘递减 */
      for (i = 0; i < this.enemies.length; i++) {
        var e = this.enemies[i];
        if (!e.alive) { continue; }
        var d = Math.hypot(e.c - hitC, e.r - hitR);
        if (d > b.splash) { continue; }
        var falloff = 1 - (d / b.splash) * 0.45;
        this.damage(e, b.damage * falloff, b, hitC, hitR);
      }
      this.pushParticles(hitC, hitR, 12, cfg.PALETTE.accent, 1.35);
    } else if (b.pierce) {
      /* 穿透：沿射线打到的第一个之后继续，但伤害衰减。
         射线几何要写回子弹（beamC/beamR + marks），否则画不出来。 */
      var ang = Math.atan2(hitR - b.fromR, hitC - b.fromC);
      var hits = 0;
      var maxProj = 0;
      var candidates = [];

      for (i = 0; i < this.enemies.length; i++) {
        var t = this.enemies[i];
        if (!t.alive) { continue; }
        var vx = t.c - b.fromC;
        var vy = t.r - b.fromR;
        var proj = vx * Math.cos(ang) + vy * Math.sin(ang);
        if (proj < 0) { continue; }
        var perp = Math.abs(-vx * Math.sin(ang) + vy * Math.cos(ang));
        if (perp > t.radius + 0.14) { continue; }
        candidates.push({ e: t, proj: proj });
      }

      /* 按距离排序，近的先吃全额伤害——"贯穿"在视觉和逻辑上才一致 */
      candidates.sort(function (x, y) { return x.proj - y.proj; });

      for (i = 0; i < candidates.length && hits < 3; i++) {
        var hit = candidates[i];
        b.marks.push({ c: hit.e.c, r: hit.e.r });
        this.damage(hit.e, b.damage * (hits === 0 ? 1 : 0.6), b, b.fromC, b.fromR);
        maxProj = hit.proj;
        hits += 1;
      }

      /* 射线画到最后一个命中点稍远处；没命中任何东西就画满射程 */
      var reach = hits > 0 ? maxProj + 0.5 : (b.range || 5);
      b.beamC = b.fromC + Math.cos(ang) * reach;
      b.beamR = b.fromR + Math.sin(ang) * reach;

      this.pushParticles(hitC, hitR, 6, cfg.PALETTE.gold, 1.1);
    } else if (target && target.alive) {
      this.damage(target, b.damage, b, b.fromC, b.fromR);
      if (b.slow > 0) {
        target.applySlow(1 - b.slow, b.slowTime);
        this.pushParticles(hitC, hitR, 4, cfg.PALETTE.steel, 0.6);
      } else {
        this.pushParticles(hitC, hitR, 3, cfg.PALETTE.accent, 0.5);
      }
    }

    /* 瞬时弹种不能在这里标死：它开火的同一步就会结算，
       若标死，紧接着的子弹循环会当场移除它，渲染时已经不在了——
       这正是"轨炮看不到弹道"的根因。瞬时弹只靠 life 自然淡出。 */
    if (!b.instant) { b.dead = true; }
  };

  Engine.prototype.damage = function (e, amount, b, fromC, fromR) {
    if (!e.alive) { return; }
    var dealt = e.hurt(amount, fromC, fromR);
    if (b && b.owner) { b.owner.damageDealt += dealt; }

    if (!e.alive && !e.leaked) {
      this.gold += e.bounty;
      this.stats.goldEarned += e.bounty;
      this.stats.kills += 1;
      if (b && b.owner) { b.owner.kills += 1; }
      this.pushShards(e);
      if (e.bounty > 0) { this.pushFloater(e.c, e.r, "+" + e.bounty, cfg.PALETTE.gold); }
      if (e.type.split) { this.splitApart(e); }
    }
  };

  /* 敌人离场（被杀或漏掉）时，把它从召唤者名下划掉，名额才能空出来 */
  Engine.prototype.release = function (e) {
    if (e.master) {
      e.master.minionsAlive = Math.max(0, e.master.minionsAlive - 1);
      e.master = null;
    }
  };

  /* ------------------------------------------------------------------ 步进 */

  Engine.prototype.step = function (dt) {
    var i;

    /* --- 波次调度 --- */
    if (this.waveActive) {
      this.scheduleAt += dt;
      while (this.schedule.length && this.schedule[0].at <= this.scheduleAt) {
        var job = this.schedule.shift();
        this.spawn(job.key, job.path);
        this.spawnedThisWave += 1;
      }
      if (!this.schedule.length && !this.enemies.length) {
        this.waveActive = false;
        if (this.waveIndex >= this.waves.length) {
          this.state = "won";
          this.events.push({ type: "won" });
          return;
        }
        this.waveTimer = cfg.RULES.waveGap;
        this.events.push({ type: "cleared", no: this.waveIndex });
      }
    } else if (this.waveIndex < this.waves.length) {
      this.waveTimer -= dt;
      if (this.waveTimer <= 0) { this.startNextWave(); }
    }

    /* --- 敌人 --- */
    for (i = this.enemies.length - 1; i >= 0; i--) {
      var e = this.enemies[i];
      e.step(dt, this.grid);

      if (e.leaked) {
        this.lives -= e.leakCost;
        this.stats.leaked += 1;
        this.events.push({ type: "leak", boss: e.boss });
        this.release(e);
        this.enemies.splice(i, 1);
        if (this.lives <= 0) {
          this.lives = 0;
          this.state = "lost";
          this.events.push({ type: "lost" });
          return;
        }
      } else if (!e.alive) {
        this.release(e);
        this.enemies.splice(i, 1);
      }
    }

    /* --- 召唤者放小怪（单独一轮，避免边遍历边往数组里加） --- */
    var n = this.enemies.length;
    for (i = 0; i < n; i++) {
      var s = this.enemies[i];
      if (!s.type.summon) { continue; }
      var want = s.wantsSummon(dt, this.grid.paths[s.path].length);
      if (want > 0) { this.summonFrom(s, want); }
    }

    /* --- 塔开火 --- */
    for (i = 0; i < this.towers.length; i++) {
      var spec = this.towers[i].tryFire(dt, this.enemies, this.grid);
      if (spec) { this.fireBullet(spec); }
    }

    /* --- 子弹 --- */
    for (i = this.bullets.length - 1; i >= 0; i--) {
      var b = this.bullets[i];
      b.life -= dt;

      if (!b.instant && !b.dead) {
        var tc, tr;
        if (b.target && b.target.alive) {
          tc = b.target.c;
          tr = b.target.r;
        } else {
          /* 目标死了，子弹继续飞到原方向，臼炮还能溅射到位 */
          tc = b.c + (b.c - b.fromC);
          tr = b.r + (b.r - b.fromR);
          if (b.splash <= 0) { b.dead = true; }
        }

        var dx = tc - b.c;
        var dy = tr - b.r;
        var d = Math.hypot(dx, dy);
        var move = b.speed * dt;

        if (d <= move) {
          b.c = tc;
          b.r = tr;
          this.resolveHit(b);
        } else {
          b.c += (dx / d) * move;
          b.r += (dy / d) * move;
          b.trail += move;
        }
      }

      if (b.dead || b.life <= 0) {
        this.bullets.splice(i, 1);
        b.target = null;
        b.owner = null;
        this.bulletPool.push(b);
      }
    }

    /* --- 粒子 --- */
    for (i = this.particles.length - 1; i >= 0; i--) {
      var p = this.particles[i];
      p.life -= dt;
      p.c += p.vc * dt;
      p.r += p.vr * dt;
      p.vc *= 0.90;
      p.vr *= 0.90;
      if (p.shard) { p.rot += p.vrot * dt; }
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        p.shard = false;
        this.particlePool.push(p);
      }
    }

    /* --- 飘字 --- */
    for (i = this.floaters.length - 1; i >= 0; i--) {
      var f = this.floaters[i];
      f.life -= dt;
      f.r -= dt * 0.75;
      if (f.life <= 0) { this.floaters.splice(i, 1); }
    }

    this.time += dt;
  };

  /* 外部每帧调用：real 是真实经过的秒数。
     固定步长切片，倍速通过多跑几步实现而不是放大 dt——
     放大 dt 会让高速敌人穿过射程判定。 */
  Engine.prototype.advance = function (real) {
    if (this.state !== "running") { return; }

    /* 单帧最多补 0.1 秒，防止切回标签页时一次性补算几十秒 */
    var slice = Math.min(real, 0.1);
    this.realTime += slice;
    this.acc += slice * this.speed;

    var guard = 0;
    while (this.acc >= STEP && guard < 12) {
      this.step(STEP);
      this.acc -= STEP;
      guard += 1;
      if (this.state !== "running") { this.acc = 0; break; }
    }
  };

  Engine.prototype.start = function () {
    if (this.state === "ready") { this.state = "running"; }
  };

  Engine.prototype.togglePause = function () {
    if (this.state === "running") { this.state = "paused"; return true; }
    if (this.state === "paused") { this.state = "running"; return true; }
    return false;
  };

  Engine.prototype.setSpeed = function (s) { this.speed = s; };

  Engine.prototype.drain = function () {
    var out = this.events;
    this.events = [];
    return out;
  };

  TD.Engine = Engine;
})(window);
