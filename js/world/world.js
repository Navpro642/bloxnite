/* ==========================================================================
   BLOXNITE — world
   Procedural island: heightmap terrain, water, sky, roads, instanced trees
   and rocks, POIs built from modular structures, and a unified collision /
   raycast model shared by the player, weapons, bots and the storm.
   ========================================================================== */
(function () {
  var BN = (window.BN = window.BN || {});
  var U = BN.util;

  var SIZE = 440;              // world is SIZE x SIZE metres
  var HALF = SIZE / 2;
  var SEG = 132;               // terrain grid resolution

  function seeded(seed) {
    var s = seed || 1337;
    return function () {
      s = (s * 1664525 + 1013904223) % 4294967296;
      return s / 4294967296;
    };
  }

  var World = (BN.World = function (THREE, opts) {
    this.THREE = THREE;
    this.opts = opts || {};
    this.rng = seeded(this.opts.seed || 20240815);
    this.colliders = [];        // AABBs
    this.lootSpots = [];
    this.pads = [];
    this.pois = [];
    this.roads = [];
    this.trees = [];
    this.group = new THREE.Group();
    this.heightCache = null;
  });

  World.prototype.baseHeight = function (x, z) {
    var nx = x / SIZE, nz = z / SIZE;
    var r = Math.hypot(nx, nz) * 2.0;
    var island = 1 - U.smoothstep(0.52, 1.02, r);
    var rough = U.fbm(nx * 3.1 + 11.3, nz * 3.1 + 4.7, 4);
    var hills = U.fbm(nx * 1.35 + 3.1, nz * 1.35 + 8.9, 3);
    var y = (rough * 0.7 + hills * 0.62) * 30 * island;
    // central landmark plateau
    var plateau = Math.max(0, 1 - Math.hypot(nx - 0.03, nz - 0.03) * 3.4);
    y += plateau * plateau * 9;
    // gentle bowl toward the coast so beaches read clearly
    y -= 4.2;
    return y;
  };

  World.prototype.heightAt = function (x, z) {
    var y = this.baseHeight(x, z);
    for (var i = 0; i < this.pads.length; i++) {
      var p = this.pads[i];
      var d = Math.hypot(x - p.x, z - p.z);
      if (d < p.radius * 1.7) {
        var t = 1 - U.smoothstep(p.radius, p.radius * 1.7, d);
        y = U.lerp(y, p.y, t);
      }
    }
    return y;
  };

  World.prototype.waterLevel = function () { return 0; };
  World.prototype.isWater = function (x, z) { return this.heightAt(x, z) < 0.15; };

  World.prototype.surfaceType = function (x, z) {
    var y = this.heightAt(x, z);
    if (y < 0.2) return 'water';
    if (y < 1.6) return 'sand';
    for (var i = 0; i < this.roads.length; i++) {
      var r = this.roads[i];
      if (Math.abs(x - r.x) < r.w / 2 && Math.abs(z - r.z) < r.d / 2) return 'road';
    }
    return 'grass';
  };

  /* ------------------------------- build -------------------------------- */
  World.prototype.build = function (scene) {
    var THREE = this.THREE;
    this.mats = {
      terrain: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0, flatShading: true }),
      water: new THREE.MeshStandardMaterial({
        color: 0x2a7fbe, transparent: true, opacity: 0.78, roughness: 0.15,
        metalness: 0.35, flatShading: false
      }),
      trunk: new THREE.MeshStandardMaterial({ color: 0x6b4b32, roughness: 0.95, flatShading: true }),
      leaf: new THREE.MeshStandardMaterial({ color: 0x2f7a48, roughness: 0.9, flatShading: true }),
      leafAlt: new THREE.MeshStandardMaterial({ color: 0x3f8f4f, roughness: 0.9, flatShading: true }),
      rock: new THREE.MeshStandardMaterial({ color: 0x8b8f99, roughness: 0.95, flatShading: true }),
      road: new THREE.MeshStandardMaterial({ color: 0x2f3442, roughness: 0.98, polygonOffset: true, polygonOffsetFactor: -2, flatShading: true }),
      building: BN.Buildings.makeMaterials(THREE)
    };

    scene.fog = new THREE.FogExp2(0x9dc2e8, 0.0026);

    this.makeSky(scene);
    this.definePOIs();
    this.makeTerrain(scene);
    this.makeWater(scene);
    this.buildPOIs(scene);
    this.makeRoads(scene);
    this.scatterTrees(scene);
    this.scatterRocks(scene);
    this.makeLighting(scene);
    scene.add(this.group);
    this.buildMinimapTexture();
    return this;
  };

  World.prototype.makeSky = function (scene) {
    var THREE = this.THREE;
    var geo = new THREE.SphereGeometry(SIZE * 1.4, 24, 16);
    var mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color(0x2a5a9e) },
        mid: { value: new THREE.Color(0x9dc2e8) },
        bot: { value: new THREE.Color(0xe8e2cf) }
      },
      vertexShader: 'varying float vH; void main(){ vH = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: [
        'uniform vec3 top; uniform vec3 mid; uniform vec3 bot; varying float vH;',
        'void main(){',
        '  float h = clamp(vH * 0.5 + 0.5, 0.0, 1.0);',
        '  vec3 c = h > 0.52 ? mix(mid, top, smoothstep(0.52, 0.95, h)) : mix(bot, mid, smoothstep(0.30, 0.52, h));',
        '  gl_FragColor = vec4(c, 1.0);',
        '}'
      ].join('\n')
    });
    var sky = new THREE.Mesh(geo, mat);
    sky.frustumCulled = false;
    scene.add(sky);
    this.sky = sky;
  };

  World.prototype.definePOIs = function () {
    var rng = this.rng;
    var list = [
      { id: 'meadow', name: 'Meadow Town', kind: 'residential', x: -120, z: 96, radius: 44, buildings: 7 },
      { id: 'ridge', name: 'Ridge Labs', kind: 'industrial', x: 118, z: -104, radius: 46, buildings: 5 },
      { id: 'harbor', name: 'Harbor Flats', kind: 'residential', x: -64, z: -138, radius: 40, buildings: 6 },
      { id: 'quarry', name: 'Stone Quarry', kind: 'industrial', x: 138, z: 92, radius: 40, buildings: 4 },
      { id: 'crown', name: 'Crown Peak', kind: 'landmark', x: 8, z: 4, radius: 34, buildings: 3 },
      { id: 'signal', name: 'Signal Station', kind: 'landmark', x: -18, z: 168, radius: 30, buildings: 3 }
    ];
    var self = this;
    list.forEach(function (p) {
      var base = self.baseHeight(p.x, p.z);
      p.y = Math.max(1.2, base);
      self.pads.push({ x: p.x, z: p.z, radius: p.radius * 0.62, y: p.y });
      self.pois.push(p);
    });
    // small scattered outposts between POIs keep rotation interesting
    for (var i = 0; i < 6; i++) {
      var a = (i / 6) * Math.PI * 2 + rng() * 0.6;
      var r = 60 + rng() * 40;
      var x = Math.cos(a) * r, z = Math.sin(a) * r;
      var y = Math.max(1.4, this.baseHeight(x, z));
      this.pads.push({ x: x, z: z, radius: 11, y: y });
      this.pois.push({ id: 'outpost' + i, name: 'Outpost', kind: 'outpost', x: x, z: z, radius: 12, y: y, buildings: 1, minor: true });
    }
  };

  World.prototype.makeTerrain = function (scene) {
    var THREE = this.THREE;
    var geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    var pos = geo.attributes.position;
    var colors = new Float32Array(pos.count * 3);
    var cGrass = new THREE.Color(0x4e8f52);
    var cGrassDark = new THREE.Color(0x2f6a3f);
    var cSand = new THREE.Color(0xd8c69a);
    var cRock = new THREE.Color(0x8a8d95);
    var cSnow = new THREE.Color(0xe8eef5);
    var tmp = new THREE.Color();
    for (var i = 0; i < pos.count; i++) {
      var x = pos.getX(i), z = pos.getZ(i);
      var y = this.heightAt(x, z);
      pos.setY(i, y);
      var slope = Math.abs(this.heightAt(x + 1.6, z) - y) + Math.abs(this.heightAt(x, z + 1.6) - y);
      if (y < 0.4) tmp.copy(cSand);
      else if (y < 2.0) tmp.copy(cSand).lerp(cGrass, U.smoothstep(0.4, 2.0, y));
      else tmp.copy(cGrass).lerp(cGrassDark, U.clamp((y - 6) / 22, 0, 1));
      if (slope > 1.5) tmp.lerp(cRock, U.clamp((slope - 1.5) / 2.2, 0, 0.85));
      if (y > 24) tmp.lerp(cSnow, U.clamp((y - 24) / 12, 0, 0.7));
      colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    var mesh = new THREE.Mesh(geo, this.mats.terrain);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.name = 'terrain';
    scene.add(mesh);
    this.terrainMesh = mesh;
  };

  World.prototype.makeWater = function (scene) {
    var THREE = this.THREE;
    var geo = new THREE.PlaneGeometry(SIZE * 3, SIZE * 3, 1, 1);
    geo.rotateX(-Math.PI / 2);
    var mesh = new THREE.Mesh(geo, this.mats.water);
    mesh.position.y = 0;
    mesh.receiveShadow = false;
    scene.add(mesh);
    this.waterMesh = mesh;
  };

  World.prototype.buildPOIs = function (scene) {
    var THREE = this.THREE;
    var self = this;
    var rng = this.rng;

    this.pois.forEach(function (poi) {
      var group = new THREE.Group();
      group.name = 'poi_' + poi.id;
      var ctx = {
        THREE: THREE,
        group: group,
        colliders: self.colliders,
        lootSpots: self.lootSpots,
        mats: self.mats.building,
        rng: rng
      };
      var y = poi.y;
      var n = poi.buildings;

      if (poi.kind === 'residential') {
        for (var i = 0; i < n; i++) {
          var ang = (i / n) * Math.PI * 2 + rng() * 0.4;
          var rad = poi.radius * (0.42 + rng() * 0.5);
          var bx = poi.x + Math.cos(ang) * rad;
          var bz = poi.z + Math.sin(ang) * rad;
          var pad = { x: bx, z: bz, radius: 9, y: self.heightAt(bx, bz) };
          self.pads.push(pad);
          self.heightAt = self.heightAt.bind(self); // pads applied on next sample
          BN.Buildings.house(ctx, bx, pad.y + 0.1, bz, { warm: rng() > 0.5 });
          if (rng() > 0.45) {
            BN.Buildings.shed(ctx, bx + (rng() - 0.5) * 18, pad.y + 0.1, bz + (rng() - 0.5) * 18, {});
          }
          // garden walls / fences
          for (var f = 0; f < 3; f++) {
            var fx = bx + (rng() - 0.5) * 22, fz = bz + (rng() - 0.5) * 22;
            BN.Buildings.barrier(ctx, fx, self.heightAt(fx, fz), fz, 4 + rng() * 4, rng() > 0.5);
          }
          self.lootSpots.push({ x: bx + (rng() - 0.5) * 14, y: self.heightAt(bx, bz) + 0.2, z: bz + (rng() - 0.5) * 14, tier: 1 });
        }
      } else if (poi.kind === 'industrial') {
        for (var j = 0; j < n; j++) {
          var a2 = (j / n) * Math.PI * 2 + rng() * 0.5;
          var r2 = poi.radius * (0.4 + rng() * 0.5);
          var wx = poi.x + Math.cos(a2) * r2;
          var wz = poi.z + Math.sin(a2) * r2;
          var pad2 = { x: wx, z: wz, radius: 15, y: self.heightAt(wx, wz) };
          self.pads.push(pad2);
          if (j % 3 === 0) BN.Buildings.warehouse(ctx, wx, pad2.y + 0.1, wz, {});
          else BN.Buildings.tower(ctx, wx, pad2.y + 0.1, wz, { levels: 2 + Math.floor(rng() * 2) });
          for (var c = 0; c < 5; c++) {
            var cx = wx + (rng() - 0.5) * 26, cz = wz + (rng() - 0.5) * 26;
            BN.Buildings.crateStack(ctx, cx, self.heightAt(cx, cz), cz, rng);
            if (rng() > 0.6) self.lootSpots.push({ x: cx, y: self.heightAt(cx, cz) + 0.2, z: cz, tier: 2 });
          }
        }
        // yard barriers
        for (var b = 0; b < 6; b++) {
          var bx2 = poi.x + (rng() - 0.5) * poi.radius * 1.5;
          var bz2 = poi.z + (rng() - 0.5) * poi.radius * 1.5;
          BN.Buildings.barrier(ctx, bx2, self.heightAt(bx2, bz2), bz2, 5 + rng() * 5, rng() > 0.5);
        }
      } else if (poi.kind === 'landmark') {
        if (poi.id === 'crown') {
          BN.Buildings.tower(ctx, poi.x, y + 0.1, poi.z, { levels: 3, w: 10, d: 10 });
          for (var k = 0; k < 4; k++) {
            var ka = (k / 4) * Math.PI * 2;
            BN.Buildings.shed(ctx, poi.x + Math.cos(ka) * 21, y + 0.1, poi.z + Math.sin(ka) * 21, { w: 5, d: 5 });
          }
        } else {
          BN.Buildings.warehouse(ctx, poi.x, y + 0.1, poi.z, { w: 18, d: 12, h: 6.4 });
          BN.Buildings.tower(ctx, poi.x + 24, y + 0.1, poi.z - 12, { levels: 2, w: 7, d: 7 });
          BN.Buildings.house(ctx, poi.x - 24, y + 0.1, poi.z + 10, { w: 10, d: 8, warm: true });
        }
        self.lootSpots.push({ x: poi.x + 8, y: y + 0.2, z: poi.z + 8, tier: 3 });
      } else {
        // outpost: one shed + crates
        BN.Buildings.shed(ctx, poi.x, y + 0.1, poi.z, {});
        for (var o = 0; o < 4; o++) {
          var ox = poi.x + (rng() - 0.5) * 14, oz = poi.z + (rng() - 0.5) * 14;
          BN.Buildings.crateStack(ctx, ox, self.heightAt(ox, oz), oz, rng);
        }
        self.lootSpots.push({ x: poi.x + 3, y: y + 0.2, z: poi.z + 3, tier: 2 });
      }
      scene.add(group);
    });
  };

  World.prototype.makeRoads = function (scene) {
    var THREE = this.THREE;
    var self = this;
    var path = [
      [-120, 96], [-60, 60], [-16, 24], [8, 4], [60, 30], [118, 92],
      [80, 30], [40, 5], [0, -40], [-64, -138]
    ];
    var group = new THREE.Group();
    for (var i = 0; i < path.length - 1; i++) {
      var a = path[i], b = path[i + 1];
      var len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      var steps = Math.max(2, Math.floor(len / 6));
      for (var s = 0; s < steps; s++) {
        var t0 = s / steps, t1 = (s + 1) / steps;
        var x0 = U.lerp(a[0], b[0], t0), z0 = U.lerp(a[1], b[1], t0);
        var x1 = U.lerp(a[0], b[0], t1), z1 = U.lerp(a[1], b[1], t1);
        var cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
        var y = self.heightAt(cx, cz);
        if (y < 0.6) continue;
        var angle = Math.atan2(x1 - x0, z1 - z0);
        var seg = new THREE.Mesh(new THREE.PlaneGeometry(6.5, len / steps + 0.6), self.mats.road);
        seg.rotation.x = -Math.PI / 2;
        seg.rotation.z = -angle;
        seg.position.set(cx, y + 0.06, cz);
        seg.receiveShadow = true;
        group.add(seg);
      }
      // registered for footstep surface checks (coarse)
      var midx = (a[0] + b[0]) / 2, midz = (a[1] + b[1]) / 2;
      this.roads.push({ x: midx, z: midz, w: Math.abs(b[0] - a[0]) + 7, d: Math.abs(b[1] - a[1]) + 7 });
    }
    scene.add(group);
  };

  World.prototype.scatterTrees = function (scene) {
    var THREE = this.THREE;
    var rng = this.rng;
    var positions = [];
    var attempts = 0;
    while (positions.length < 620 && attempts < 6000) {
      attempts++;
      var x = (rng() - 0.5) * SIZE * 0.94;
      var z = (rng() - 0.5) * SIZE * 0.94;
      var y = this.heightAt(x, z);
      if (y < 1.8 || y > 26) continue;
      // keep POIs clear
      var blocked = false;
      for (var i = 0; i < this.pois.length; i++) {
        if (Math.hypot(x - this.pois[i].x, z - this.pois[i].z) < this.pois[i].radius * 0.78) { blocked = true; break; }
      }
      if (blocked) continue;
      if (this.surfaceType(x, z) === 'road') continue;
      positions.push({ x: x, y: y, z: z, s: 0.8 + rng() * 0.9, r: rng() * Math.PI * 2 });
    }

    var trunkGeo = new THREE.CylinderGeometry(0.32, 0.46, 4.6, 6);
    var leafGeo = new THREE.ConeGeometry(2.4, 6.2, 7);
    var trunkMesh = new THREE.InstancedMesh(trunkGeo, this.mats.trunk, positions.length);
    var leafMesh = new THREE.InstancedMesh(leafGeo, this.mats.leaf, positions.length);
    var dummy = new THREE.Object3D();
    var self = this;
    positions.forEach(function (p, i) {
      dummy.position.set(p.x, p.y + 2.3 * p.s, p.z);
      dummy.scale.set(p.s, p.s, p.s);
      dummy.rotation.set(0, p.r, 0);
      dummy.updateMatrix();
      trunkMesh.setMatrixAt(i, dummy.matrix);
      dummy.position.set(p.x, p.y + 6.4 * p.s, p.z);
      dummy.updateMatrix();
      leafMesh.setMatrixAt(i, dummy.matrix);
      if (i % 3 === 0) self.trees.push(p);
    });
    trunkMesh.castShadow = true; trunkMesh.receiveShadow = true;
    leafMesh.castShadow = true; leafMesh.receiveShadow = false;
    trunkMesh.instanceMatrix.needsUpdate = true;
    leafMesh.instanceMatrix.needsUpdate = true;
    scene.add(trunkMesh); scene.add(leafMesh);
  };

  World.prototype.scatterRocks = function (scene) {
    var THREE = this.THREE;
    var rng = this.rng;
    var count = 190;
    var geo = new THREE.DodecahedronGeometry(1, 0);
    var mesh = new THREE.InstancedMesh(geo, this.mats.rock, count);
    var dummy = new THREE.Object3D();
    var placed = 0, guard = 0;
    while (placed < count && guard < 3000) {
      guard++;
      var x = (rng() - 0.5) * SIZE * 0.9;
      var z = (rng() - 0.5) * SIZE * 0.9;
      var y = this.heightAt(x, z);
      if (y < 0.6) continue;
      var s = 0.6 + rng() * 2.2;
      dummy.position.set(x, y + s * 0.45, z);
      dummy.scale.set(s, s * (0.6 + rng() * 0.5), s);
      dummy.rotation.set(rng(), rng() * Math.PI * 2, rng());
      dummy.updateMatrix();
      mesh.setMatrixAt(placed, dummy.matrix);
      if (s > 1.8) {
        this.colliders.push({
          minX: x - s * 0.7, maxX: x + s * 0.7,
          minY: y, maxY: y + s * 1.1,
          minZ: z - s * 0.7, maxZ: z + s * 0.7, tag: 'rock'
        });
      }
      placed++;
    }
    mesh.count = placed;
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.instanceMatrix.needsUpdate = true;
    scene.add(mesh);
  };

  World.prototype.makeLighting = function (scene) {
    var THREE = this.THREE;
    var hemi = new THREE.HemisphereLight(0xcfe4ff, 0x4a5a45, 0.85);
    scene.add(hemi);

    var sun = new THREE.DirectionalLight(0xfff2d8, 1.55);
    sun.position.set(120, 190, 80);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    var c = sun.shadow.camera;
    c.left = -150; c.right = 150; c.top = 150; c.bottom = -150; c.near = 1; c.far = 520;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.6;
    scene.add(sun);
    scene.add(sun.target);
    this.sun = sun;
    this.hemi = hemi;
  };

  /* ------------------------- collision & raycast ------------------------ */
  World.prototype.boxesNear = function (x, z, radius) {
    var out = [];
    for (var i = 0; i < this.colliders.length; i++) {
      var b = this.colliders[i];
      if (x + radius < b.minX || x - radius > b.maxX) continue;
      if (z + radius < b.minZ || z - radius > b.maxZ) continue;
      out.push(b);
    }
    return out;
  };

  World.prototype.groundHeightAt = function (x, z, fromY) {
    var g = this.heightAt(x, z);
    var near = this.boxesNear(x, z, 0.2);
    for (var i = 0; i < near.length; i++) {
      var b = near[i];
      if (x >= b.minX - 0.1 && x <= b.maxX + 0.1 && z >= b.minZ - 0.1 && z <= b.maxZ + 0.1) {
        if (b.maxY <= fromY + 0.45 && b.maxY > g) g = b.maxY;
      }
    }
    return g;
  };

  /* Ray vs terrain + all AABBs. Returns { t, x,y,z, type, box } or null. */
  World.prototype.raycast = function (ox, oy, oz, dx, dy, dz, maxDist, skipTerrain) {
    var best = maxDist, hit = null, i, t, b;
    // AABBs
    for (i = 0; i < this.colliders.length; i++) {
      b = this.colliders[i];
      t = U.rayAABB(ox, oy, oz, dx, dy, dz, b);
      if (t < best) { best = t; hit = { type: 'box', box: b }; }
    }
    // terrain: step then refine
    if (!skipTerrain) {
      var step = 1.4, prev = 0, curr = 0;
      while (curr < Math.min(best, maxDist)) {
        curr += step;
        var px = ox + dx * curr, py = oy + dy * curr, pz = oz + dz * curr;
        if (py < this.heightAt(px, pz)) {
          var lo = prev, hi = curr;
          for (var k = 0; k < 7; k++) {
            var mid = (lo + hi) / 2;
            var mx = ox + dx * mid, my = oy + dy * mid, mz = oz + dz * mid;
            if (my < this.heightAt(mx, mz)) hi = mid; else lo = mid;
          }
          if (hi < best) {
            best = hi;
            hit = { type: 'terrain' };
          }
          break;
        }
        prev = curr;
      }
    }
    if (!hit) return null;
    return {
      t: best, type: hit.type, box: hit.box,
      x: ox + dx * best, y: oy + dy * best, z: oz + dz * best
    };
  };

  World.prototype.lineOfSight = function (ax, ay, az, bx, by, bz) {
    var dx = bx - ax, dy = by - ay, dz = bz - az;
    var dist = Math.hypot(dx, dy, dz);
    if (dist < 0.1) return true;
    dx /= dist; dy /= dist; dz /= dist;
    var hit = this.raycast(ax, ay, az, dx, dy, dz, dist - 0.4, false);
    return !hit;
  };

  /* ------------------------------ minimap ------------------------------- */
  World.prototype.buildMinimapTexture = function () {
    var THREE = this.THREE;
    var N = 256;
    var cv = document.createElement('canvas');
    cv.width = N; cv.height = N;
    var ctx = cv.getContext('2d');
    var img = ctx.createImageData(N, N);
    for (var y = 0; y < N; y++) {
      for (var x = 0; x < N; x++) {
        var wx = (x / N - 0.5) * SIZE;
        var wz = (y / N - 0.5) * SIZE;
        var h = this.heightAt(wx, wz);
        var r, g, b;
        if (h < 0.15) { r = 28; g = 86; b = 132; }
        else if (h < 1.8) { r = 214; g = 197; b = 152; }
        else if (h > 26) { r = 226; g = 232; b = 240; }
        else {
          var t = U.clamp(h / 26, 0, 1);
          r = Math.round(78 + t * 40);
          g = Math.round(140 - t * 10);
          b = Math.round(82 - t * 6);
        }
        var idx = (y * N + x) * 4;
        img.data[idx] = r; img.data[idx + 1] = g; img.data[idx + 2] = b; img.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    // structures
    for (var i = 0; i < this.colliders.length; i++) {
      var c = this.colliders[i];
      if (c.tag !== 'building' && c.tag !== 'stairs') continue;
      var px = ((c.minX + SIZE / 2) / SIZE) * N;
      var py = ((c.minZ + SIZE / 2) / SIZE) * N;
      var w = Math.max(1, ((c.maxX - c.minX) / SIZE) * N);
      var hh = Math.max(1, ((c.maxZ - c.minZ) / SIZE) * N);
      ctx.fillStyle = 'rgba(48,54,70,0.85)';
      ctx.fillRect(px, py, w, hh);
    }
    this.minimapCanvas = cv;
    this.minimapTexture = new THREE.CanvasTexture(cv);
  };

  World.SIZE = SIZE;
  World.HALF = HALF;
})();
