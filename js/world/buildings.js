/* ==========================================================================
   BLOXNITE — modular structures
   Axis-aligned modular pieces (slabs, walls, stairs, roofs) so that every
   piece doubles as a collision box. All original geometry, no external models.
   ========================================================================== */
(function () {
  var BN = (window.BN = window.BN || {});
  var U = BN.util;

  var Buildings = (BN.Buildings = {});

  Buildings.makeMaterials = function (THREE) {
    var std = function (color, rough, metal) {
      return new THREE.MeshStandardMaterial({
        color: color, roughness: rough === undefined ? 0.9 : rough, metalness: metal || 0,
        flatShading: true
      });
    };
    return {
      wall: std(0xd6d9e2, 0.95),
      wallWarm: std(0xd9c6a6, 0.95),
      wallCool: std(0xa9b4c9, 0.95),
      roof: std(0x3c4560, 0.85),
      roofWarm: std(0x6b3f36, 0.9),
      floor: std(0x8c7860, 0.95),
      floorUpper: std(0x6f6152, 0.95),
      crate: std(0x8a6b45, 0.95),
      metal: std(0x76808f, 0.7, 0.25),
      metalDark: std(0x4d5462, 0.65, 0.3),
      trim: std(0x37e5ff, 0.4, 0.15),
      glass: new THREE.MeshStandardMaterial({
        color: 0x9fd8ff, transparent: true, opacity: 0.28, roughness: 0.1,
        metalness: 0.1, side: THREE.DoubleSide
      })
    };
  };

  function ctxPush(ctx, mesh, w, h, d) {
    if (!ctx.colliders) return;
    mesh.updateMatrixWorld(true);
    var p = new THREE.Vector3();
    mesh.getWorldPosition(p);
    ctx.colliders.push({
      minX: p.x - w / 2, maxX: p.x + w / 2,
      minY: p.y - h / 2, maxY: p.y + h / 2,
      minZ: p.z - d / 2, maxZ: p.z + d / 2,
      tag: 'building'
    });
  }

  /** add an axis-aligned box; y is the *bottom* of the box */
  function box(ctx, x, y, z, w, h, d, mat, collide) {
    var THREE = ctx.THREE;
    var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y + h / 2, z);
    m.castShadow = true;
    m.receiveShadow = true;
    ctx.group.add(m);
    if (collide !== false) ctxPush(ctx, m, w, h, d);
    return m;
  }
  Buildings.box = box;

  function loot(ctx, x, y, z, tier) {
    ctx.lootSpots.push({ x: x, y: y + 0.15, z: z, tier: tier || 1 });
  }

  /* ---------------- stairs: stepped boxes (AABB friendly) ---------------- */
  function stairs(ctx, x, z, baseY, totalH, run, width, dir, mat) {
    var steps = Math.max(4, Math.round(totalH / 0.55));
    var stepH = totalH / steps;
    var stepD = run / steps;
    for (var i = 0; i < steps; i++) {
      var off = (i + 0.5) * stepD;
      if (dir === 'north') box(ctx, x, baseY, z - run / 2 + off, width, stepH * (i + 1), stepD, mat, false);
      else if (dir === 'south') box(ctx, x, baseY, z + run / 2 - off, width, stepH * (i + 1), stepD, mat, false);
      else if (dir === 'east') box(ctx, x + run / 2 - off, baseY, z, stepD, stepH * (i + 1), width, mat, false);
      else box(ctx, x - run / 2 + off, baseY, z, stepD, stepH * (i + 1), width, mat, false);
    }
    // one coarse collider per half of the flight keeps the collider count low
    var halfRun = run / 2;
    for (var h = 0; h < 2; h++) {
      var hx = x, hz = z;
      var hh = totalH * (h === 0 ? 0.5 : 1);
      var o = h === 0 ? -run / 4 : run / 4;
      var depth = halfRun, widthOut = width;
      if (dir === 'north') hz += o;
      else if (dir === 'south') hz -= o;
      else if (dir === 'east') hx -= o;
      else hx += o;
      if (dir === 'north' || dir === 'south') depth = halfRun;
      else { depth = widthOut; widthOut = halfRun; }
      var m = new THREE.Mesh(new THREE.BoxGeometry(widthOut, hh, depth), mat);
      m.position.set(hx, baseY + hh / 2, hz);
      m.visible = false;
      ctx.group.add(m);
      if (ctx.colliders) {
        ctx.colliders.push({
          minX: hx - widthOut / 2, maxX: hx + widthOut / 2,
          minY: baseY, maxY: baseY + hh,
          minZ: hz - depth / 2, maxZ: hz + depth / 2,
          tag: 'stairs'
        });
      }
    }
  }

  /* ------------------------------ wall runs ----------------------------- */
  /* Splits a wall into segments so doors / windows can be left open.       */
  function wallRun(ctx, axis, fixed, from, to, y, h, thick, mat, gaps) {
    gaps = (gaps || []).slice().sort(function (a, b) { return a.at - b.at; });
    var cursor = from;
    for (var i = 0; i < gaps.length; i++) {
      var g = gaps[i];
      if (g.at > cursor) segment(cursor, g.at);
      cursor = Math.max(cursor, g.at + g.width);
    }
    if (cursor < to) segment(cursor, to);

    function segment(a, b) {
      var len = b - a;
      if (len <= 0.05) return;
      var mid = (a + b) / 2;
      if (axis === 'x') box(ctx, mid, y, fixed, len, h, thick, mat);
      else box(ctx, fixed, y, mid, thick, h, len, mat);
    }
  }

  /* scaled variant: houses are built along local +X facing -Z */
  Buildings.house = function (ctx, x, y, z, opts) {
    opts = opts || {};
    var w = opts.w || 12, d = opts.d || 10, h = opts.h || 4.4;
    var mats = ctx.mats;
    var wallMat = opts.warm ? mats.wallWarm : mats.wall;
    var roofMat = opts.roof || mats.roof;

    box(ctx, x, y - 0.2, z, w + 0.8, 0.4, d + 0.8, mats.floor); // foundation

    // ground floor: front (-Z) door, side windows
    wallRun(ctx, 'x', z - d / 2, x - w / 2, x + w / 2, y, h, 0.35, wallMat, [{ at: x - 1.4, width: 2.8 }]);
    wallRun(ctx, 'x', z + d / 2, x - w / 2, x + w / 2, y, h, 0.35, wallMat, [{ at: x + 2, width: 1.8 }]);
    wallRun(ctx, 'z', x - w / 2, z - d / 2, z + d / 2, y, h, 0.35, wallMat, [{ at: z + 1, width: 1.8 }]);
    wallRun(ctx, 'z', x + w / 2, z - d / 2, z + d / 2, y, h, 0.35, wallMat, [{ at: z - 1, width: 1.8 }]);

    // window glass fills
    glassPane(ctx, x + 2, y + 1.4, z + d / 2, 1.8, 1.3, mats.glass);
    glassPane(ctx, x - w / 2, y + 1.4, z + 1, 1.8, 1.3, mats.glass, true);
    glassPane(ctx, x + w / 2, y + 1.4, z - 1, 1.8, 1.3, mats.glass, true);

    // upper floor slab
    var upper = y + h;
    box(ctx, x, upper, z, w, 0.4, d, mats.floorUpper);
    // upper walls
    var uh = h - 1.2;
    wallRun(ctx, 'x', z - d / 2, x - w / 2, x + w / 2, upper + 0.4, uh, 0.35, wallMat, [{ at: x - w / 4, width: 1.6 }]);
    wallRun(ctx, 'x', z + d / 2, x - w / 2, x + w / 2, upper + 0.4, uh, 0.35, wallMat, []);
    wallRun(ctx, 'z', x - w / 2, z - d / 2, z + d / 2, upper + 0.4, uh, 0.35, wallMat, []);
    wallRun(ctx, 'z', x + w / 2, z - d / 2, z + d / 2, upper + 0.4, uh, 0.35, wallMat, []);

    // flat roof + parapet
    var roofY = upper + 0.4 + uh;
    box(ctx, x, roofY, z, w + 0.7, 0.4, d + 0.7, roofMat);
    box(ctx, x, roofY + 0.4, z - d / 2 - 0.2, w + 0.7, 0.7, 0.3, roofMat);
    box(ctx, x, roofY + 0.4, z + d / 2 + 0.2, w + 0.7, 0.7, 0.3, roofMat);

    // covered porch
    box(ctx, x, y, z - d / 2 - 2.4, 4.6, 0.3, 4.6, roofMat);

    // stairs up (inside, back-right corner)
    stairs(ctx, x + w / 2 - 2.2, z + d / 2 - 3.4, y, h, 5.6, 2.4, 'north', mats.floorUpper);

    // interior cover + loot
    box(ctx, x - 2.6, y, z + 1.2, 2.2, 1.1, 1.6, mats.crate);
    loot(ctx, x - 1.2, y, z - 1.5, 1);
    loot(ctx, x + 2.4, y, z + 2.4, 1);
    loot(ctx, x, upper + 0.4, z - 1.2, 2);
    loot(ctx, x - w / 4, roofY + 0.4, z, 2);
    return { w: w, d: d, roofY: roofY + 0.4 };
  };

  function glassPane(ctx, x, y, z, w, h, mat, alongZ) {
    var THREE = ctx.THREE;
    var g = new THREE.PlaneGeometry(w, h);
    var m = new THREE.Mesh(g, mat);
    m.position.set(x, y, z);
    if (alongZ) m.rotation.y = Math.PI / 2;
    ctx.group.add(m);
  }

  Buildings.warehouse = function (ctx, x, y, z, opts) {
    opts = opts || {};
    var w = opts.w || 24, d = opts.d || 16, h = opts.h || 7.6;
    var mats = ctx.mats;

    box(ctx, x, y - 0.2, z, w + 1, 0.4, d + 1, mats.metalDark);

    wallRun(ctx, 'x', z - d / 2, x - w / 2, x + w / 2, y, h, 0.4, mats.metal, [{ at: x - 5, width: 5 }]);
    wallRun(ctx, 'x', z + d / 2, x - w / 2, x + w / 2, y, h, 0.4, mats.metal, [{ at: x + 4, width: 4 }]);
    wallRun(ctx, 'z', x - w / 2, z - d / 2, z + d / 2, y, h, 0.4, mats.metal, [{ at: z - 3, width: 3 }]);
    wallRun(ctx, 'z', x + w / 2, z - d / 2, z + d / 2, y, h, 0.4, mats.metal, [{ at: z + 2, width: 3 }]);

    // roof + mezzanine
    var roofY = y + h;
    box(ctx, x, roofY, z, w + 0.6, 0.45, d + 0.6, mats.roof);
    var mez = y + h / 2;
    box(ctx, x - w / 4, mez, z, w / 2, 0.35, d, mats.floorUpper);
    box(ctx, x - w / 4, mez + 0.35, z - d / 2 + 0.4, w / 2, 1.0, 0.2, mats.metal);
    stairs(ctx, x + 1.5, z + d / 2 - 3, y, h / 2, 5.4, 2.2, 'north', mats.floorUpper);

    // crates and shelving
    var rng = ctx.rng || Math.random;
    for (var i = 0; i < 6; i++) {
      var cx = x + (rng() - 0.5) * (w - 6);
      var cz = z + (rng() - 0.5) * (d - 6);
      var s = 1.2 + rng() * 1.0;
      box(ctx, cx, y, cz, s, s, s, mats.crate);
      if (rng() > 0.5) box(ctx, cx, y + s, cz, s * 0.8, s * 0.8, s * 0.8, mats.crate);
    }
    for (var j = 0; j < 3; j++) {
      box(ctx, x + w / 2 - 2.2, y, z + (j - 1) * 4.4, 1.4, 2.6, 3.2, mats.metalDark);
    }

    loot(ctx, x - 2, y, z - 3, 2);
    loot(ctx, x + 2, y, z + 3, 1);
    loot(ctx, x - w / 4, mez + 0.35, z + 2, 3);
    loot(ctx, x - w / 4 - 3, mez + 0.35, z - 3, 2);
    loot(ctx, x, roofY + 0.45, z, 3);
    return { w: w, d: d, roofY: roofY + 0.45 };
  };

  Buildings.shed = function (ctx, x, y, z, opts) {
    opts = opts || {};
    var w = opts.w || 6, d = opts.d || 6, h = 3.2;
    var mats = ctx.mats;
    box(ctx, x, y - 0.2, z, w + 0.4, 0.4, d + 0.4, mats.floor);
    wallRun(ctx, 'x', z - d / 2, x - w / 2, x + w / 2, y, h, 0.3, mats.wallCool, [{ at: x - 0.8, width: 2.2 }]);
    wallRun(ctx, 'x', z + d / 2, x - w / 2, x + w / 2, y, h, 0.3, mats.wallCool, []);
    wallRun(ctx, 'z', x - w / 2, z - d / 2, z + d / 2, y, h, 0.3, mats.wallCool, []);
    wallRun(ctx, 'z', x + w / 2, z - d / 2, z + d / 2, y, h, 0.3, mats.wallCool, []);
    box(ctx, x, y + h, z, w + 0.6, 0.35, d + 0.6, mats.roofWarm);
    box(ctx, x + 1.4, y, z + 1.4, 1.1, 1.1, 1.1, mats.crate);
    loot(ctx, x - 1.2, y, z - 1.2, 1);
    return { w: w, d: d, roofY: y + h + 0.35 };
  };

  Buildings.tower = function (ctx, x, y, z, opts) {
    opts = opts || {};
    var w = opts.w || 8, d = opts.d || 8, storey = 4.2, levels = opts.levels || 3;
    var mats = ctx.mats;
    box(ctx, x, y - 0.25, z, w + 1, 0.5, d + 1, mats.metalDark);
    for (var l = 0; l < levels; l++) {
      var by = y + l * storey;
      var gapsFront = l === 0 ? [{ at: x - 1, width: 2.4 }] : [{ at: x - 1, width: 2.4 }];
      wallRun(ctx, 'x', z - d / 2, x - w / 2, x + w / 2, by, storey - 0.4, 0.35, mats.wallCool, gapsFront);
      wallRun(ctx, 'x', z + d / 2, x - w / 2, x + w / 2, by, storey - 0.4, 0.35, mats.wallCool, [{ at: x + 2, width: 1.6 }]);
      wallRun(ctx, 'z', x - w / 2, z - d / 2, z + d / 2, by, storey - 0.4, 0.35, mats.wallCool, []);
      wallRun(ctx, 'z', x + w / 2, z - d / 2, z + d / 2, by, storey - 0.4, 0.35, mats.wallCool, []);
      // slab above (except we cap with roof at the end)
      if (l < levels - 1) {
        box(ctx, x, by + storey - 0.4, z, w, 0.4, d, mats.floorUpper);
        stairs(ctx, x + w / 2 - 2.0, z + d / 2 - 2.6, by, storey - 0.2, 4.2, 1.9, 'north', mats.floorUpper);
        loot(ctx, x - 1.5, by, z + 1.5, 2);
      }
    }
    var topY = y + levels * storey - 0.4;
    box(ctx, x, topY, z, w + 0.8, 0.4, d + 0.8, mats.roof);
    // railings
    box(ctx, x, topY + 0.4, z - d / 2 - 0.3, w + 0.8, 1.0, 0.2, mats.trim);
    box(ctx, x, topY + 0.4, z + d / 2 + 0.3, w + 0.8, 1.0, 0.2, mats.trim);
    box(ctx, x - w / 2 - 0.3, topY + 0.4, z, 0.2, 1.0, d + 0.8, mats.trim);
    box(ctx, x + w / 2 + 0.3, topY + 0.4, z, 0.2, 1.0, d + 0.8, mats.trim);
    loot(ctx, x, topY + 0.4, z, 3);
    loot(ctx, x - 2, topY + 0.4, z + 2, 3);
    return { w: w, d: d, roofY: topY + 0.4, height: levels * storey };
  };

  Buildings.crateStack = function (ctx, x, y, z, rng) {
    rng = rng || Math.random;
    var s = 1.1 + rng() * 0.8;
    box(ctx, x, y, z, s, s, s, ctx.mats.crate);
    if (rng() > 0.4) box(ctx, x + (rng() - 0.5) * 0.4, y + s, z + (rng() - 0.5) * 0.4, s * 0.8, s * 0.8, s * 0.8, ctx.mats.crate);
    if (rng() > 0.75) box(ctx, x + s * 0.9, y, z, s * 0.7, s * 0.7, s * 0.7, ctx.mats.crate);
  };

  Buildings.barrier = function (ctx, x, y, z, len, alongZ) {
    if (alongZ) box(ctx, x, y, z, 0.6, 1.3, len, ctx.mats.metalDark);
    else box(ctx, x, y, z, len, 1.3, 0.6, ctx.mats.metalDark);
  };
})();
