/* ==========================================================================
   BLOXNITE — visual effects (pooled, no per-shot allocation)
   Tracers, impact sparks, muzzle flashes, pickup pops. Every object is
   created once at init and recycled so combat never triggers GC spikes.
   ========================================================================== */
(function () {
  var BN = (window.BN = window.BN || {});

  var THREE, scene, group;
  var tracers = [], sparks = [], flashes = [];
  var ti = 0, si = 0, fi = 0;
  var TRACER_COUNT = 24, SPARK_COUNT = 56, FLASH_COUNT = 2;
  var sparkGeo, sparkMatBase, ready = false;

  function makeTracer() {
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    var mat = new THREE.LineBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, fog: false
    });
    var line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    line.visible = false;
    group.add(line);
    return { mesh: line, life: 0, max: 0.06 };
  }

  function makeSpark() {
    var mat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 1, depthWrite: false, fog: false
    });
    var mesh = new THREE.Mesh(sparkGeo, mat);
    mesh.visible = false;
    mesh.frustumCulled = false;
    group.add(mesh);
    return { mesh: mesh, life: 0, max: 0.4, vx: 0, vy: 0, vz: 0, size: 1 };
  }

  function makeFlash() {
    var sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      color: 0xfff0c0, transparent: true, opacity: 0, depthWrite: false, fog: false
    }));
    sprite.visible = false;
    sprite.scale.set(1.1, 1.1, 1.1);
    group.add(sprite);
    return { sprite: sprite, life: 0, max: 0.07 };
  }

  var FX = (BN.FX = {
    init: function (T, s) {
      THREE = T;
      scene = s;
      if (ready) { FX.clear(); return; }
      group = new THREE.Group();
      group.name = 'fx';
      scene.add(group);
      sparkGeo = new THREE.BoxGeometry(0.055, 0.055, 0.055);

      var i;
      for (i = 0; i < TRACER_COUNT; i++) tracers.push(makeTracer());
      for (i = 0; i < SPARK_COUNT; i++) sparks.push(makeSpark());
      for (i = 0; i < FLASH_COUNT; i++) flashes.push(makeFlash());
      ready = true;
    },

    /* bright streak from muzzle to impact */
    tracer: function (from, to, color) {
      if (!ready) return;
      var t = tracers[ti = (ti + 1) % tracers.length];
      var pos = t.mesh.geometry.attributes.position;
      pos.array[0] = from.x; pos.array[1] = from.y; pos.array[2] = from.z;
      pos.array[3] = to.x; pos.array[4] = to.y; pos.array[5] = to.z;
      pos.needsUpdate = true;
      t.mesh.material.color.set(color || 0xffe9a8);
      t.mesh.material.opacity = 0.95;
      t.mesh.visible = true;
      t.life = t.max;
    },

    /* small debris burst where a bullet lands */
    impact: function (x, y, z, color, count) {
      if (!ready) return;
      var n = count || 5;
      for (var k = 0; k < n; k++) {
        var s = sparks[si = (si + 1) % sparks.length];
        s.mesh.position.set(x, y, z);
        s.mesh.material.color.set(color || 0xffd98a);
        s.mesh.material.opacity = 1;
        s.size = 0.6 + Math.random() * 0.9;
        s.mesh.scale.setScalar(s.size);
        s.mesh.visible = true;
        s.vx = (Math.random() - 0.5) * 5.5;
        s.vy = Math.random() * 4.5 + 0.6;
        s.vz = (Math.random() - 0.5) * 5.5;
        s.life = s.max = 0.28 + Math.random() * 0.22;
      }
    },

    muzzle: function (pos, color) {
      if (!ready) return;
      var f = flashes[fi = (fi + 1) % flashes.length];
      f.sprite.position.copy(pos);
      f.sprite.material.color.set(color || 0xffe6a8);
      f.sprite.material.opacity = 0.9;
      f.sprite.visible = true;
      f.life = f.max;
      f.sprite.scale.setScalar(0.9 + Math.random() * 0.5);
    },

    /* expanding ring when loot is collected */
    pickup: function (pos, color) {
      if (!ready) return;
      for (var k = 0; k < 8; k++) {
        var s = sparks[si = (si + 1) % sparks.length];
        var a = (k / 8) * Math.PI * 2;
        s.mesh.position.set(pos.x + Math.cos(a) * 0.2, pos.y + 0.35, pos.z + Math.sin(a) * 0.2);
        s.mesh.material.color.set(color || 0x37e5ff);
        s.mesh.material.opacity = 1;
        s.size = 0.8;
        s.mesh.scale.setScalar(s.size);
        s.mesh.visible = true;
        s.vx = Math.cos(a) * 2.4;
        s.vy = 2.2;
        s.vz = Math.sin(a) * 2.4;
        s.life = s.max = 0.45;
      }
    },

    update: function (dt) {
      if (!ready) return;
      var i, t, s, f;

      for (i = 0; i < tracers.length; i++) {
        t = tracers[i];
        if (t.life <= 0) continue;
        t.life -= dt;
        if (t.life <= 0) { t.mesh.visible = false; t.mesh.material.opacity = 0; continue; }
        t.mesh.material.opacity = 0.95 * (t.life / t.max);
      }

      for (i = 0; i < sparks.length; i++) {
        s = sparks[i];
        if (s.life <= 0) continue;
        s.life -= dt;
        if (s.life <= 0) { s.mesh.visible = false; continue; }
        s.vy -= 16 * dt;
        s.mesh.position.x += s.vx * dt;
        s.mesh.position.y += s.vy * dt;
        s.mesh.position.z += s.vz * dt;
        s.mesh.material.opacity = Math.max(0, s.life / s.max);
        s.mesh.scale.setScalar(s.size * Math.max(0.15, s.life / s.max));
      }

      for (i = 0; i < flashes.length; i++) {
        f = flashes[i];
        if (f.life <= 0) continue;
        f.life -= dt;
        if (f.life <= 0) { f.sprite.visible = false; f.sprite.material.opacity = 0; continue; }
        f.sprite.material.opacity = 0.9 * (f.life / f.max);
      }
    },

    clear: function () {
      if (!ready) return;
      var i;
      for (i = 0; i < tracers.length; i++) { tracers[i].life = 0; tracers[i].mesh.visible = false; }
      for (i = 0; i < sparks.length; i++) { sparks[i].life = 0; sparks[i].mesh.visible = false; }
      for (i = 0; i < flashes.length; i++) { flashes[i].life = 0; flashes[i].sprite.visible = false; }
    },

    dispose: function () {
      if (!ready) return;
      FX.clear();
      if (group && group.parent) group.parent.remove(group);
      ready = false;
      tracers.length = 0;
      sparks.length = 0;
      flashes.length = 0;
      ti = si = fi = 0;
    }
  });
})();
