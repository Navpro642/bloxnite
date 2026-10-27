/* ==========================================================================
   BLOXNITE — bots (offline opponents, NOT real multiplayer)
   Bots reuse the shared physics (BN.Physics), the shared character rig and the
   ONE WeaponController. They must expose the same owner surface the controller
   expects: eyePos, lookDir, hitSpheres, damage, inventory, emit, isBot.
   No per-bot cameras and no per-bot shadow casters, so 20 bots stay cheap.
   ========================================================================== */
(function () {
  var BN = (window.BN = window.BN || {});
  var U = BN.util;

  var SIGHT = 62;          /* metres a bot can notice a target */
  var REACTION = 0.34;     /* seconds of hesitation before it opens fire */
  var LOSE_SIGHT = 1.6;    /* seconds of memory after losing line of sight */

  var NAMES = [
    'Rook', 'Nova', 'Vex', 'Cinder', 'Tally', 'Drift', 'Pike', 'Juno',
    'Bramble', 'Kestrel', 'Mossback', 'Onyx', 'Quill', 'Ravine', 'Sable',
    'Thistle', 'Umber', 'Vantage', 'Wisp', 'Yarrow', 'Zephyr', 'Basalt',
    'Cobalt', 'Dune', 'Ember', 'Flint', 'Gale', 'Hollow', 'Ink', 'Jasper'
  ];

  var KIT = ['ar_common', 'smg_uncommon', 'shotgun_common', 'pistol_common', 'ar_rare', 'sniper_rare'];

  function defaultPalette() {
    if (BN.Save && BN.Save.palette) {
      var p = BN.Save.palette();
      if (p) return p;
    }
    return { shirt: '#2f6bff', pants: '#1b2550', skin: '#f0c39d', accent: '#37e5ff', hat: 'cap', hatColor: '#37e5ff' };
  }

  function Bot(THREE, world, scene, opts) {
    opts = opts || {};
    this.THREE = THREE;
    this.world = world;
    this.scene = scene;

    this.id = 'bot' + (Bot._seq = (Bot._seq || 0) + 1);
    this.name = opts.name || U.pick(NAMES);

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
    this.moveInput = { x: 0, z: 0 };

    this.kills = 0;
    this.events = {};

    /* AI state */
    this.palette = opts.palette || defaultPalette();
    this.target = null;
    this.targetSeen = 0;
    this.reactTimer = 0;
    this.state = 'roam';
    this.waypoint = null;
    this.lootEntry = null;
    this.repathTimer = 0;
    this.strafeDir = Math.random() < 0.5 ? -1 : 1;
    this.strafeTimer = 0;
    this.skill = opts.skill != null ? opts.skill : U.rand(0.45, 0.9);
    this.thinkTimer = Math.random() * 0.4;
    this.jumpCooldown = 0;
    this._v = new THREE.Vector3();
    this._hiddenAt = 0;

    this.character = new BN.Character(THREE, this.palette, { shadows: false });
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

  /* --------------------------- owner surface ---------------------------- */
  Bot.prototype.eyePos = function (out) {
    return (out || new this.THREE.Vector3()).set(
      this.pos.x, this.pos.y + (this.crouch ? 1.15 : 1.45), this.pos.z
    );
  };

  /* Forward vector — the shared controller needs this to aim hitscan shots. */
  Bot.prototype.lookDir = function (out) {
    var v = out || new this.THREE.Vector3();
    var cp = Math.cos(this.pitch);
    return v.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);
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
    if (!this.alive || !(amount > 0)) return 0;
    var left = amount;
    if (this.shield > 0) {
      var absorbed = Math.min(this.shield, left);
      this.shield -= absorbed;
      left -= absorbed;
    }
    this.health -= left;
    this.emit('damage', amount, info);
    if (this.health <= 0) {
      this.health = 0;
      this.die(info);
      return amount;
    }
    /* being shot makes a bot turn and fight back */
    var from = info && (info.from || info.attacker || info.by);
    if (from && from !== this) {
      this.target = from;
      this.targetSeen = LOSE_SIGHT;
      this.state = 'engage';
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
    this.aiming = false;
    this.weapons.intentFire = false;
    this.character.setDead(true);
    this._hiddenAt = performance.now();
    this.emit('death', info || {});
  };

  Bot.prototype.syncWeaponModel = function () {
    var w = this.inventory.activeItem();
    if (w && w.kind === 'weapon') {
      var def = BN.WEAPONS[w.defId];
      if (def) {
        this.character.setWeapon(def.modelRef, this.palette.accent);
        return;
      }
    }
    this.character.setWeapon(null);
  };

  Bot.prototype.spawn = function (x, y, z, yaw) {
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw != null ? yaw : Math.random() * Math.PI * 2;
    this.pitch = 0;
    this.alive = true;
    this.control = true;
    this.health = this.maxHealth;
    this.shield = Math.random() < 0.45 ? 50 : 0;
    this.state = 'roam';
    this.target = null;
    this.targetSeen = 0;
    this.waypoint = null;
    this.lootEntry = null;
    this.reactTimer = 0;
    this._hiddenAt = 0;
    this.character.group.visible = true;
    this.character.setDead(false);
    this.character.group.position.copy(this.pos);
    this.character.group.rotation.set(0, this.yaw, 0);
    this.syncWeaponModel();
  };

  /* ------------------------------- senses ------------------------------- */
  Bot.prototype.canSee = function (other) {
    if (!other || other.alive === false || !other.pos) return false;
    var d = this.pos.distanceTo(other.pos);
    if (d > SIGHT) return false;
    var ex = this.pos.x, ey = this.pos.y + 1.45, ez = this.pos.z;
    return this.world.lineOfSight(ex, ey, ez, other.pos.x, other.pos.y + 1.4, other.pos.z);
  };

  Bot.prototype.nearestEnemy = function (others) {
    if (!others) return null;
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

  Bot.prototype.hasGun = function () {
    for (var i = 0; i < 5; i++) {
      var it = this.inventory.slots[i];
      if (it && it.kind === 'weapon') return true;
    }
    return false;
  };

  /* ------------------------------ steering ------------------------------ */
  Bot.prototype.chooseWaypoint = function (ctx) {
    /* unarmed bots run for the closest ground weapon */
    if (!this.hasGun() && ctx.loot && ctx.loot.items) {
      var best = null, bestD = Infinity;
      for (var j = 0; j < ctx.loot.items.length; j++) {
        var e = ctx.loot.items[j];
        if (!e || !e.item || e.item.kind !== 'weapon') continue;
        var d = this.pos.distanceTo(e.mesh.position);
        if (d < 55 && d < bestD) { bestD = d; best = e; }
      }
      if (best) {
        this.lootEntry = best;
        return { x: best.mesh.position.x, z: best.mesh.position.z };
      }
    }

    /* stay inside the incoming zone when the storm matters */
    var s = ctx.storm;
    if (s && s.active) {
      var outside = s.distanceOutside(this.pos.x, this.pos.z);
      if (outside > -14 || !s.inNextZone(this.pos.x, this.pos.z)) {
        var a = Math.random() * Math.PI * 2;
        var r = Math.random() * Math.max(1, s.next.r * 0.7);
        return { x: s.next.cx + Math.cos(a) * r, z: s.next.cz + Math.sin(a) * r };
      }
    }

    var half = BN.World.HALF - 24;
    return { x: U.rand(-half, half), z: U.rand(-half, half) };
  };

  Bot.prototype.stepToward = function (dt, tx, tz) {
    var dx = tx - this.pos.x, dz = tz - this.pos.z;
    var d = Math.hypot(dx, dz);
    if (d < 0.7) { this.waypoint = null; return false; }

    var want = Math.atan2(dx, dz);

    /* obstacle probe — slide around cover instead of grinding into it */
    var probe = 1.9;
    var px = this.pos.x + Math.sin(want) * probe;
    var pz = this.pos.z + Math.cos(want) * probe;
    var clear = this.world.lineOfSight(this.pos.x, this.pos.y + 1.1, this.pos.z, px, this.pos.y + 1.1, pz);
    if (!clear) {
      want += 0.95 * this.strafeDir;
      if (this.jumpCooldown <= 0 && Math.random() < 0.25) {
        this.wantJump = true;
        this.jumpCooldown = 1.2;
      }
    }

    var diff = ((want - this.yaw + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (diff < -Math.PI) diff += Math.PI * 2;
    this.yaw += U.clamp(diff, -6 * dt, 6 * dt);
    this.pitch = U.damp(this.pitch, 0, 6, dt);

    this.moveInput = { x: 0, z: 1 };
    this.sprinting = d > 8 && this.grounded;
    return true;
  };

  /* -------------------------------- update ------------------------------ */
  Bot.prototype.update = function (dt, ctx) {
    ctx = ctx || {};
    if (this.jumpCooldown > 0) this.jumpCooldown -= dt;

    if (!this.alive) {
      this.weapons.update(dt, ctx);   /* let stray shots finish resolving */
      this.character.group.position.copy(this.pos);
      this.character.update(dt, { speed: 0, grounded: true, aiming: false, crouch: false });
      if (this._hiddenAt > 0 && performance.now() - this._hiddenAt > 4000) {
        this.character.group.visible = false;
        this._hiddenAt = 0;
      }
      return;
    }

    var others = ctx.targets || ctx.players || [];

    /* --- perception at a modest rate, so 20 bots stay cheap --- */
    this.thinkTimer -= dt;
    if (this.thinkTimer <= 0) {
      var period = 0.19 + Math.random() * 0.12;
      this.thinkTimer = period;
      var seen = this.nearestEnemy(others);
      if (seen) {
        if (seen !== this.target) this.reactTimer = REACTION * (1.7 - this.skill);
        this.target = seen;
        this.targetSeen = LOSE_SIGHT;
      } else if (this.target) {
        this.targetSeen -= period;
        if (this.targetSeen <= 0 || this.target.alive === false) {
          this.target = null;
          this.state = 'roam';
          this.reactTimer = 0;
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
      this.chooseWeaponFor(dist);
      var def = this.weapons.def();

      /* aim, with an error that shrinks as skill rises */
      var ax = t.pos.x - this.pos.x;
      var ay = (t.pos.y + 1.05) - (this.pos.y + 1.45);
      var az = t.pos.z - this.pos.z;
      var horiz = Math.hypot(ax, az) || 1;
      var err = (1 - this.skill) * 0.1;
      var now = performance.now();
      var wantYaw = Math.atan2(ax, az) + Math.sin(now * 0.004 + this.pos.x) * err;
      var wantPitch = Math.atan2(ay, horiz) + Math.cos(now * 0.003 + this.pos.z) * err * 0.6;

      var yawDiff = ((wantYaw - this.yaw + Math.PI) % (Math.PI * 2)) - Math.PI;
      if (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
      var turnRate = 5 + this.skill * 7;
      this.yaw += U.clamp(yawDiff, -turnRate * dt, turnRate * dt);
      this.pitch = U.damp(this.pitch, U.clamp(wantPitch, -0.9, 0.8), 9, dt);

      var onTarget = Math.abs(yawDiff) < 0.2;

      /* combat movement: close distance, or strafe at range */
      if (dist > 34) {
        this.stepToward(dt, t.pos.x, t.pos.z);
      } else if (dist < 6) {
        this.moveInput = { x: 0, z: -1 };
        this.aiming = true;
      } else {
        this.strafeTimer -= dt;
        if (this.strafeTimer <= 0) {
          this.strafeTimer = 0.6 + Math.random();
          this.strafeDir *= -1;
        }
        this.moveInput = { x: this.strafeDir, z: Math.random() < 0.7 ? 0.35 : 0 };
        this.aiming = true;
      }

      this.reactTimer -= dt;
      if (onTarget && this.reactTimer <= 0 && def && dist < def.range * 1.15) {
        fireWanted = true;
      }

      var item = this.inventory.activeItem();
      if (item && item.kind === 'weapon' && item.mag <= 0) this.weapons.startReload();
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
        if (this.lootEntry && this.pos.distanceTo(this.lootEntry.mesh.position) < 2.0) {
          this.tryGrabLoot(ctx);
        }
      }
      if (this.health < 55 && this.inventory && Math.random() < 0.008) {
        this.heal(25);
      }
    }

    /* --- the ONE shared weapon controller, driven by bot intent --- */
    this.weapons.intentFire = !!fireWanted;
    this.weapons.update(dt, ctx);

    /* --- movement through shared capsule physics --- */
    var speed = this.crouch ? 2.3 : 4.6;
    if (this.sprinting) speed = 7.2;
    if (this.aiming) speed = Math.min(speed, 2.6);

    var fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    var rx = -Math.cos(this.yaw), rz = Math.sin(this.yaw);
    var dx = fx * this.moveInput.z + rx * this.moveInput.x;
    var dz = fz * this.moveInput.z + rz * this.moveInput.x;
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
    if (this.vel.y < -55) this.vel.y = -55;

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
      if (this.vel.y < 0) this.vel.y = 0;
    }

    var half = BN.World.HALF - 6;
    this.pos.x = U.clamp(this.pos.x, -half, half);
    this.pos.z = U.clamp(this.pos.z, -half, half);

    /* --- presentation --- */
    var planar = Math.hypot(this.vel.x, this.vel.z);
    this.character.group.position.copy(this.pos);
    this.character.group.rotation.y = this.yaw;
    this.character.update(dt, {
      speed: planar,
      grounded: this.grounded,
      aiming: this.aiming,
      crouch: this.crouch,
      recoil: this.weapons.recoilKick
    });
  };

  /* swap to the weapon that suits this distance best */
  Bot.prototype.chooseWeaponFor = function (dist) {
    var best = -1, bestScore = -1;
    for (var i = 0; i < 5; i++) {
      var it = this.inventory.slots[i];
      if (!it || it.kind !== 'weapon') continue;
      var d = BN.WEAPONS[it.defId];
      if (!d) continue;
      var score = 1;
      if (d.category === 'shotgun') score = dist < 12 ? 3 : dist > 30 ? 0.15 : 1.6;
      else if (d.category === 'sniper') score = dist > 30 ? 3 : 0.5;
      else if (d.category === 'assault') score = dist > 18 ? 2.4 : 1.6;
      else if (d.category === 'smg') score = dist < 25 ? 2.2 : 0.8;
      else if (d.category === 'pistol') score = 0.7;
      else if (d.category === 'special') score = 1.2;
      if (dist > d.range) score *= 0.2;
      if (score > bestScore) { bestScore = score; best = i; }
    }
    if (best >= 0 && best !== this.inventory.active) {
      if (this.inventory.setActive(best)) {
        this.weapons.reset();
        this.syncWeaponModel();
      }
    }
  };

  Bot.prototype.tryGrabLoot = function (ctx) {
    var e = this.lootEntry;
    this.lootEntry = null;
    this.waypoint = null;
    if (!e || !e.item || !ctx.loot) return;
    if (this.pos.distanceTo(e.mesh.position) > 2.4) return;
    ctx.loot.focus = e;
    var picked = ctx.loot.tryPickup(this);
    if (picked) {
      this.syncWeaponModel();
      this.weapons.reset();
    }
  };

  Bot.prototype.dispose = function () {
    if (this.character && this.character.group && this.character.group.parent) {
      this.character.group.parent.remove(this.character.group);
    }
  };

  /* ------------------------------ director ----------------------------- */
  function BotManager(THREE, world, scene, opts) {
    opts = opts || {};
    this.THREE = THREE;
    this.world = world;
    this.scene = scene;
    this.bots = [];
    this.maxBots = opts.count != null ? opts.count : 19;
  }
  BN.BotManager = BotManager;

  BotManager.prototype.spawnWave = function (playerPos) {
    var half = BN.World.HALF - 42;
    for (var i = 0; i < this.maxBots; i++) {
      var bot = new BN.Bot(this.THREE, this.world, this.scene, {
        skill: U.rand(0.4, 0.92)
      });

      /* land them away from the player's deployment area */
      var x = 0, z = 0, tries = 0;
      do {
        x = U.rand(-half, half);
        z = U.rand(-half, half);
        tries++;
      } while (tries < 24 && playerPos && Math.hypot(x - playerPos.x, z - playerPos.z) < 55);

      bot.spawn(x, this.world.heightAt(x, z) + 0.5, z);

      /* starting kit — some spawn empty so they have to loot */
      if (Math.random() < 0.72) {
        var item = BN.makeWeaponItem(U.pick(KIT));
        if (item) bot.inventory.add(item);
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
    for (var i = 0; i < this.bots.length; i++) this.bots[i].update(dt, ctx);
  };

  BotManager.prototype.clear = function () {
    for (var i = 0; i < this.bots.length; i++) this.bots[i].dispose();
    this.bots.length = 0;
  };
})();
