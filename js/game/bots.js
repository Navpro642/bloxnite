/* ==========================================================================
   BLOXNITE — bots (offline opponents, NOT real multiplayer)
   Lightweight actors that reuse the shared physics (BN.Physics), the shared
   character rig, and the ONE WeaponController. No per-bot cameras, no
   per-bot shadow casters: 20+ bots stay cheap on a mid-range laptop.
   ========================================================================== */
(function () {
  var BN = (window.BN = window.BN || {});
  var U = BN.util;

  var SIGHT = 62;          /* metres a bot can notice a target */
  var REACTION = 0.34;     /* seconds of delay before it starts shooting */
  var LOSE_SIGHT = 1.6;    /* seconds of memory after losing line of sight */

  var NAMES = [
    'Rook', 'Nova', 'Vex', 'Cinder', 'Tally', 'Drift', 'Pike', 'Juno',
    'Bramble', 'Kestrel', 'Mossback', 'Onyx', 'Quill', 'Ravine', 'Sable',
    'Thistle', 'Umber', 'Vantage', 'Wisp', 'Yarrow', 'Zephyr', 'Basalt',
    'Cobalt', 'Dune', 'Ember', 'Flint', 'Gale', 'Hollow', 'Ink', 'Jasper'
  ];

  function Bot(THREE, world, scene, opts) {
    opts = opts || {};
    this.THREE = THREE;
    this.world = world;
    this.scene = scene;

    this.id = 'bot' + (Bot._seq = (Bot._seq || 0) + 1);
    this.name = opts.name || NAMES[(Math.random() * NAMES.length) | 0];

    this.pos = new THREE.Vector3(0, 0, 0);
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.radius = BN.Physics.RADIUS;
    this.height = BN.Physics.HEIGHT;

    this.maxHealth = 100;
    this.maxShield = 100;
    this.health = 100;
    this.shield = 0;
    this.alive = true;
    this.control = true;
    this.grounded = false;
    this.aiming = false;
    this.sprinting = false;
    this.crouch = false;
    this.wantJump = false;

    this.kills = 0;
    this.events = {};

    /* AI state */
    this.target = null;
    this.targetSeen = 0;
    this.reactTimer = 0;
    this.state = 'roam';       /* roam | engage | loot | flee */
    this.waypoint = null;
    this.repathTimer = 0;
    this.strafeDir = Math.random() < 0.5 ? -1 : 1;
    this.strafeTimer = 0;
    this.skill = opts.skill != null ? opts.skill : U.rand(0.45, 0.9);
    this.thinkTimer = Math.random() * 0.4;
    this.jumpCooldown = 0;
    this.lastShotAt = 0;
    this._v = new THREE.Vector3();

    this.character = new BN.Character(THREE, opts.palette || BN.randomPalette(), {
      shadows: false
    });
    this.character.group.visible = false;
    scene.add(this.character.group);

    this.inventory = new BN.Inventory();
    this.weapons = new BN.WeaponController(this);
  }
  BN.Bot = Bot;
  Bot.NAMES = NAMES;

  Bot.prototype.on = function (name, fn) {
    (this.events[name] = this.events[name] || []).push(fn);
    return this;
  };
  Bot.prototype.emit = function (name, a, b) {
    var list = this.events[name];
    if (!list) return;
    for (var i = 0; i < list.length; i++) list[i](a, b);
  };
  Bot.prototype.isBot = function () { return true; };

  /* --------------------------- combat surface --------------------------- */
  /* Mirrors Player so the shared WeaponController and damage code work. */
  Bot.prototype.eyePos = function (out) {
    return (out || new this.THREE.Vector3()).set(
      this.pos.x, this.pos.y + (this.crouch ? 1.15 : 1.45), this.pos.z
    );
  };
  Bot.prototype.hitSpheres = function () {
    var p = this.pos;
    return [
      { x: p.x, y: p.y + 1.62, z: p.z, r: 0.27, part: 'head' },
      { x: p.x, y: p.y + 1.05, z: p.z, r: 0.44, part: 'body' },
      { x: p.x, y: p.y + 0.45, z: p.z, r: 0.38, part: 'legs' }
    ];
  };
  Bot.prototype.damage = function (amount, info) {
    if (!this.alive || amount <= 0) return 0;
    var left = amount;
    if (this.shield > 0) {
      var absorbed = Math.min(this.shield, left);
      this.shield -= absorbed;
      left -= absorbed;
    }
    this.health -= left;
    /* being shot makes a bot turn and fight back */
    if (info && info.from && this.alive) {
      this.target = info.from;
      this.targetSeen = LOSE_SIGHT;
      this.state = 'engage';
    }
    this.emit('damage', amount, info);
    if (this.health <= 0) {
      this.health = 0;
      this.die(info);
    }
    return amount;
  };
  Bot.prototype.heal = function (n) {
    this.health = Math.min(this.maxHealth, this.health + n);
  };
  Bot.prototype.addShield = function (n) {
    this.shield = Math.min(this.maxShield, this.shield + n);
  };
  Bot.prototype.die = function (info) {
    if (!this.alive) return;
    this.alive = false;
    this.control = false;
    this.vel.set(0, 0, 0);
    this.character.setDead(true);
    this.emit('death', info || {});
  };

  Bot.prototype.syncWeaponModel = function () {
    var w = this.inventory.activeItem();
    if (w && w.kind === 'weapon') {
      var def = BN.WEAPONS[w.defId];
      if (def) this.character.setWeapon(def.modelRef, this.palette ? this.palette.accent : null);
    } else {
      this.character.setWeapon(null);
    }
  };

  Bot.prototype.spawn = function (x, y, z, yaw) {
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw || Math.random() * Math.PI * 2;
    this.pitch = 0;
    this.alive = true;
    this.control = true;
    this.health = this.maxHealth;
    this.shield = Math.random() < 0.45 ? 50 : 0;
    this.state = 'roam';
    this.target = null;
    this.targetSeen = 0;
    this.waypoint = null;
    this.character.group.visible = true;
    this.character.setDead(false);
    this.character.group.position.copy(this.pos);
  };

  /* ------------------------------- senses ------------------------------- */
  Bot.prototype.canSee = function (other) {
    if (!other || other.alive === false || !other.pos) return false;
    var d = this.pos.distanceTo(other.pos);
    if (d > SIGHT) return false;
    /* bots use the same occlusion test the player's shots use */
    var from = this.eyePos(this._v);
    return this.world.lineOfSight(from.x, from.y, from.z, other.pos.x, other.pos.y + 1.4, other.pos.z);
  };

  Bot.prototype.nearestEnemy = function (others) {
    var best = null, bestD = Infinity;
    for (var i = 0; i < others.length; i++) {
      var o = others[i];
      if (!o || o === this || o.alive === false) continue;
      if (!this.canSee(o)) continue;
      var d = this.pos.distanceTo(o.pos);
      if (d < bestD) { bestD = d; best = o; }
    }
    return best;
  };

  /* ------------------------------ steering ------------------------------ */
  /* Pick a destination the bot can actually use: loot if unarmed, otherwise
     the nearest safe-zone point or a wander target. */
  Bot.prototype.chooseWaypoint = function (ctx) {
    var hasGun = false;
    for (var i = 0; i < 5; i++) {
      var it = this.inventory.slots[i];
      if (it && it.kind === 'weapon') { hasGun = true; break; }
    }

    /* unarmed bots run for the closest ground weapon */
    if (!hasGun && ctx.loot && ctx.loot.items) {
      var best = null, bestD = Infinity;
      for (var j = 0; j < ctx.loot.items.length; j++) {
        var e = ctx.loot.items[j];
        if (!e.item || e.item.kind !== 'weapon') continue;
        var d = this.pos.distanceTo(e.mesh.position);
        if (d < 55 && d < bestD) { bestD = d; best = e; }
      }
      if (best) {
        this.lootEntry = best;
        return { x: best.mesh.position.x, z: best.mesh.position.z };
      }
    }

    /* stay inside the next zone when the storm is relevant */
    if (ctx.storm && ctx.storm.active) {
      var s = ctx.storm;
      if (s.distanceOutside(this.pos.x, this.pos.z) > -12 || !s.inNextZone(this.pos.x, this.pos.z)) {
        var a = Math.random() * Math.PI * 2;
        var r = Math.random() * Math.max(1, s.next.r * 0.7);
        return { x: s.next.cx + Math.cos(a) * r, z: s.next.cz + Math.sin(a) * r };
      }
    }

    var half = BN.World.HALF - 22;
    return { x: U.rand(-half, half), z: U.rand(-half, half) };
  };

  Bot.prototype.stepToward = function (dt, tx, tz) {
    var dx = tx - this.pos.x, dz = tz - this.pos.z;
    var d = Math.hypot(dx, dz);
    if (d < 0.6) { this.waypoint = null; return false; }

    /* desired heading */
    var want = Math.atan2(dx, dz);

    /* obstacle probe: if something blocks us, slide around it */
    var probe = 1.8;
    var px = this.pos.x + Math.sin(want) * probe;
    var pz = this.pos.z + Math.cos(want) * probe;
    if (!this.world.lineOfSight(this.pos.x, this.pos.y + 1.1, this.pos.z, px, this.pos.y + 1.1, pz)) {
      want += 0.9 * this.strafeDir;
      if (this.jumpCooldown <= 0 && Math.random() < 0.3) {
        this.wantJump = true;
        this.jumpCooldown = 1.2;
      }
    }

    /* turn smoothly toward the heading */
    var diff = ((want - this.yaw + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (diff < -Math.PI) diff += Math.PI * 2;
    this.yaw += U.clamp(diff, -6 * dt, 6 * dt);
    this.pitch = U.damp(this.pitch, 0, 6, dt);

    this.moveInput = { x: 0, z: 1 };
    this.sprinting = d > 8;
    return true;
  };

  /* -------------------------------- update ------------------------------ */
  /**
   * dt   seconds
   * ctx  { players: [main player + bots], loot, storm, onPickup }
   */
  Bot.prototype.update = function (dt, ctx) {
    if (this.jumpCooldown > 0) this.jumpCooldown -= dt;
    if (!this.alive) {
      this.character.update(dt, { speed: 0, grounded: true, aiming: false, crouch: false, dead: true });
      return;
    }
    var others = ctx.players || [];

    /* --- perception, at a modest rate so 20 bots are cheap --- */
    this.thinkTimer -= dt;
    if (this.thinkTimer <= 0) {
      this.thinkTimer = 0.18 + Math.random() * 0.12;
      var seen = this.nearestEnemy(others);
      if (seen) {
        if (seen !== this.target) this.reactTimer = REACTION * (1.6 - this.skill);
        this.target = seen;
        this.targetSeen = LOSE_SIGHT;
      } else if (this.target) {
        this.targetSeen -= this.thinkTimer;
        if (this.targetSeen <= 0 || this.target.alive === false) {
          this.target = null;
          this.state = 'roam';
        }
      }
    }

    this.moveInput = { x: 0, z: 0 };
    this.sprinting = false;
    var fireWanted = false;

    if (this.target && this.target.alive !== false) {
      this.state = 'engage';
      var t = this.target;
      var dist = this.pos.distanceTo(t.pos);
      var def = this.weapons.def();

      /* pick a usable weapon for the distance */
      this.chooseWeaponFor(dist);

      /* aim with a skill-based error */
      var aim = this._v.set(t.pos.x, t.pos.y + 1.05, t.pos.z);
      var ex = this.pos.x, ey = this.pos.y + 1.45, ez = this.pos.z;
      var ax = aim.x - ex, ay = aim.y - ey, az = aim.z - ez;
      var horiz = Math.hypot(ax, az) || 1;
      var wantYaw = Math.atan2(ax, az);
      var wantPitch = Math.atan2(ay, horiz);
      var err = (1 - this.skill) * 0.11;
      wantYaw += Math.sin(performance.now() * 0.004 + this.pos.x) * err;
      wantPitch += Math.cos(performance.now() * 0.003 + this.pos.z) * err * 0.6;

      var yawDiff = ((wantYaw - this.yaw + Math.PI) % (Math.PI * 2)) - Math.PI;
      if (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
      var turnRate = 5 + this.skill * 7;
      this.yaw += U.clamp(yawDiff, -turnRate * dt, turnRate * dt);
      this.pitch = U.damp(this.pitch, U.clamp(wantPitch, -0.9, 0.8), 9, dt);

      var onTarget = Math.abs(yawDiff) < 0.18;

      /* combat movement: close the gap or strafe at range */
      if (dist > 34) {
        this.stepToward(dt, t.pos.x, t.pos.z);
      } else if (dist < 6) {
        this.moveInput = { x: 0, z: -1 };     /* back off */
        this.aiming = true;
      } else {
        this.strafeTimer -= dt;
        if (this.strafeTimer <= 0) {
          this.strafeTimer = 0.6 + Math.random() * 1.0;
          this.strafeDir *= -1;
        }
        this.moveInput = { x: this.strafeDir, z: Math.random() < 0.7 ? 0.35 : 0 };
        this.aiming = true;
      }

      this.reactTimer -= dt;
      if (onTarget && this.reactTimer <= 0 && def) {
        var ideal = (def.range && def.range.max) || 40;
        if (dist < ideal * 1.15) fireWanted = true;
      }
      /* reload when the magazine runs dry */
      var item = this.inventory.activeItem();
      if (item && item.kind === 'weapon' && def && item.mag <= 0) this.weapons.startReload();
    } else {
      /* --- roaming --- */
      this.aiming = false;
      this.repathTimer -= dt;
      if (!this.waypoint || this.repathTimer <= 0) {
        this.repathTimer = 4 + Math.random() * 4;
        this.waypoint = this.chooseWaypoint(ctx);
      }
      if (this.waypoint) {
        this.stepToward(dt, this.waypoint.x, this.waypoint.z);
        /* arrived at loot we wanted? */
        if (this.lootEntry && this.pos.distanceTo(this.lootEntry.mesh.position) < 1.9) {
          this.tryGrabLoot(ctx);
        }
      }
      /* heal when safe and hurt */
      if (this.health < 55 && Math.random() < 0.01) this.health = Math.min(100, this.health + 25);
    }

    /* --- the ONE weapon controller, driven by bot intent --- */
    this.weapons.intentFire = fireWanted && this.alive;
    this.weapons.update(dt, ctx);

    /* --- movement through shared capsule physics --- */
    var speed = this.crouch ? 2.3 : 4.6;
    if (this.sprinting) speed = 7.2;
    if (this.aiming) speed = Math.min(speed, 2.6);
    if (!this.grounded) speed *= 0.94;

    var fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    var rx = -Math.cos(this.yaw), rz = Math.sin(this.yaw);
    var mz = this.moveInput.z, mx = this.moveInput.x;
    var dx = fx * mz + rx * mx;
    var dz = fz * mz + rz * mx;
    var len = Math.hypot(dx, dz);
    if (len > 0.0001) { dx /= len; dz /= len; }

    var accel = this.grounded ? (len > 0.0001 ? 13 : 12) : 2.6;
    this.vel.x = U.damp(this.vel.x, dx * speed, accel, dt);
    this.vel.z = U.damp(this.vel.z, dz * speed, accel, dt);

    if (this.wantJump && this.grounded) {
      this.vel.y = 8.1;
      this.grounded = false;
    }
    this.wantJump = false;

    this.vel.y -= BN.Physics.GRAVITY * dt;
    this.vel.y = Math.max(this.vel.y, -55);

    BN.Physics.moveXZ(this.world, this.pos, this.vel.x * dt, this.vel.z * dt, this.radius, this.height);
    this.pos.y += this.vel.y * dt;

    var g = this.world.groundHeightAt(this.pos.x, this.pos.z, this.pos.y);
    if (this.pos.y <= g + 0.02) {
      this.pos.y = g;
      this.vel.y = 0;
      this.grounded = true;
    } else if (this.grounded && this.vel.y <= 0 && this.pos.y - g < 0.55) {
      this.pos.y = g;
      this.vel.y = 0;
      this.grounded = true;
    } else {
      this.grounded = false;
    }

    if (this.pos.y < -0.95) {
      this.pos.y = U.damp(this.pos.y, -0.95, 6, dt);
      this.vel.y = Math.max(this.vel.y, 0);
    }

    var half = BN.World.HALF - 6;
    this.pos.x = U.clamp(this.pos.x, -half, half);
    this.pos.z = U.clamp(this.pos.z, -half, half);

    /* --- presentation --- */
    var planar = Math.hypot(this.vel.x, this.vel.z);
    var cg = this.character.group;
    cg.position.copy(this.pos);
    cg.rotation.y = this.yaw;
    this.character.update(dt, {
      speed: planar,
      grounded: this.grounded,
      aiming: this.aiming,
      crouch: this.crouch,
      pitch: this.pitch,
      recoil: this.weapons.recoilKick
    });
  };

  /* swap to the best weapon the bot owns for this distance */
  Bot.prototype.chooseWeaponFor = function (dist) {
    var best = -1, bestScore = -1;
    for (var i = 0; i < 5; i++) {
      var it = this.inventory.slots[i];
      if (!it || it.kind !== 'weapon') continue;
      var d = BN.WEAPONS[it.defId];
      if (!d) continue;
      var max = (d.range && d.range.max) || 40;
      var score = 1;
      if (dist < 12 && d.category === 'shotgun') score = 3;
      else if (dist > 30 && (d.category === 'sniper' || d.category === 'rifle')) score = 3;
      else if (dist > 30 && d.category === 'shotgun') score = 0.1;
      else if (d.category === 'smg' && dist < 25) score = 2.2;
      if (dist > max) score *= 0.2;
      if (score > bestScore) { bestScore = score; best = i; }
    }
    if (best >= 0 && best !== this.inventory.active) {
      this.inventory.select(best);
      this.weapons.reset();
      this.syncWeaponModel();
    }
  };

  Bot.prototype.tryGrabLoot = function (ctx) {
    var e = this.lootEntry;
    if (!e || !e.item) { this.lootEntry = null; return; }
    if (this.pos.distanceTo(e.mesh.position) > 2.2) return;
    if (ctx.loot.focus !== e) ctx.loot.focus = e;
    var picked = ctx.loot.tryPickup(this);
    if (picked) {
      this.syncWeaponModel();
      if (this.inventory.activeItem() && this.inventory.activeItem().kind === 'weapon') {
        this.weapons.reset();
      }
    }
    this.lootEntry = null;
    this.waypoint = null;
  };

  Bot.prototype.dispose = function () {
    if (this.character.group.parent) this.character.group.parent.remove(this.character.group);
  };

  /* ------------------------------ director ----------------------------- */
  /* Owns the bot roster, keeps them spread out, prunes the dead. */
  function BotManager(THREE, world, scene, opts) {
    opts = opts || {};
    this.THREE = THREE;
    this.world = world;
    this.scene = scene;
    this.bots = [];
    this.maxBots = opts.count != null ? opts.count : 19;
  }
  BN.BotManager = BotManager;

  BotManager.prototype.spawnWave = function (playerPos, opts) {
    opts = opts || {};
    var half = BN.World.HALF - 40;
    for (var i = 0; i < this.maxBots; i++) {
      var bot = new BN.Bot(this.THREE, this.world, this.scene, {
        skill: U.rand(0.4, 0.92)
      });
      /* find a spot away from the player's landing area */
      var x = 0, z = 0, tries = 0;
      do {
        x = U.rand(-half, half);
        z = U.rand(-half, half);
        tries++;
      } while (tries < 24 && playerPos && Math.hypot(x - playerPos.x, z - playerPos.z) < 55);

      var y = this.world.heightAt(x, z);
      bot.spawn(x, y + 0.5, z);

      /* starting kit: sometimes a gun, sometimes nothing (so they loot) */
      if (Math.random() < 0.7) {
        var pool = ['ar_common', 'smg_uncommon', 'shotgun_common', 'pistol_common', 'ar_rare', 'sniper_rare'];
        bot.inventory.set(0, BN.makeWeaponItem(pool[(Math.random() * pool.length) | 0]));
      }
      bot.syncWeaponModel();
      this.bots.push(bot);
    }
    return this.bots;
  };

  BotManager.prototype.aliveCount = function () {
    var n = 0;
    for (var i = 0; i < this.bots.length; i++) if (this.bots[i].alive) n++;
    return n;
  };

  BotManager.prototype.update = function (dt, ctx) {
    var all = ctx.players;
    for (var i = 0; i < this.bots.length; i++) {
      var b = this.bots[i];
      b.update(dt, ctx);
      if (!b.alive && b.character.group.visible && !b._hiddenAt) {
        b._hiddenAt = performance.now();
      }
      /* fade corpses out of the way after a few seconds */
      if (b._hiddenAt && performance.now() - b._hiddenAt > 4000) {
        b.character.group.visible = false;
        b._hiddenAt = -1;
      }
    }
    /* keep target lists fresh for the next frame */
    ctx.players = all;
  };

  BotManager.prototype.clear = function () {
    for (var i = 0; i < this.bots.length; i++) this.bots[i].dispose();
    this.bots.length = 0;
  };
})();
