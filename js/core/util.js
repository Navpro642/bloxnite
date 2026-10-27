/* ==========================================================================
   BLOXNITE — small math / geometry helpers
   ========================================================================== */
(function () {
  var BN = (window.BN = window.BN || {});
  var U = (BN.util = {});

  U.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  U.lerp = function (a, b, t) { return a + (b - a) * t; };
  U.damp = function (a, b, lambda, dt) { return U.lerp(a, b, 1 - Math.exp(-lambda * dt)); };
  U.smoothstep = function (e0, e1, x) {
    var t = U.clamp((x - e0) / (e1 - e0 || 1e-6), 0, 1);
    return t * t * (3 - 2 * t);
  };
  U.rand = function (a, b) { if (b === undefined) { b = a; a = 0; } return a + Math.random() * (b - a); };
  U.randi = function (a, b) { return Math.floor(a + Math.random() * (b - a + 1)); };
  U.pick = function (arr) { return arr[Math.floor(Math.random() * arr.length)]; };
  U.dist = function (ax, az, bx, bz) { return Math.hypot(ax - bx, az - bz); };
  U.sign = function (v) { return v < 0 ? -1 : 1; };

  U.angleDelta = function (a, b) {
    var d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  };
  U.angleToward = function (a, b, maxStep) {
    return a + U.clamp(U.angleDelta(a, b), -maxStep, maxStep);
  };

  /* deterministic value noise ------------------------------------------------ */
  function hash(x, y) {
    var n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
    return n - Math.floor(n);
  }
  U.noise2 = function (x, y) {
    var xi = Math.floor(x), yi = Math.floor(y);
    var xf = x - xi, yf = y - yi;
    var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    var a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return U.lerp(U.lerp(a, b, u), U.lerp(c, d, u), v);
  };
  U.fbm = function (x, y, oct) {
    oct = oct || 3;
    var sum = 0, amp = 0.5, freq = 1, norm = 0;
    for (var i = 0; i < oct; i++) {
      sum += U.noise2(x * freq, y * freq) * amp;
      norm += amp;
      amp *= 0.5;
      freq *= 2.03;
    }
    return sum / norm;
  };

  /* ray / AABB (slab method) ------------------------------------------------ */
  U.rayAABB = function (ox, oy, oz, dx, dy, dz, box) {
    var tmin = 0, tmax = Infinity, t1, t2, inv;
    // X
    inv = 1 / (dx || 1e-9);
    t1 = (box.minX - ox) * inv; t2 = (box.maxX - ox) * inv;
    if (t1 > t2) { var tmp = t1; t1 = t2; t2 = tmp; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    // Y
    inv = 1 / (dy || 1e-9);
    t1 = (box.minY - oy) * inv; t2 = (box.maxY - oy) * inv;
    if (t1 > t2) { var t3 = t1; t1 = t2; t2 = t3; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    // Z
    inv = 1 / (dz || 1e-9);
    t1 = (box.minZ - oz) * inv; t2 = (box.maxZ - oz) * inv;
    if (t1 > t2) { var t4 = t1; t1 = t2; t2 = t4; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmax < tmin || tmax < 0) return Infinity;
    return tmin > 0 ? tmin : 0;
  };

  /* ray / sphere ------------------------------------------------------------ */
  U.raySphere = function (ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
    var lx = ox - cx, ly = oy - cy, lz = oz - cz;
    var b = lx * dx + ly * dy + lz * dz;
    var c = lx * lx + ly * ly + lz * lz - r * r;
    var disc = b * b - c;
    if (disc < 0) return Infinity;
    var sq = Math.sqrt(disc);
    var t = -b - sq;
    if (t < 0) t = -b + sq;
    return t < 0 ? Infinity : t;
  };

  U.fmtTime = function (sec) {
    sec = Math.max(0, Math.floor(sec));
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  };

  U.todayKey = function () { return new Date().toISOString().slice(0, 10); };
})();
