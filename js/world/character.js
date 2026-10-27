/* ==========================================================================
   BLOXNITE — character rig + weapon models
   Everything here is generated geometry (boxes, cones, cylinders) so there
   are no external model files and no third-party art. The rig exposes named
   pivots that the animation pass drives; it contains no game logic.
   ========================================================================== */
(function () {
  var BN = (window.BN = window.BN || {});

  function std(THREE, color, opts) {
    var o = { color: color, roughness: 0.85, metalness: 0.06, flatShading: true };
    if (opts) { for (var k in opts) o[k] = opts[k]; }
    return new THREE.MeshStandardMaterial(o);
  }

  function box(THREE, w, h, d, mat, x, y, z) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x || 0, y || 0, z || 0);
    return m;
  }

  function disposeGroup(g) {
    if (!g) return;
    g.traverse(function (o) {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (o.material.map) o.material.map.dispose();
        o.material.dispose();
      }
    });
    while (g.children.length) g.remove(g.children[0]);
  }

  /* ======================================================================
     Weapon models — forward is +Z, muzzle sits at the front tip
     ====================================================================== */
  var WeaponModel = (BN.WeaponModel = function (THREE, ref, color) {
    this.THREE = THREE;
    this.group = new THREE.Group();
    this.muzzle = new THREE.Object3D();
    this.group.add(this.muzzle);
    this.build(THREE, ref || 'rifle', color || '#37e5ff');
  });

  WeaponModel.prototype.build = function (THREE, ref, color) {
    var g = this.group;
    var dark = std(THREE, 0x232936, { roughness: 0.55, metalness: 0.45 });
    var mid = std(THREE, 0x39415280 & 0xffffff, { roughness: 0.6, metalness: 0.38 });
    var accent = std(THREE, new THREE.Color(color).getHex(), {
      roughness: 0.4, metalness: 0.2,
      emissive: new THREE.Color(color), emissiveIntensity: 0.22
    });
    var tipZ = 0.5;

    function part(w, h, d, x, y, z, mat) {
      var m = box(THREE, w, h, d, mat, x, y, z);
      g.add(m);
      return m;
    }
    function cyl(r, len, x, y, z, mat) {
      var geo = new THREE.CylinderGeometry(r, r, len, 10);
      var m = new THREE.Mesh(geo, mat);
      m.rotation.x = Math.PI / 2;
      m.position.set(x, y, z);
      g.add(m);
      return m;
    }

    if (ref === 'rifle') {
      part(0.1, 0.14, 0.62, 0, 0, 0, dark);
      part(0.055, 0.055, 0.34, 0, -0.01, 0.46, mid);
      part(0.05, 0.17, 0.1, 0, -0.15, -0.02, mid);
      part(0.07, 0.11, 0.22, 0, -0.02, -0.4, dark);
      part(0.06, 0.14, 0.08, 0, -0.13, -0.15, dark);
      part(0.05, 0.06, 0.13, 0, 0.1, 0.06, mid);
      part(0.022, 0.05, 0.3, 0, 0.055, 0.16, accent);
      tipZ = 0.63;
    } else if (ref === 'smg') {
      part(0.09, 0.13, 0.42, 0, 0, 0, dark);
      part(0.05, 0.05, 0.22, 0, 0, 0.31, mid);
      part(0.05, 0.2, 0.09, 0, -0.16, 0.02, mid);
      part(0.06, 0.13, 0.08, 0, -0.12, -0.12, dark);
      part(0.05, 0.05, 0.14, 0, 0.09, 0.04, mid);
      part(0.02, 0.06, 0.2, 0, 0.055, 0.14, accent);
      tipZ = 0.43;
    } else if (ref === 'shotgun') {
      part(0.11, 0.13, 0.66, 0, 0, 0, dark);
      part(0.05, 0.05, 0.42, -0.028, 0.025, 0.52, mid);
      part(0.05, 0.05, 0.42, 0.028, 0.025, 0.52, mid);
      part(0.1, 0.1, 0.2, 0, -0.09, 0.34, mid);
      part(0.08, 0.12, 0.24, 0, -0.02, -0.42, dark);
      part(0.06, 0.13, 0.08, 0, -0.12, -0.16, dark);
      part(0.025, 0.05, 0.24, 0, 0.055, 0.1, accent);
      tipZ = 0.74;
    } else if (ref === 'pistol') {
      part(0.075, 0.1, 0.3, 0, 0, 0.04, mid);
      part(0.045, 0.045, 0.08, 0, 0, 0.21, dark);
      part(0.07, 0.16, 0.1, 0, -0.12, -0.06, dark);
      part(0.05, 0.03, 0.1, 0, 0.06, 0.06, accent);
      tipZ = 0.26;
    } else if (ref === 'sniper') {
      part(0.09, 0.12, 0.72, 0, 0, -0.06, dark);
      cyl(0.024, 0.66, 0, 0.008, 0.6, mid);
      part(0.05, 0.17, 0.1, 0, -0.15, -0.1, mid);
      part(0.07, 0.12, 0.26, 0, -0.02, -0.5, dark);
      cyl(0.055, 0.26, 0, 0.12, -0.02, mid);
      part(0.02, 0.05, 0.55, 0.02, 0.05, 0.2, accent);
      tipZ = 0.93;
    } else if (ref === 'cannon') {
      part(0.16, 0.2, 0.52, 0, 0, 0, dark);
      part(0.12, 0.12, 0.44, 0, 0.01, 0.44, mid);
      var ringGeo = new THREE.TorusGeometry(0.085, 0.016, 6, 14);
      for (var i = 0; i < 3; i++) {
        var r = new THREE.Mesh(ringGeo, accent);
        r.position.set(0, 0.01, 0.26 + i * 0.12);
        g.add(r);
      }
      part(0.07, 0.15, 0.09, 0, -0.16, -0.02, mid);
      part(0.09, 0.1, 0.2, 0, -0.02, -0.34, dark);
      tipZ = 0.68;
    } else {
      part(0.1, 0.14, 0.6, 0, 0, 0, dark);
      tipZ = 0.5;
    }

    this.muzzle.position.set(0, 0.01, tipZ);
    this.length = tipZ;
    this.group.traverse(function (o) { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
    return this;
  };

  WeaponModel.prototype.dispose = function () { disposeGroup(this.group); };

  /* ======================================================================
     Character rig
     ====================================================================== */
  var Character = (BN.Character = function (THREE, palette, opts) {
    opts = opts || {};
    this.THREE = THREE;
    this.opts = opts;
    this.group = new THREE.Group();
    this.group.name = 'character';
    this.phase = Math.random() * 6.28;
    this.time = 0;
    this.dead = false;
    this.currentWeapon = null;
    this.mats = {
      shirt: std(THREE, 0x2f6bff),
      pants: std(THREE, 0x1b2550),
      skin: std(THREE, 0xf0c39d),
      accent: std(THREE, 0x37e5ff, {
        roughness: 0.5, metalness: 0.15,
        emissive: new THREE.Color(0x0d3440), emissiveIntensity: 0.8
      }),
      dark: std(THREE, 0x1a2033, { roughness: 0.9 })
    };
    this.weaponModel = null;
    this.build();
    this.setPalette(palette || (BN.Save && BN.Save.palette ? BN.Save.palette() : null) || {
      shirt: '#2f6bff', pants: '#1b2550', skin: '#f0c39d', accent: '#37e5ff',
      hat: 'cap', hatColor: '#37e5ff', backbling: 'pack'
    });
  });

  Character.prototype.build = function () {
    var THREE = this.THREE, m = this.mats, self = this;

    var lower = new THREE.Group();
    this.group.add(lower);
    this.lower = lower;

    /* legs pivot at hip height */
    function legPivot(side) {
      var p = new THREE.Group();
      p.position.set(side * 0.15, 0.94, 0);
      p.add(box(THREE, 0.19, 0.48, 0.2, m.pants, 0, -0.24, 0));
      p.add(box(THREE, 0.18, 0.4, 0.19, m.pants, 0, -0.66, 0));
      p.add(box(THREE, 0.2, 0.12, 0.3, m.dark, 0, -0.86, 0.04));
      lower.add(p);
      return p;
    }
    this.legL = legPivot(1);
    this.legR = legPivot(-1);

    /* upper body pivot (bob / lean / crouch) */
    var upper = new THREE.Group();
    upper.position.y = 0.94;
    this.group.add(upper);
    this.upper = upper;

    upper.add(box(THREE, 0.56, 0.5, 0.34, m.shirt, 0, 0.27, 0));
    this.stripe = box(THREE, 0.575, 0.07, 0.355, m.accent, 0, 0.36, 0);
    upper.add(this.stripe);
    upper.add(box(THREE, 0.5, 0.18, 0.32, m.pants, 0, 0.0, 0));
    upper.add(box(THREE, 0.3, 0.1, 0.36, m.dark, 0, 0.5, 0));

    var head = new THREE.Group();
    head.position.set(0, 0.54, 0);
    upper.add(head);
    this.headPivot = head;

    var skull = box(THREE, 0.38, 0.36, 0.36, m.skin, 0, 0.19, 0);
    head.add(skull);
    var eyeMat = std(THREE, 0x101a2e, { roughness: 0.35 });
    head.add(box(THREE, 0.075, 0.09, 0.02, eyeMat, -0.088, 0.22, 0.183));
    head.add(box(THREE, 0.075, 0.09, 0.02, eyeMat, 0.088, 0.22, 0.183));
    head.add(box(THREE, 0.1, 0.03, 0.02, m.dark, 0, 0.11, 0.183));

    /* arms pivot at shoulders */
    function armPivot(side) {
      var p = new THREE.Group();
      p.position.set(side * 0.36, 0.46, 0);
      p.add(box(THREE, 0.16, 0.44, 0.17, m.shirt, 0, -0.22, 0));
      p.add(box(THREE, 0.15, 0.32, 0.16, m.skin, 0, -0.58, 0));
      p.add(box(THREE, 0.17, 0.14, 0.18, m.dark, 0, -0.78, 0));
      upper.add(p);
      return p;
    }
    this.armL = armPivot(1);
    this.armR = armPivot(-1);

    /* weapon mount (child of root so it stays level while the body leans) */
    var mount = new THREE.Group();
    mount.position.set(0.24, 1.2, 0.16);
    this.group.add(mount);
    this.weaponMount = mount;

    this.hatGroup = new THREE.Group();
    this.hatGroup.position.set(0, 0.2, 0);
    head.add(this.hatGroup);
    this.bbGroup = new THREE.Group();
    this.bbGroup.position.set(0, 0.3, -0.22);
    upper.add(this.bbGroup);

    this.group.traverse(function (o) {
      if (o.isMesh && self.opts.shadows !== false) {
        o.castShadow = true;
        o.receiveShadow = false;
      }
    });
  };

  Character.prototype.setPalette = function (p) {
    if (!p) return this;
    var THREE = this.THREE;
    if (p.shirt) this.mats.shirt.color.set(p.shirt);
    if (p.pants) this.mats.pants.color.set(p.pants);
    if (p.skin) this.mats.skin.color.set(p.skin);
    if (p.accent) {
      this.mats.accent.color.set(p.accent);
      this.mats.accent.emissive.set(p.accent);
      this.mats.accent.emissiveIntensity = 0.18;
    }
    this.setHat(p.hat, p.hatColor || p.accent);
    this.setBackbling(p.backbling, p.accent);
    this.palette = p;
    if (this.currentWeapon) this.setWeapon(this.currentWeapon.ref, this.currentWeapon.color, false);
    return this;
  };

  Character.prototype.setHat = function (shape, color) {
    var THREE = this.THREE;
    disposeGroup(this.hatGroup);
    var g = this.hatGroup;
    var c = color || '#37e5ff';
    var m = std(THREE, new THREE.Color(c).getHex(), {
      roughness: 0.5, metalness: 0.15,
      emissive: new THREE.Color(c), emissiveIntensity: 0.16
    });
    var dark = std(THREE, 0x1e2434, { roughness: 0.8 });
    switch (shape) {
      case 'cap':
        g.add(box(THREE, 0.4, 0.1, 0.4, m, 0, 0.36, 0));
        g.add(box(THREE, 0.4, 0.035, 0.16, m, 0, 0.33, 0.25));
        break;
      case 'band':
        g.add(box(THREE, 0.405, 0.08, 0.405, m, 0, 0.33, 0));
        break;
      case 'helm':
        g.add(box(THREE, 0.44, 0.22, 0.44, dark, 0, 0.42, 0));
        g.add(box(THREE, 0.46, 0.05, 0.46, m, 0, 0.54, 0));
        g.add(box(THREE, 0.06, 0.16, 0.46, m, 0, 0.34, 0));
        break;
      case 'visor':
        g.add(box(THREE, 0.42, 0.06, 0.42, dark, 0, 0.37, 0));
        g.add(box(THREE, 0.4, 0.08, 0.05, m, 0, 0.24, 0.2));
        break;
      case 'crown':
        g.add(box(THREE, 0.36, 0.06, 0.36, m, 0, 0.36, 0));
        for (var i = 0; i < 5; i++) {
          var a = (i / 5) * Math.PI * 2;
          var spike = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.16, 4), m);
          spike.position.set(Math.cos(a) * 0.13, 0.44, Math.sin(a) * 0.13);
          g.add(spike);
        }
        break;
      case 'horns':
        for (var h = 0; h < 2; h++) {
          var horn = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.26, 5), m);
          horn.position.set(h ? 0.16 : -0.16, 0.4, 0.02);
          horn.rotation.z = h ? -0.5 : 0.5;
          g.add(horn);
        }
        g.add(box(THREE, 0.4, 0.05, 0.4, dark, 0, 0.35, 0));
        break;
      case 'halo':
        var halo = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.028, 6, 18), m);
        halo.rotation.x = Math.PI / 2;
        halo.position.y = 0.6;
        g.add(halo);
        break;
      default:
        g.add(box(THREE, 0.36, 0.05, 0.36, this.mats.dark, 0, 0.36, 0));
        break;
    }
    if (this.opts.shadows !== false) g.traverse(function (o) { if (o.isMesh) o.castShadow = true; });
    return this;
  };

  Character.prototype.setBackbling = function (shape, color) {
    var THREE = this.THREE;
    disposeGroup(this.bbGroup);
    var g = this.bbGroup;
    var c = color || '#37e5ff';
    var m = std(THREE, new THREE.Color(c).getHex(), {
      roughness: 0.55, metalness: 0.2,
      emissive: new THREE.Color(c), emissiveIntensity: 0.12
    });
    var dark = std(THREE, 0x252c3d, { roughness: 0.85 });
    switch (shape) {
      case 'pack':
        g.add(box(THREE, 0.36, 0.42, 0.16, dark, 0, 0.1, -0.06));
        g.add(box(THREE, 0.2, 0.1, 0.04, m, 0, 0.1, -0.15));
        break;
      case 'wings':
        for (var w = 0; w < 2; w++) {
          var wing = box(THREE, 0.07, 0.46, 0.3, m, w ? 0.26 : -0.26, 0.16, -0.12);
          wing.rotation.z = w ? -0.24 : 0.24;
          g.add(wing);
        }
        break;
      case 'beacon':
        g.add(box(THREE, 0.16, 0.32, 0.14, dark, 0, 0.08, -0.06));
        var tip = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), m);
        tip.position.set(0, 0.28, -0.06);
        g.add(tip);
        break;
      case 'core':
        var core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.14, 0), m);
        core.position.set(0, 0.14, -0.09);
        g.add(core);
        break;
      default:
        break;
    }
    if (this.opts.shadows !== false) g.traverse(function (o) { if (o.isMesh) o.castShadow = true; });
    return this;
  };

  Character.prototype.setWeapon = function (ref, color, rebuild) {
    var THREE = this.THREE;
    if (rebuild !== false && this.weaponModel) {
      this.weaponMount.remove(this.weaponModel.group);
      this.weaponModel.dispose();
      this.weaponModel = null;
    }
    if (!ref) {
      this.weaponModel = null;
      this.currentWeapon = null;
      return this;
    }
    if (!this.weaponModel || rebuild !== false) {
      this.weaponModel = new WeaponModel(THREE, ref, color || '#37e5ff');
      this.weaponModel.group.position.set(0, 0, -0.1);
      this.weaponMount.add(this.weaponModel.group);
    }
    this.currentWeapon = { ref: ref, color: color };
    return this;
  };

  Character.prototype.muzzleWorld = function (out) {
    var THREE = this.THREE;
    var v = out || new THREE.Vector3();
    if (this.weaponModel && this.weaponModel.muzzle) {
      this.weaponModel.muzzle.getWorldPosition(v);
    } else {
      v.set(this.group.position.x, this.group.position.y + 1.25, this.group.position.z);
    }
    return v;
  };

  Character.prototype.setDead = function (dead) {
    this.dead = !!dead;
    if (!this.dead) this.group.rotation.x = 0;
  };

  /**
   * s = { speed, grounded, aiming, crouch, pitch, recoil, dead, t }
   */
  Character.prototype.update = function (dt, s) {
    s = s || {};
    var U = BN.util;
    this.time += dt;
    var speed = s.speed || 0;
    var moving = speed > 0.35;
    var aim = !!s.aiming && !this.dead;
    this.phase += dt * (moving ? 5.2 + speed * 1.15 : 2.1);
    var swing = moving ? U.clamp(speed / 6.5, 0, 1) * 0.85 : 0;

    if (this.dead) {
      this.group.rotation.x = U.damp(this.group.rotation.x, -1.42, 7, dt);
      this.legL.rotation.x = U.damp(this.legL.rotation.x, -0.3, 6, dt);
      this.legR.rotation.x = U.damp(this.legR.rotation.x, 0.35, 6, dt);
      this.armL.rotation.x = U.damp(this.armL.rotation.x, -0.6, 6, dt);
      this.armR.rotation.x = U.damp(this.armR.rotation.x, -0.5, 6, dt);
      this.upper.position.y = U.damp(this.upper.position.y, 0.94, 6, dt);
      return;
    }

    var grounded = s.grounded !== false;
    if (!grounded) {
      this.legL.rotation.x = U.damp(this.legL.rotation.x, -0.55, 10, dt);
      this.legR.rotation.x = U.damp(this.legR.rotation.x, 0.35, 10, dt);
    } else {
      this.legL.rotation.x = U.damp(this.legL.rotation.x, Math.sin(this.phase) * swing, 16, dt);
      this.legR.rotation.x = U.damp(this.legR.rotation.x, -Math.sin(this.phase) * swing, 16, dt);
    }

    var recoil = s.recoil || 0;
    if (aim) {
      this.armR.rotation.x = U.damp(this.armR.rotation.x, -1.46 - recoil * 0.4, 14, dt);
      this.armL.rotation.x = U.damp(this.armL.rotation.x, -1.3 - recoil * 0.4, 14, dt);
      this.armR.rotation.z = U.damp(this.armR.rotation.z, 0.3, 12, dt);
      this.armL.rotation.z = U.damp(this.armL.rotation.z, -0.42, 12, dt);
    } else {
      this.armR.rotation.x = U.damp(this.armR.rotation.x, grounded ? Math.sin(this.phase) * swing : -1.1, 12, dt);
      this.armL.rotation.x = U.damp(this.armL.rotation.x, grounded ? -Math.sin(this.phase) * swing : -0.9, 12, dt);
      this.armR.rotation.z = U.damp(this.armR.rotation.z, -0.06, 12, dt);
      this.armL.rotation.z = U.damp(this.armL.rotation.z, 0.06, 12, dt);
    }

    var crouchDrop = s.crouch ? 0.24 : 0;
    var bob = moving && grounded ? Math.sin(this.phase * 2) * 0.018 : Math.sin(this.time * 1.7) * 0.008;
    this.upper.position.y = U.damp(this.upper.position.y, 0.94 - crouchDrop + bob, 12, dt);
    this.upper.rotation.y = U.damp(this.upper.rotation.y, 0, 8, dt);

    var pitch = s.pitch || 0;
    this.headPivot.rotation.x = U.damp(this.headPivot.rotation.x, U.clamp(-pitch * 0.45, -0.4, 0.35), 10, dt);

    if (this.weaponMount) {
      this.weaponMount.position.y = U.damp(this.weaponMount.position.y, (aim ? 1.36 : 1.16) + bob * 0.5, 12, dt);
      this.weaponMount.position.z = U.damp(this.weaponMount.position.z, (aim ? 0.34 : 0.14) - recoil * 0.09, 18, dt);
      this.weaponMount.rotation.x = U.damp(this.weaponMount.rotation.x, aim ? 0 : 0.12, 10, dt);
    }
  };

  Character.prototype.dispose = function () {
    if (this.group.parent) this.group.parent.remove(this.group);
    disposeGroup(this.group);
  };

  BN.disposeGroup = disposeGroup;
  BN.charMat = std;
})();
