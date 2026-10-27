/* ==========================================================================
   BLOXNITE — storm (safe zone) system
   Real world coordinates: the zone centre/radius are metres in the same space
   the player and bots move in, so "outside" is a distance test, not a HUD trick.
   ========================================================================== */
(function () {
  var BN = (window.BN = window.BN || {});
  var U = BN.util;

  /* wait  = seconds the zone holds before it starts closing
     close = seconds it takes to shrink
     factor= new radius as a fraction of the previous radius
     dps   = damage per second outside the zone during that phase        */
  var PHASES = [
    { wait: 26, close: 22, factor: 0.72, dps: 1 },
    { wait: 22, close: 20, factor: 0.66, dps: 2 },
    { wait: 19, close: 18, factor: 0.62, dps: 4 },
    { wait: 16, close: 16, factor: 0.58, dps: 6 },
    { wait: 14, close: 14, factor: 0.52, dps: 8 },
    { wait: 12, close: 12, factor: 0.45, dps: 10 },
    { wait: 10, close: 12, factor: 0.30, dps: 12 }
  ];

  var TICK = 0.5;          // damage application interval
  var WARN_AT = 5;         // "closing" callout a few seconds early

  function Storm(THREE, scene, world, opts) {
    opts = opts || {};
    this.THREE = THREE;
    this.scene = scene;
    this.world = world;
    this.phases = opts.phases || PHASES;
    this.listeners = [];

    this.safe = { cx: 0, cz: 0, r: 10 };
    this.start = { cx: 0, cz: 0, r: 10 };
    this.next = { cx: 0, cz: 0, r: 10 };

    this.index = 0;
    this.phaseTime = 0;
    this.closing = false;
    this.active = false;
    this.finished = false;
    this.dps = 0;
    this.tickTimer = 0;
    this.warned = {};

    this.group = new THREE.Group();
    this.group.name = 'storm';
    this.group.visible = false;
    scene.add(this.group);
    this.build();
  }
  BN.Storm = Storm;
  Storm.PHASES = PHASES;

  Storm.prototype.on = function (fn) { this.listeners.push(fn); return this; };
  Storm.prototype.emit = function (name, a, b) {
    for (var i = 0; i < this.listeners.length; i++) this.listeners[i](name, a, b);
  };

  /* --------------------------- visual wall ------------------------------ */
  Storm.prototype.build = function () {
    var THREE = this.THREE;
    var height = 90;

    /* cylinder wall: BackSide so the camera sees it from inside the zone */
    var geo = new THREE.CylinderGeometry(1, 1, height, 64, 1, true);
    geo.translate(0, height / 2, 0);
    var mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#7c4dff'),
      transparent: true,
      opacity: 0.16,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false
    });
    this.wall = new THREE.Mesh(geo, mat);
    this.wall.renderOrder = 3;
    this.group.add(this.wall);

    var mat2 = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#3be0ff'),
      transparent: true,
      opacity: 0.3,
      side: THREE.BackSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false
    });
    this.inner = new THREE.Mesh(geo, mat2);
    this.inner.renderOrder = 4;
    this.group.add(this.inner);

    /* a thin ground ring so the edge is readable at a distance */
    var ringGeo = new THREE.RingGeometry(0.985, 1.0, 96);
    ringGeo.rotateX(-Math.PI / 2);
    this.ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
      color: new THREE.Color('#9b7cff'),
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthWrite: false,
      fog: false
    }));
    this.ring.position.y = 0.12;
    this.group.add(this.ring);

    /* next-zone preview, drawn on the ground */
    var nextGeo = new THREE.RingGeometry(0.975, 1.0, 80);
    nextGeo.rotateX(-Math.PI / 2);
    this.nextRing = new THREE.Mesh(nextGeo, new THREE.MeshBasicMaterial({
      color: new THREE.Color('#ffffff'),
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
      depthWrite: false,
      fog: false
    }));
    this.nextRing.visible = false;
    this.group.add(this.nextRing);
  };

  /* ------------------------------ lifecycle ----------------------------- */
  Storm.prototype.reset = function () {
    var half = (BN.World && BN.World.SIZE ? BN.World.SIZE : 440) * 0.5;
    this.safe.cx = this.start.cx = U.rand(-half * 0.22, half * 0.22);
    this.safe.cz = this.start.cz = U.rand(-half * 0.22, half * 0.22);
    this.safe.r = this.start.r = half * 1.28;
    this.index = 0;
    this.phaseTime = 0;
    this.closing = false;
    this.active = true;
    this.finished = false;
    this.dps = 0;
    this.tickTimer = 0;
    this.warned = {};
    this.pickNext();
    this.group.visible = true;
    this.syncVisual();
  };

  /* choose the centre of the next zone, biased to stay inside this one */
  Storm.prototype.pickNext = function () {
    var p = this.phases[Math.min(this.index, this.phases.length - 1)];
    var newR = this.safe.r * p.factor;
    var maxOffset = Math.max(0, this.safe.r - newR) * 0.72;
    var a = Math.random() * Math.PI * 2;
    var d = Math.sqrt(Math.random()) * maxOffset;
    this.next.cx = this.safe.cx + Math.cos(a) * d;
    this.next.cz = this.safe.cz + Math.sin(a) * d;
    this.next.r = newR;
    this.nextRing.visible = true;
  };

  Storm.prototype.syncVisual = function () {
    var s = this.safe;
    this.group.position.set(s.cx, 0, s.cz);
    this.wall.scale.set(s.r, 1, s.r);
    this.inner.scale.set(s.r * 0.995, 1, s.r * 0.995);
    this.ring.scale.set(s.r, 1, s.r);
    this.nextRing.position.set(this.next.cx - s.cx, 0.14, this.next.cz - s.cz);
    this.nextRing.scale.set(this.next.r, 1, this.next.r);
  };

  /* ------------------------------- queries ------------------------------ */
  Storm.prototype.distanceOutside = function (x, z) {
    var d = Math.hypot(x - this.safe.cx, z - this.safe.cz);
    return Math.max(0, d - this.safe.r);
  };
  Storm.prototype.isOutside = function (x, z) {
    return this.active && this.distanceOutside(x, z) > 0;
  };
  Storm.prototype.inNextZone = function (x, z) {
    return Math.hypot(x - this.next.cx, z - this.next.cz) <= this.next.r;
  };
  Storm.prototype.timeLeft = function () {
    var p = this.phases[Math.min(this.index, this.phases.length - 1)];
    var total = this.closing ? p.close : p.wait;
    return Math.max(0, total - this.phaseTime);
  };
  Storm.prototype.phaseLabel = function () {
    if (this.finished) return 'Zone final';
    var p = this.phases[Math.min(this.index, this.phases.length - 1)];
    return (this.closing ? 'Storm closing' : 'Next zone in ') + ' ' +
      (this.closing ? Math.ceil(this.timeLeft()) + 's' : Math.ceil(this.timeLeft()) + 's');
  };

  /* data for the minimap: normalised 0..1 positions on a square map */
  Storm.prototype.mapData = function () {
    var half = (BN.World && BN.World.SIZE ? BN.World.SIZE : 440) * 0.5;
    return {
      safe: { x: (this.safe.cx + half) / (half * 2), z: (this.safe.cz + half) / (half * 2), r: this.safe.r / (half * 2) },
      next: { x: (this.next.cx + half) / (half * 2), z: (this.next.cz + half) / (half * 2), r: this.next.r / (half * 2) }
    };
  };

  /* -------------------------------- update ------------------------------ */
  Storm.prototype.update = function (dt, ctx) {
    if (!this.active) return;
    var p = this.phases[Math.min(this.index, this.phases.length - 1)];

    if (!this.closing) {
      this.phaseTime += dt;
      this.dps = this.index === 0 ? 1 : this.dps;
      var left = p.wait - this.phaseTime;
      if (left <= WARN_AT && !this.warned.close && this.index > 0) {
        this.warned.close = true;
        this.emit('closing', Math.ceil(left));
      }
      if (this.phaseTime >= p.wait) {
        this.closing = true;
        this.phaseTime = 0;
        this.from = { cx: this.safe.cx, cz: this.safe.cz, r: this.safe.r };
        this.dps = p.dps;
        this.emit('closing', 0);
      }
    } else {
      this.phaseTime += dt;
      var t = U.clamp(this.phaseTime / p.close, 0, 1);
      var e = t * t * (3 - 2 * t);           /* smoothstep, no jarring pop */
      this.safe.cx = U.lerp(this.from.cx, this.next.cx, e);
      this.safe.cz = U.lerp(this.from.cz, this.next.cz, e);
      this.safe.r = U.lerp(this.from.r, this.next.r, e);

      if (t >= 1) {
        this.safe.cx = this.next.cx;
        this.safe.cz = this.next.cz;
        this.safe.r = this.next.r;
        this.closing = false;
        this.phaseTime = 0;
        this.index++;
        this.dps = p.dps;
        this.warned = {};
        if (this.index >= this.phases.length) {
          this.finished = true;
          this.nextRing.visible = false;
          this.emit('final');
        } else {
          this.pickNext();
          this.emit('phase', this.index + 1);
        }
      }
    }

    this.syncVisual();
    this.pulse += dt;

    /* damage tick — real damage, applied on an interval */
    this.tickTimer += dt;
    if (this.tickTimer < TICK) return;
    var slice = this.tickTimer;
    this.tickTimer = 0;

    var players = (ctx && ctx.players) || [];
    for (var i = 0; i < players.length; i++) {
      var pl = players[i];
      if (!pl || pl.alive === false || !pl.pos) continue;
      var out = this.distanceOutside(pl.pos.x, pl.pos.z);
      if (out <= 0) continue;
      var dmg = this.dps * slice;
      if (pl.damage) {
        pl.damage(dmg, {
          by: 'storm', storm: true, part: 'body',
          weaponName: 'Storm'
        });
      }
      if (pl.isMainPlayer && pl.emit) pl.emit('stormDamage', out);
    }
  };

  Storm.prototype.stop = function () {
    this.active = false;
    this.group.visible = false;
  };

  Storm.prototype.dispose = function () {
    this.group.traverse(function (o) {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
    if (this.group.parent) this.group.parent.remove(this.group);
  };
})();
