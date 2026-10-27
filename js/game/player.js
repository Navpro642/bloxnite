/* ==========================================================================
   BLOXNITE — player controller (single source of movement truth)
   Owns: collision resolution shared with bots, third-person camera with
   spring-arm collision, movement acceleration, sprint/jump/crouch/aim,
   health + shield, and the deployment (skydive) descent.
   ========================================================================== */
(function () {
  var BN = (window.BN = window.BN || {});
  var U = BN.util;

  /* ====================== shared capsule physics ========================= */
  var Physics = (BN.Physics = {});

  Physics.RADIUS = 0.42;
  Physics.HEIGHT = 1.8;
  Physics.STEP = 0.45;
  Physics.GRAVITY = 22;

  /* push a vertical capsule out of the AABBs it overlaps */
  Physics.resolve = function (world, pos, radius, height) {
    var near = world.boxesNear(pos.x, pos.z, radius + 0.02);
    for (var i = 0; i < near.length; i++) {
      var b = near[i];
      if (pos.y + height <= b.minY + 0.06) continue;      // box is above us
      if (pos.y >= b.maxY - 0.04) continue;               // we stand on it
      if (b.maxY - pos.y <= Physics.STEP) continue;        // low enough to step onto
      var cx = U.clamp(pos.x, b.minX, b.maxX);
      var cz = U.clamp(pos.z, b.minZ, b.maxZ);
      var ox = pos.x - cx, oz = pos.z - cz;
      var d2 = ox * ox + oz * oz;
      if (d2 > radius * radius) continue;
      if (d2 < 1e-6) {
        var px = Math.min(pos.x - b.minX, b.maxX - pos.x);
        var pz = Math.min(pos.z - b.minZ, b.maxZ - pos.z);
        if (px < pz) pos.x = (pos.x - b.minX < b.maxX - pos.x) ? b.minX - radius : b.maxX + radius;
        else pos.z = (pos.z - b.minZ < b.maxZ - pos.z) ? b.minZ - radius : b.maxZ + radius;
      } else {
        var d = Math.sqrt(d2);
        var push = (radius - d) / d;
        pos.x += ox * push;
        pos.z += oz * push;
      }
    }
    return pos;
  };

  /* horizontal sweep, sub-stepped so we cannot tunnel through thin walls */
  Physics.moveXZ = function (world, pos, dx, dz, radius, height) {
    var dist = Math.hypot(dx, dz);
    if (dist < 1e-5) return;
    var steps = Math.min(5, Math.max(1, Math.ceil(dist / 0.22)));
    for (var i = 0; i < steps; i++) {
      pos.x += dx / steps;
      pos.z += dz / steps;
      Physics.resolve(world, pos, radius, height);
    }
  };

  /* walk a bot/player toward a world point; returns true when arrived */
  Physics.steer = function (world, pos, dirX, dirZ, radius, height, dt, speed) {
    Physics.moveXZ(world, pos, dirX * speed * dt, dirZ * speed * dt, radius, height);
  };

  /* ============================== player ================================= */
  var Player = (BN.Player = function (THREE, world, scene, opts) {
    opts = opts || {};
    this.THREE = THREE;
    this.world = world;
    this.scene = scene;

    this.pos = new THREE.Vector3(0, 60, 0);
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.recoilPitch = 0;
    this.recoilYaw = 0;

    this.radius = Physics.RADIUS;
    this.height = Physics.HEIGHT;

    this.maxHealth = 100;
    this.maxShield = 100;
    this.health = 100;
    this.shield = 0;

    this.alive = true;
    this.control = true;
    this.grounded = false;
    this.aiming = false;
    this.crouch = false;
    this.sprinting = false;
    this.wantJump = false;

    this.deploying = false;    // true while skydiving
    this.glider = false;
    this.speedCap = 0;

    this.fovBase = opts.fov || 75;
    this.sens = opts.sensitivity || 1;
    this.stepAccum = 0;
    this.events = {};

    this.character = new BN.Character(THREE, opts.palette || null, {
      shadows: opts.shadows !== false
    });
    this.character.group.visible = false;
    scene.add(this.character.group);

    this.camera = new THREE.PerspectiveCamera(this.fovBase, 16 / 9, 0.06, 1400);
    this.camPos = new THREE.Vector3(0, 62, -7);
    this.tmpPivot = new THREE.Vector3();
    this.tmpFwd = new THREE.Vector3();
    this.tmpRight = new THREE.Vector3();
    this.tmpDesired = new THREE.Vector3();

    this.inventory = new BN.Inventory();
    this.weapons = new BN.WeaponController(this);
  });

  Player.prototype.on = function (name, fn) {
    (this.events[name] = this.events[name] || []).push(fn);
    return this;
  };
  Player.prototype.emit = function (name, a, b) {
    var list = this.events[name];
    if (!list) return;
    for (var i = 0; i < list.length; i++) list[i](a, b);
  };

  Player.prototype.spawn = function (x, y, z) {
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    this.grounded = false;
    this.alive = true;
    this.health = this.maxHealth;
    this.shield = 0;
    this.character.group.visible = true;
    this.character.setDead(false);
    this.character.group.rotation.x = 0;
    this.camPos.set(x, y + 3, z - 7);
  };

  Player.prototype.setLoadoutPalette = function (palette) {
    this.character.setPalette(palette);
    var w = this.inventory.activeItem();
    if (w && w.kind === 'weapon') {
      var def = BN.WEAPONS[w.defId];
      this.character.setWeapon(def.modelRef, palette.wrap || palette.accent);
    }
  };

  /* ------------------------------ input -------------------------------- */
  Player.prototype.readLook = function () {
    if (!this.alive || !this.control) return;
    /* Bots write this.intent.lookX/lookY instead of using the mouse. One
       look path, two intent sources — no second camera/rotation controller. */
    if (this.intent) {
      this.yaw -= this.intent.lookX;
      this.pitch -= this.intent.lookY;
      this.intent.lookX = 0;
      this.intent.lookY = 0;
      this.pitch = U.clamp(this.pitch, -1.16, 1.05);
      return;
    }
    if (!BN.Input.isLocked() || BN.Input.isBlocked()) return;
    var m = BN.Input.mouse;
    var k = 0.0021 * this.sens;
    this.yaw -= m.dx * k;
    this.pitch -= m.dy * k;
    if (this.yaw > Math.PI * 4 || this.yaw < -Math.PI * 4) this.yaw = this.yaw % (Math.PI * 2);
    this.pitch = U.clamp(this.pitch, -1.16, 1.05);
  };

  Player.prototype.readActions = function () {
    if (!this.alive || !this.control) {
      this.wantJump = false;
      return;
    }
    /* Bot intent: same fields the keyboard path produces, so movement,
       jump and aiming all flow through this one controller. */
    if (this.intent) {
      var it = this.intent;
      this.wantJump = !!it.jump;
      this.crouch = !!it.crouch;
      this.sprinting = !!it.sprint;
      this.aiming = !!it.aim && !it.sprint;
      it.jump = false;
      return;
    }
    var I = BN.Input;
    this.wantJump = I.down('Space');
    this.crouch = I.down('ControlLeft') || I.down('KeyC');
    this.sprinting = I.down('ShiftLeft') || I.down('ShiftRight');
    this.aiming = I.mouse.right && !this.sprinting;

    /* inventory selection: 1-5 + wheel */
    for (var n = 0; n < 5; n++) {
      if (I.pressed('Digit' + (n + 1))) this.selectSlot(n);
    }
    if (I.mouse.wheel !== 0 && !I.isBlocked()) this.cycleSlot(I.mouse.wheel > 0 ? 1 : -1);
    if (I.pressed('KeyR')) this.weapons.startReload();
    if (I.pressed('KeyQ')) this.weapons.quickSwap();
  };

  Player.prototype.selectSlot = function (i) {
    if (!this.inventory.setActive(i)) return;
    this.syncWeaponModel();
    BN.Audio.sfx('uiClick');
  };

  Player.prototype.cycleSlot = function (dir) {
    this.inventory.cycle(dir);
    this.syncWeaponModel();
    BN.Audio.sfx('uiHover');
  };

  Player.prototype.syncWeaponModel = function () {
    var item = this.inventory.activeItem();
    var pal = this.character.palette || {};
    if (item && item.kind === 'weapon') {
      var def = BN.WEAPONS[item.defId];
      this.character.setWeapon(def.modelRef, pal.wrap || pal.accent);
    } else {
      this.character.setWeapon(null);
    }
    this.weapons.reset();
  };

  /* ------------------------------ update ------------------------------- */
  Player.prototype.update = function (dt, ctx) {
    this.readLook();
    this.readActions();

    var I = BN.Input;
    var ax = { x: 0, z: 0 };
    if (this.alive && this.control) ax = I.axis();

    /* speed model */
    var speed = this.crouch ? 2.3 : 4.6;
    if (this.sprinting && ax.z > 0.15 && !this.aiming) speed = 7.2;
    if (this.aiming) speed = Math.min(speed, 2.6);
    if (!this.grounded) speed *= 0.94;
    var surf = this.world.surfaceType(this.pos.x, this.pos.z);
    if (surf === 'water') speed *= 0.55;
    else if (surf === 'road') speed *= 1.04;

    var fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    var rx = -Math.cos(this.yaw), rz = Math.sin(this.yaw);
    var dx = fx * ax.z + rx * ax.x;
    var dz = fz * ax.z + rz * ax.x;
    var len = Math.hypot(dx, dz);
    if (len > 0.0001) { dx /= len; dz /= len; }

    var accel = this.grounded ? (len > 0.0001 ? 13 : 12) : 2.6;
    this.vel.x = U.damp(this.vel.x, dx * speed, accel, dt);
    this.vel.z = U.damp(this.vel.z, dz * speed, accel, dt);

    /* jump + gravity */
    if (this.wantJump && this.grounded && this.alive && this.control) {
      this.vel.y = 8.1;
      this.grounded = false;
      BN.Audio.sfx('jump');
    }
    if (this.deploying) {
      this.vel.y -= (this.glider ? 4 : 13) * dt;
      if (!this.glider && this.pos.y - this.world.groundHeightAt(this.pos.x, this.pos.z, this.pos.y) < 26) {
        this.glider = true;
        this.emit('glider');
        BN.Audio.sfx('uiBack');
      }
      if (this.glider) this.vel.y = Math.max(this.vel.y, -6.5);
      else this.vel.y = Math.max(this.vel.y, -34);
    } else {
      this.vel.y -= Physics.GRAVITY * dt;
      this.vel.y = Math.max(this.vel.y, -55);
    }

    /* integrate horizontal with collision, then vertical */
    Physics.moveXZ(this.world, this.pos, this.vel.x * dt, this.vel.z * dt, this.radius, this.height);
    this.pos.y += this.vel.y * dt;

    var g = this.world.groundHeightAt(this.pos.x, this.pos.z, this.pos.y);
    var wasGrounded = this.grounded;
    if (this.pos.y <= g + 0.02) {
      if (!wasGrounded && this.vel.y < -7) {
        BN.Audio.sfx('land');
        this.emit('land', -this.vel.y);
      }
      this.pos.y = g;
      this.vel.y = 0;
      this.grounded = true;
      if (this.deploying) {
        this.deploying = false;
        this.glider = false;
        this.emit('landed');
      }
    } else if (wasGrounded && this.vel.y <= 0 && this.pos.y - g < 0.55) {
      this.pos.y = g;
      this.vel.y = 0;
      this.grounded = true;
    } else {
      this.grounded = false;
    }

    /* buoyancy so deep water is passable but slow */
    if (this.pos.y < -0.95) {
      this.pos.y = U.damp(this.pos.y, -0.95, 6, dt);
      this.vel.y = Math.max(this.vel.y, 0);
    }

    /* keep inside the island bounds */
    var half = BN.World.HALF - 6;
    this.pos.x = U.clamp(this.pos.x, -half, half);
    this.pos.z = U.clamp(this.pos.z, -half, half);

    /* recoil recovery */
    this.recoilPitch = U.damp(this.recoilPitch, 0, 7, dt);
    this.recoilYaw = U.damp(this.recoilYaw, 0, 7, dt);

    /* footsteps */
    var planar = Math.hypot(this.vel.x, this.vel.z);
    if (this.grounded && planar > 1.2) {
      this.stepAccum += planar * dt;
      var stride = this.sprinting ? 2.6 : 2.1;
      if (this.stepAccum > stride) {
        this.stepAccum = 0;
        BN.Audio.sfx('footstep');
      }
    }

    /* character + camera + weapons */
    var cg = this.character.group;
    cg.position.copy(this.pos);
    cg.rotation.y = this.yaw + this.recoilYaw;
    this.character.update(dt, {
      speed: planar,
      grounded: this.grounded,
      aiming: this.aiming,
      crouch: this.crouch,
      pitch: this.pitch,
      recoil: this.weapons.recoilKick
    });

    this.weapons.update(dt, ctx);
    this.updateCamera(dt);
  };

  /* ------------------------------ camera ------------------------------- */
  Player.prototype.lookDir = function (out) {
    var v = out || new this.THREE.Vector3();
    var p = this.pitch + this.recoilPitch;
    var y = this.yaw + this.recoilYaw;
    v.set(Math.sin(y) * Math.cos(p), Math.sin(p), Math.cos(y) * Math.cos(p));
    return v.normalize();
  };

  Player.prototype.updateCamera = function (dt) {
    var THREE = this.THREE;
    var pivot = this.tmpPivot.set(
      this.pos.x,
      this.pos.y + (this.crouch ? 1.18 : 1.52),
      this.pos.z
    );
    var fwd = this.lookDir(this.tmpFwd);
    var right = this.tmpRight.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw));

    var dist = this.aiming ? 2.45 : 4.9;
    var shoulder = this.aiming ? 0.72 : 0.4;
    var desired = this.tmpDesired.copy(pivot)
      .addScaledVector(fwd, -dist)
      .addScaledVector(right, shoulder);

    /* spring arm: shorten when geometry blocks the view */
    var dx = desired.x - pivot.x, dy = desired.y - pivot.y, dz = desired.z - pivot.z;
    var dl = Math.hypot(dx, dy, dz);
    if (dl > 0.01) {
      var hit = this.world.raycast(pivot.x, pivot.y, pivot.z, dx / dl, dy / dl, dz / dl, dl, false);
      if (hit) {
        var t = Math.max(0.75, hit.t - 0.3);
        desired.set(pivot.x + (dx / dl) * t, pivot.y + (dy / dl) * t, pivot.z + (dz / dl) * t);
      }
    }
    var camGround = this.world.groundHeightAt(desired.x, desired.z, desired.y) + 0.45;
    if (desired.y < camGround) desired.y = camGround;

    var k = this.deploying ? 6 : 15;
    this.camPos.x = U.damp(this.camPos.x, desired.x, k, dt);
    this.camPos.y = U.damp(this.camPos.y, desired.y, k, dt);
    this.camPos.z = U.damp(this.camPos.z, desired.z, k, dt);

    this.camera.position.copy(this.camPos);
    this.camera.lookAt(
      pivot.x + fwd.x * 24,
      pivot.y + fwd.y * 24,
      pivot.z + fwd.z * 24
    );

    var zoom = 1;
    if (this.aiming) {
      var item = this.inventory.activeItem();
      var def = item && item.kind === 'weapon' ? BN.WEAPONS[item.defId] : null;
      zoom = def && def.scope ? 1 / def.scope : 0.8;
    }
    var fov = this.fovBase * zoom;
    this.camera.fov = U.damp(this.camera.fov, fov, 12, dt);
    this.camera.updateProjectionMatrix();
    this.scoped = this.aiming && zoom < 0.6;
  };

  /* --------------------------- combat surface -------------------------- */
  Player.prototype.eyePos = function (out) {
    return (out || new this.THREE.Vector3()).set(
      this.pos.x, this.pos.y + (this.crouch ? 1.15 : 1.45), this.pos.z
    );
  };

  Player.prototype.hitSpheres = function () {
    var p = this.pos;
    return [
      { x: p.x, y: p.y + 1.62, z: p.z, r: 0.27, part: 'head' },
      { x: p.x, y: p.y + 1.05, z: p.z, r: 0.44, part: 'body' },
      { x: p.x, y: p.y + 0.45, z: p.z, r: 0.38, part: 'legs' }
    ];
  };

  Player.prototype.isBot = function () { return false; };

  Player.prototype.damage = function (amount, info) {
    if (!this.alive || amount <= 0) return 0;
    var left = amount;
    if (this.shield > 0) {
      var absorbed = Math.min(this.shield, left);
      this.shield -= absorbed;
      left -= absorbed;
      if (this.shield <= 0) BN.Audio.sfx('shieldBreak');
    }
    this.health -= left;
    this.emit('damage', amount, info);
    BN.Audio.sfx('hurt');
    if (this.health <= 0) {
      this.health = 0;
      this.die(info);
    }
    return amount;
  };

  Player.prototype.heal = function (amount) {
    this.health = Math.min(this.maxHealth, this.health + amount);
  };
  Player.prototype.addShield = function (amount) {
    this.shield = Math.min(this.maxShield, this.shield + amount);
  };

  Player.prototype.die = function (info) {
    if (!this.alive) return;
    this.alive = false;
    this.control = false;
    this.vel.set(0, 0, 0);
    this.character.setDead(true);
    this.emit('death', info || {});
  };
})();
