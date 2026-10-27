/* ==========================================================================
   BLOXNITE — combat, inventory and ground loot
   One weapon controller for every shooter (player and bots), so damage,
   fire rate, reload and spread behave identically everywhere.
   Weapon definitions come from js/data/defs.js; this file only simulates.
   ========================================================================== */
(function () {
  var BN = (window.BN = window.BN || {});
  var U = BN.util;

  var SLOT_COUNT = 5;
  var PICKUP_RANGE = 3.0;
  var LOOT_CAP = 90;

  /* ------------------------------ inventory ----------------------------- */
  function Inventory() {
    this.slots = [];
    for (var i = 0; i < SLOT_COUNT; i++) this.slots.push(null);
    /* reserve ammunition is a shared pool, not slot-based */
    this.ammo = { light: 0, medium: 0, heavy: 0, shells: 0 };
    this.active = 0;
    this.listeners = [];
  }
  Inventory.SLOT_COUNT = SLOT_COUNT;
  BN.Inventory = Inventory;

  Inventory.prototype.onChange = function (fn) { this.listeners.push(fn); return this; };
  Inventory.prototype.changed = function () {
    for (var i = 0; i < this.listeners.length; i++) this.listeners[i](this);
  };

  Inventory.prototype.activeItem = function () { return this.slots[this.active] || null; };
  Inventory.prototype.setActive = function (i) {
    if (i < 0 || i >= SLOT_COUNT) return false;
    if (!this.slots[i] || this.active === i) return false;
    this.active = i;
    this.changed();
    return true;
  };
  Inventory.prototype.cycle = function (dir) {
    var step = dir >= 0 ? 1 : -1;
    for (var n = 1; n <= SLOT_COUNT; n++) {
      var i = (((this.active + step * n) % SLOT_COUNT) + SLOT_COUNT) % SLOT_COUNT;
      if (this.slots[i]) { this.active = i; this.changed(); return true; }
    }
    return false;
  };
  Inventory.prototype.firstEmpty = function () {
    for (var i = 0; i < SLOT_COUNT; i++) if (!this.slots[i]) return i;
    return -1;
  };
  Inventory.prototype.weaponSlots = function () {
    var out = [];
    for (var i = 0; i < SLOT_COUNT; i++) {
      if (this.slots[i] && this.slots[i].kind === 'weapon') out.push(i);
    }
    return out;
  };

  /* Returns { ok, slot, replaced, leftover }. Callers drop `replaced` /
     `leftover` back on the ground so items are never silently destroyed. */
  Inventory.prototype.add = function (item) {
    if (!item) return { ok: false };

    if (item.kind === 'ammo') {
      var left = this.addAmmo(item.ammo, item.count || 0);
      this.changed();
      return { ok: true, leftover: left > 0 ? BN.makeAmmoItem(item.ammo, left) : null };
    }

    if (item.kind === 'consumable') {
      var cdef = BN.CONSUMABLES[item.defId];
      var max = (cdef && cdef.maxStack) || 1;
      for (var i = 0; i < SLOT_COUNT; i++) {
        var s = this.slots[i];
        if (s && s.kind === 'consumable' && s.defId === item.defId && s.count < max) {
          var move = Math.min(max - s.count, item.count || 1);
          s.count += move;
          var rem = (item.count || 1) - move;
          this.changed();
          return { ok: true, slot: i, leftover: rem > 0 ? BN.makeConsumableItem(item.defId, rem) : null };
        }
      }
    }

    var slot = this.firstEmpty();
    var replaced = null;
    if (slot < 0) {
      slot = this.active;
      replaced = this.slots[slot];
    }
    this.slots[slot] = item;
    if (!this.slots[this.active]) this.active = slot;
    this.changed();
    return { ok: true, slot: slot, replaced: replaced };
  };

  Inventory.prototype.addAmmo = function (type, count) {
    if (!type || typeof this.ammo[type] !== 'number') return count || 0;
    var cap = (BN.AMMO[type] || {}).max || 999;
    var before = this.ammo[type];
    this.ammo[type] = Math.min(cap, before + (count || 0));
    return Math.max(0, (count || 0) - (this.ammo[type] - before));
  };
  Inventory.prototype.takeAmmo = function (type, count) {
    var have = this.ammo[type] || 0;
    var take = Math.min(have, count);
    this.ammo[type] = have - take;
    return take;
  };

  Inventory.prototype.removeAt = function (i) {
    var it = this.slots[i] || null;
    if (!it) return null;
    this.slots[i] = null;
    if (this.active === i) {
      var next = this.firstEmpty();
      for (var n = 0; n < SLOT_COUNT; n++) {
        if (this.slots[n]) { this.active = n; break; }
      }
      if (next === SLOT_COUNT) this.active = 0;
    }
    this.changed();
    return it;
  };

  Inventory.prototype.countConsumable = function (defId) {
    var n = 0;
    for (var i = 0; i < SLOT_COUNT; i++) {
      var s = this.slots[i];
      if (s && s.kind === 'consumable' && (!defId || s.defId === defId)) n += s.count || 0;
    }
    return n;
  };

  Inventory.prototype.clear = function () {
    for (var i = 0; i < SLOT_COUNT; i++) this.slots[i] = null;
    this.ammo.light = this.ammo.medium = this.ammo.heavy = this.ammo.shells = 0;
    this.active = 0;
    this.changed();
  };

  /* --------------------------- weapon controller ------------------------ */
  /* ctx = { targets: [{ alive, pos, hitSpheres(), damage(amt, info) }] } */
  function WeaponController(owner) {
    this.owner = owner;
    this.inventory = owner.inventory || new Inventory();
    this.cooldown = 0;
    this.reloading = false;
    this.reloadTimer = 0;
    this.reloadTotal = 0;
    this.useTimer = 0;
    this.useTotal = 0;
    this.triggerPrev = false;
    this.recoilKick = 0;
    this.bloom = 0;
    this.projectiles = [];
    this.lastWeaponSlot = -1;
    this.shotCount = 0;
    this._v = null;
    this._eye = null;
    this._dir = null;
  }
  BN.WeaponController = WeaponController;

  WeaponController.prototype.def = function () {
    var it = this.inventory.activeItem();
    if (!it || it.kind !== 'weapon') return null;
    return BN.WEAPONS[it.defId] || null;
  };

  WeaponController.prototype.reset = function () {
    this.reloading = false;
    this.reloadTimer = 0;
    this.reloadTotal = 0;
    this.useTimer = 0;
    this.useTotal = 0;
    this.cooldown = 0;
    this.bloom = 0;
    this.triggerPrev = false;
    this.emit('switch', this.def());
  };

  WeaponController.prototype.emit = function (name, a, b) {
    if (this.owner && this.owner.emit) this.owner.emit(name, a, b);
  };

  WeaponController.prototype.vec = function () {
    if (!this._v) this._v = new this.owner.THREE.Vector3();
    return this._v;
  };

  /* ------------------------------- reloading ---------------------------- */
  WeaponController.prototype.canReload = function () {
    var it = this.inventory.activeItem();
    var d = this.def();
    if (!it || !d) return false;
    if (this.reloading || it.mag >= d.magazine) return false;
    return (this.inventory.ammo[d.ammoType] || 0) > 0;
  };

  WeaponController.prototype.startReload = function () {
    if (!this.canReload()) return false;
    var d = this.def();
    this.reloading = true;
    this.reloadTotal = this.reloadTimer = d.reloadDuration;
    this.useTimer = this.useTotal = 0;
    BN.Audio.sfx((d.soundRef && d.soundRef.reload) || 'magReload');
    this.emit('reloadStart', d);
    return true;
  };

  WeaponController.prototype.finishReload = function () {
    var it = this.inventory.activeItem();
    var d = this.def();
    this.reloading = false;
    this.reloadTimer = 0;
    if (!it || !d) return;
    var need = d.magazine - it.mag;
    var got = this.inventory.takeAmmo(d.ammoType, need);
    it.mag += got;
    BN.Audio.sfx('reloadDone');
    this.emit('reloadEnd', d);
  };

  /* ------------------------------- switching ---------------------------- */
  WeaponController.prototype.quickSwap = function () {
    var slots = this.inventory.weaponSlots();
    if (slots.length < 2) return false;
    var target = -1;
    for (var i = 0; i < slots.length; i++) {
      if (slots[i] !== this.inventory.active) { target = slots[i]; break; }
    }
    if (target < 0) return false;
    var prev = this.inventory.active;
    if (!this.inventory.setActive(target)) return false;
    this.lastWeaponSlot = prev;
    if (this.owner.syncWeaponModel) this.owner.syncWeaponModel();
    return true;
  };

  /* -------------------------------- firing ------------------------------ */
  function spreadDir(dir, degrees, out) {
    if (degrees <= 0) { out.copy(dir); return out; }
    /* build an orthonormal basis around dir, then jitter inside a cone */
    var up = Math.abs(dir.y) > 0.94 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
    var rx = dir.y * up.z - dir.z * up.y;
    var ry = dir.z * up.x - dir.x * up.z;
    var rz = dir.x * up.y - dir.y * up.x;
    var rl = Math.hypot(rx, ry, rz) || 1;
    rx /= rl; ry /= rl; rz /= rl;
    var ux = dir.y * rz - dir.z * ry;
    var uy = dir.z * rx - dir.x * rz;
    var uz = dir.x * ry - dir.y * rx;

    var rad = degrees * Math.PI / 180;
    var a = Math.random() * Math.PI * 2;
    var m = Math.tan(rad) * Math.sqrt(Math.random());
    var ox = Math.cos(a) * m, oy = Math.sin(a) * m;
    out.set(dir.x + rx * ox + ux * oy, dir.y + ry * ox + uy * oy, dir.z + rz * ox + uz * oy);
    return out.normalize();
  }

  function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
    var lx = cx - ox, ly = cy - oy, lz = cz - oz;
    var tca = lx * dx + ly * dy + lz * dz;
    if (tca < 0) return -1;
    var d2 = lx * lx + ly * ly + lz * lz - tca * tca;
    var r2 = r * r;
    if (d2 > r2) return -1;
    var thc = Math.sqrt(r2 - d2);
    var t0 = tca - thc;
    if (t0 >= 0) return t0;
    return tca + thc >= 0 ? 0.001 : -1;
  }

  WeaponController.prototype.fire = function (ctx) {
    var owner = this.owner;
    var it = this.inventory.activeItem();
    var d = this.def();
    if (!it || !d) return false;
    if (this.reloading || this.cooldown > 0) return false;

    if (it.mag <= 0) {
      BN.Audio.sfx('empty');
      this.emit('empty', d);
      if (this.canReload()) this.startReload();
      return false;
    }

    var THREE = owner.THREE;
    var eye = (this._eye = this._eye || new THREE.Vector3());
    var dir = (this._dir = this._dir || new THREE.Vector3());
    if (owner.eyePos) owner.eyePos(eye); else eye.copy(owner.pos).setY(owner.pos.y + 1.45);
    if (owner.lookDir) owner.lookDir(dir); else dir.set(0, 0, 1);

    it.mag -= 1;
    this.cooldown = 1 / Math.max(0.05, d.fireRate);
    this.shotCount++;
    this.emit('fire', d);

    /* audio + muzzle flash at the visible barrel */
    BN.Audio.sfx((d.soundRef && d.soundRef.fire) || 'rifle');
    var muzzle = null;
    if (owner.character && owner.character.muzzleWorld) muzzle = owner.character.muzzleWorld();
    if (BN.FX && muzzle) BN.FX.muzzle(muzzle, d.rarityColor);

    /* spread grows while firing, decays in update() */
    var spread = d.spread + this.bloom;
    if (owner.aiming) spread *= 0.45;
    if (owner.crouch) spread *= 0.8;
    if (!owner.grounded) spread *= 1.45;

    var pelletDir = new THREE.Vector3();
    for (var p = 0; p < d.pellets; p++) {
      spreadDir(dir, spread, pelletDir);
      this.castShot(eye, pelletDir, d, muzzle, ctx);
    }

    /* recoil: camera kick + visible model kick */
    if (owner.recoilPitch !== undefined) {
      var k = d.recoil * 0.0045;
      owner.recoilPitch += k;
      owner.recoilYaw += (Math.random() - 0.5) * d.recoil * 0.0022;
    }
    this.recoilKick = Math.min(1.4, this.recoilKick + d.recoil * 0.09);
    this.bloom = Math.min(d.spread * 1.6, this.bloom + d.spread * 0.28);

    /* projectile weapons spawn a travelling shell instead of a hitscan */
    if (d.projectiles) {
      this.projectiles.push({
        pos: eye.clone(),
        dir: dir.clone(),
        speed: 62,
        life: 3.2,
        def: d,
        color: d.rarityColor,
        owner: owner
      });
    }

    if (it.mag <= 0 && this.canReload()) this.startReload();
    return true;
  };

  WeaponController.prototype.castShot = function (origin, dir, d, muzzle, ctx) {
    var owner = this.owner;
    var world = owner.world;
    var maxT = d.range;

    var wallT = maxT, wallHit = null;
    if (world && world.raycast) {
      var wh = world.raycast(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, maxT, false);
      if (wh) { wallT = wh.t; wallHit = wh; }
    }

    var targets = (ctx && ctx.targets) || [];
    var bestT = wallT, bestTarget = null, bestPart = null;

    for (var i = 0; i < targets.length; i++) {
      var t = targets[i];
      if (!t || t === owner || t.alive === false) continue;
      var spheres = t.hitSpheres ? t.hitSpheres() : null;
      if (!spheres) continue;
      for (var s = 0; s < spheres.length; s++) {
        var sp = spheres[s];
        var ht = raySphere(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, sp.x, sp.y, sp.z, sp.r);
        if (ht >= 0 && ht < bestT) { bestT = ht; bestTarget = t; bestPart = sp.part; }
      }
    }

    var endX, endY, endZ;
    if (bestTarget) {
      endX = origin.x + dir.x * bestT;
      endY = origin.y + dir.y * bestT;
      endZ = origin.z + dir.z * bestT;

      var base = d.damageAt(bestT);
      var mul = bestPart === 'head' ? 2.0 : bestPart === 'legs' ? 0.75 : 1.0;
      var amount = Math.round(base * mul);
      var info = {
        by: owner.id || (owner.isBot && owner.isBot() ? 'bot' : 'player'),
        attacker: owner,
        weapon: d.id,
        weaponName: d.name,
        rarityColor: d.rarityColor,
        part: bestPart,
        headshot: bestPart === 'head',
        point: { x: endX, y: endY, z: endZ }
      };
      var isBotTarget = bestTarget.isBot && bestTarget.isBot();
      if (!isBotTarget || owner.isBot && owner.isBot()) {
        /* bots shooting bots only matters for the remaining count */
      }
      var dealt = bestTarget.damage ? bestTarget.damage(amount, info) : 0;
      if (BN.FX) BN.FX.impact(endX, endY, endZ, bestPart === 'head' ? '#ffd24a' : '#ff6b6b', 6);
      if (owner.emit) {
        owner.emit('hit', {
          target: bestTarget, part: bestPart, damage: dealt,
          headshot: bestPart === 'head', killed: bestTarget.alive === false,
          point: info.point, weapon: d
        });
      }
      if (!isBotTarget) BN.Audio.sfx(bestPart === 'head' ? 'headshot' : 'hit');
    } else if (wallHit) {
      endX = wallHit.x; endY = wallHit.y; endZ = wallHit.z;
      if (BN.FX) BN.FX.impact(endX, endY, endZ, wallHit.type === 'water' ? '#8fd8ff' : '#cfd8e8', 4);
    } else {
      endX = origin.x + dir.x * maxT;
      endY = origin.y + dir.y * maxT;
      endZ = origin.z + dir.z * maxT;
    }

    if (BN.FX) {
      var from = muzzle || origin;
      BN.FX.tracer(from, { x: endX, y: endY, z: endZ }, d.rarityColor);
    }
  };

  /* ------------------------------ projectiles --------------------------- */
  WeaponController.prototype.updateProjectiles = function (dt, ctx) {
    var THREE = this.owner.THREE;
    var world = this.owner.world;
    var list = this.projectiles;
    for (var i = list.length - 1; i >= 0; i--) {
      var p = list[i];
      var step = p.speed * dt;
      var ox = p.pos.x, oy = p.pos.y, oz = p.pos.z;

      var travel = step;
      if (world && world.raycast) {
        var wh = world.raycast(ox, oy, oz, p.dir.x, p.dir.y, p.dir.z, travel, false);
        if (wh) travel = Math.max(0, wh.t);
      }

      var nx = ox + p.dir.x * travel;
      var ny = oy + p.dir.y * travel;
      var nz = oz + p.dir.z * travel;

      var hitTarget = null;
      var targets = (ctx && ctx.targets) || [];
      for (var k = 0; k < targets.length; k++) {
        var t = targets[k];
        if (!t || t === p.owner || t.alive === false) continue;
        var spheres = t.hitSpheres ? t.hitSpheres() : null;
        if (!spheres) continue;
        for (var s = 0; s < spheres.length; s++) {
          var sp = spheres[s];
          var ht = raySphere(ox, oy, oz, p.dir.x, p.dir.y, p.dir.z, sp.x, sp.y, sp.z, sp.r + 0.25);
          if (ht >= 0 && ht <= travel) { hitTarget = t; travel = ht; break; }
        }
        if (hitTarget) break;
      }

      p.pos.set(ox + p.dir.x * travel, oy + p.dir.y * travel, oz + p.dir.z * travel);
      p.life -= dt;

      var impacted = !!hitTarget || travel < step - 0.001 || p.life <= 0 || p.pos.y < -4;
      if (impacted) {
        this.explode(p.pos, p.def, ctx, p.owner, hitTarget);
        list.splice(i, 1);
      }
    }
  };

  WeaponController.prototype.explode = function (pos, d, ctx, owner, directTarget) {
    BN.Audio.sfx('explosion');
    if (BN.FX) BN.FX.impact(pos.x, pos.y, pos.z, '#ffb020', 14);

    var targets = (ctx && ctx.targets) || [];
    var radius = d.splash || 5;
    for (var i = 0; i < targets.length; i++) {
      var t = targets[i];
      if (!t || t.alive === false) continue;
      var tp = t.pos || { x: 0, y: 0, z: 0 };
      var cx = tp.x, cy = tp.y + 1.0, cz = tp.z;
      var dist = Math.hypot(cx - pos.x, cy - pos.y, cz - pos.z);
      if (dist > radius) continue;
      var falloff = 1 - dist / radius;
      var amount = Math.round((d.splashDamage || 0) * falloff);
      if (t === directTarget) amount += Math.round(d.damage * 0.35);
      if (amount <= 0) continue;
      if (t.damage) {
        t.damage(amount, {
          by: 'explosion',
          attacker: owner,
          weapon: d.id,
          weaponName: d.name,
          part: 'body',
          splash: true
        });
        if (owner.emit) {
          owner.emit('hit', {
            target: t, part: 'body', damage: amount, headshot: false,
            killed: t.alive === false, point: { x: cx, y: cy, z: cz }, weapon: d, splash: true
          });
        }
      }
    }
  };

  /* ------------------------------ consumables --------------------------- */
  WeaponController.prototype.updateConsumable = function (dt, item, def) {
    var owner = this.owner;
    if (owner.health >= owner.maxHealth && def.category === 'heal') { this.useTimer = 0; return; }
    if (owner.shield >= owner.maxShield && def.category === 'shield') { this.useTimer = 0; return; }
    var cdef = BN.CONSUMABLES[item.defId];
    if (!cdef) return;

    if (this.useTimer <= 0) {
      this.useTotal = this.useTimer = cdef.useTime || 1;
      BN.Audio.sfx('uiClick');
    }
    this.useTimer -= dt;
    if (this.useTimer > 0) return;

    if (cdef.category === 'heal' && owner.heal) owner.heal(cdef.heal);
    if (cdef.category === 'shield' && owner.addShield) owner.addShield(cdef.shield);
    BN.Audio.sfx('pickup');
    if (owner.emit) owner.emit('consumed', cdef);

    item.count -= 1;
    var idx = this.inventory.slots.indexOf(item);
    if (item.count <= 0 && idx >= 0) this.inventory.removeAt(idx);
    else this.inventory.changed();
    this.useTimer = this.useTotal = 0;
  };

  /* -------------------------------- update ------------------------------ */
  WeaponController.prototype.update = function (dt, ctx) {
    if (this.cooldown > 0) this.cooldown = Math.max(0, this.cooldown - dt);
    this.recoilKick = U.damp(this.recoilKick, 0, 9, dt);
    this.bloom = U.damp(this.bloom, 0, 3.2, dt);
    this.updateProjectiles(dt, ctx);

    var owner = this.owner;
    var item = this.inventory.activeItem();

    if (this.reloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) this.finishReload();
      /* reloading cancels consumable use and blocks firing */
      this.triggerPrev = true;
      return;
    }

    if (!item) { this.useTimer = 0; this.triggerPrev = false; return; }

    var left = BN.Input.mouse.left;
    var blocked = BN.Input.isBlocked && BN.Input.isBlocked();
    var canAct = owner.alive !== false && owner.control !== false && !blocked;

    if (item.kind === 'consumable') {
      var cdef = BN.CONSUMABLES[item.defId];
      if (left && canAct && cdef) this.updateConsumable(dt, item, cdef);
      else { this.useTimer = 0; }
      this.triggerPrev = left;
      return;
    }

    if (item.kind !== 'weapon') { this.triggerPrev = left; return; }

    var d = this.def();
    if (!d) return;

    var wantsFire = false;
    if (canAct) {
      if (d.fireMode === 'auto') wantsFire = left;
      else wantsFire = left && !this.triggerPrev;   /* semi / pump / single */
    }
    if (wantsFire) this.fire(ctx);
    this.triggerPrev = left;
  };

  /* ------------------------------ ground loot --------------------------- */
  function LootManager(THREE, world, scene) {
    this.THREE = THREE;
    this.world = world;
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'loot';
    scene.add(this.group);
    this.items = [];
    this.focus = null;
    this._t = 0;
    this._geoCache = {};
  }
  BN.LootManager = LootManager;

  LootManager.prototype.geo = function (item) {
    var key = item.kind === 'weapon' ? 'w' : item.kind === 'consumable' ? 'c' : 'a';
    if (!this._geoCache[key]) {
      var s = key === 'w' ? 0.55 : key === 'c' ? 0.4 : 0.34;
      this._geoCache[key] = new this.THREE.BoxGeometry(s, s * 0.55, s * 1.5);
    }
    return this._geoCache[key];
  };

  LootManager.prototype.canSpawn = function () { return this.items.length < LOOT_CAP; };

  LootManager.prototype.spawn = function (item, x, y, z, opts) {
    if (!item || !this.canSpawn()) return null;
    var THREE = this.THREE;
    var rarity = BN.itemRarity(item);
    var color = rarity.color;

    var mat = new THREE.MeshLambertMaterial({
      color: new THREE.Color(color),
      emissive: new THREE.Color(color),
      emissiveIntensity: 0.45
    });
    var mesh = new THREE.Mesh(this.geo(item), mat);
    mesh.position.set(x, y + 0.32, z);
    mesh.rotation.y = Math.random() * Math.PI * 2;
    mesh.castShadow = false;

    var halo = new THREE.Sprite(new THREE.SpriteMaterial({
      color: new THREE.Color(color), transparent: true, opacity: 0.22,
      depthWrite: false, fog: false
    }));
    halo.scale.set(1.5, 1.5, 1.5);
    halo.position.y = 0.05;
    mesh.add(halo);

    this.group.add(mesh);

    var entry = {
      item: item, mesh: mesh, halo: halo,
      pos: { x: x, y: y + 0.32, z: z },
      baseY: y + 0.32,
      spin: (Math.random() > 0.5 ? 1 : -1) * (0.6 + Math.random() * 0.5),
      phase: Math.random() * Math.PI * 2,
      droppable: !opts || opts.droppable !== false
    };
    this.items.push(entry);
    return entry;
  };

  LootManager.prototype.remove = function (entry) {
    var i = this.items.indexOf(entry);
    if (i < 0) return;
    this.items.splice(i, 1);
    if (entry.mesh.parent) entry.mesh.parent.remove(entry.mesh);
    if (entry.mesh.material) entry.mesh.material.dispose();
    if (entry.halo && entry.halo.material) entry.halo.material.dispose();
    if (this.focus === entry) this.focus = null;
  };

  LootManager.prototype.clear = function () {
    while (this.items.length) this.remove(this.items[0]);
    this.focus = null;
  };

  /* Populate from the world's generated loot spots. */
  LootManager.prototype.populate = function (spots) {
    var self = this;
    var list = (spots || []).slice(0);
    /* shuffle so the cap samples the whole island */
    for (var i = list.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = list[i]; list[i] = list[j]; list[j] = tmp;
    }
    var budget = Math.min(list.length, LOOT_CAP);

    for (var n = 0; n < budget; n++) {
      var s = list[n];
      var roll = Math.random();
      var item = null;

      if (roll < 0.58) {
        item = BN.makeWeaponItem(BN.randomWeaponId());
      } else if (roll < 0.82) {
        var c = Math.random() < 0.4 ? 'medkit' : (Math.random() < 0.5 ? 'shieldpot' : 'minishield');
        item = BN.makeConsumableItem(c, 1);
      } else {
        var types = ['light', 'medium', 'heavy', 'shells'];
        var at = types[Math.floor(Math.random() * types.length)];
        item = BN.makeAmmoItem(at, at === 'shells' ? 8 : 20);
      }
      if (!item) continue;

      var y = (s.y || 0) - 0.2;
      var gy = self.world && self.world.groundHeightAt
        ? self.world.groundHeightAt(s.x, s.z, y + 6)
        : y;
      self.spawn(item, s.x, gy, s.z);
    }
  };

  /* Nearest interactive loot, used for the pick-up prompt. */
  LootManager.prototype.update = function (dt, player) {
    this._t += dt;
    for (var i = 0; i < this.items.length; i++) {
      var e = this.items[i];
      e.mesh.rotation.y += e.spin * dt;
      e.mesh.position.y = e.baseY + Math.sin(this._t * 2 + e.phase) * 0.09;
      if (e.halo) e.halo.material.opacity = 0.16 + Math.sin(this._t * 2.4 + e.phase) * 0.07;
    }

    this.focus = null;
    if (!player || player.alive === false) return;
    var px = player.pos.x, py = player.pos.y, pz = player.pos.z;
    var best = PICKUP_RANGE, bestEntry = null;
    for (var k = 0; k < this.items.length; k++) {
      var it = this.items[k];
      var dx = it.pos.x - px, dy = it.pos.y - (py + 0.9), dz = it.pos.z - pz;
      var dist = Math.hypot(dx, dy * 0.6, dz);
      if (dist < best) { best = dist; bestEntry = it; }
    }
    this.focus = bestEntry;
  };

  LootManager.prototype.focusInfo = function () {
    if (!this.focus) return null;
    var item = this.focus.item;
    var rarity = BN.itemRarity(item);
    var def = item.kind === 'weapon' ? BN.WEAPONS[item.defId] : null;
    var cdef = item.kind === 'consumable' ? BN.CONSUMABLES[item.defId] : null;
    var adef = item.kind === 'ammo' ? BN.AMMO[item.ammo] : null;
    var detail = '';
    if (def) detail = (BN.AMMO[def.ammoType] || {}).name || '';
    else if (cdef) detail = 'x' + (item.count || 1);
    else if (adef) detail = (item.count || 0) + ' rounds';
    return {
      item: item,
      entry: this.focus,
      label: BN.itemLabel(item),
      rarity: rarity.name,
      color: rarity.color,
      detail: detail,
      control: 'E'
    };
  };

  /* Move the focused item into the inventory; leftovers stay on the ground. */
  LootManager.prototype.tryPickup = function (player) {
    if (!this.focus || !player || !player.inventory) return null;
    var entry = this.focus;
    var inv = player.inventory;
    var res = inv.add(entry.item);

    if (!res.ok) return null;

    if (res.replaced) {
      /* swap: the old item lands where the new one was */
      this.spawn(res.replaced, entry.pos.x + 0.5, entry.pos.y - 0.32, entry.pos.z, { droppable: true });
    }
    if (res.leftover) {
      entry.item = res.leftover;
      BN.Audio.sfx('pickup');
      if (player.emit) player.emit('pickup', res.leftover);
      return res.leftover;
    }

    this.remove(entry);
    var rarity = BN.itemRarity(entry.item);
    BN.Audio.sfx(rarity.order >= 3 ? 'pickupRare' : 'pickup');
    if (BN.FX) BN.FX.pickup(entry.pos, rarity.color);
    if (player.emit) player.emit('pickup', entry.item);

    if (entry.item.kind === 'weapon' && player.syncWeaponModel) player.syncWeaponModel();
    return entry.item;
  };

  LootManager.prototype.dropFrom = function (player, slotIndex) {
    if (!player || !player.inventory) return null;
    var item = player.inventory.slots[slotIndex];
    if (!item) return null;
    var away = 0.9;
    var dx = Math.sin(player.yaw) * away;
    var dz = Math.cos(player.yaw) * away;
    var x = player.pos.x + dx, z = player.pos.z + dz;
    var y = this.world && this.world.groundHeightAt
      ? this.world.groundHeightAt(x, z, player.pos.y + 2)
      : player.pos.y;
    var removed = player.inventory.removeAt(slotIndex);
    if (!removed) return null;
    this.spawn(removed, x, y, z, { droppable: true });
    BN.Audio.sfx('drop');
    if (player.syncWeaponModel) player.syncWeaponModel();
    return removed;
  };
})();
