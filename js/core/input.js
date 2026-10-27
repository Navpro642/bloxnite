/* ==========================================================================
   BLOXNITE — input
   Owns keyboard state, pointer lock and mouse deltas. Gameplay and UI both
   read from here so there is exactly one source of input truth.
   ========================================================================== */
(function () {
  var BN = (window.BN = window.BN || {});

  var keys = Object.create(null);
  var justPressed = Object.create(null);
  var mouse = { dx: 0, dy: 0, left: false, right: false, leftPressed: false, rightPressed: false, wheel: 0 };
  var locked = false;
  var target = null;
  var sensitivity = 1;
  var invertY = false;
  var lockListeners = [];
  var blockGameplay = false;

  function onKeyDown(e) {
    var code = e.code;
    if (e.repeat) { return; }
    keys[code] = true;
    justPressed[code] = true;
    // Prevent page scroll from game keys, but never swallow typing in inputs
    var tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].indexOf(code) >= 0) {
      e.preventDefault();
    }
  }
  function onKeyUp(e) { keys[e.code] = false; }

  function onMouseMove(e) {
    if (!locked) return;
    mouse.dx += (e.movementX || 0) * sensitivity;
    mouse.dy += (e.movementY || 0) * sensitivity * (invertY ? -1 : 1);
  }
  function onMouseDown(e) {
    if (!locked) return;
    if (e.button === 0) { mouse.left = true; mouse.leftPressed = true; }
    if (e.button === 2) { mouse.right = true; mouse.rightPressed = true; }
  }
  function onMouseUp(e) {
    if (e.button === 0) mouse.left = false;
    if (e.button === 2) mouse.right = false;
  }
  function onWheel(e) {
    if (!locked) return;
    mouse.wheel += Math.sign(e.deltaY);
    e.preventDefault();
  }
  function onContext(e) { e.preventDefault(); }

  function onLockChange() {
    var wasLocked = locked;
    locked = document.pointerLockElement === target;
    if (!locked) {
      mouse.left = false; mouse.right = false;
      mouse.dx = 0; mouse.dy = 0;
    }
    if (wasLocked !== locked) lockListeners.forEach(function (fn) { fn(locked); });
  }

  function onBlur() {
    Object.keys(keys).forEach(function (k) { keys[k] = false; });
    mouse.left = false; mouse.right = false;
  }

  var Input = (BN.Input = {
    init: function (canvas) {
      target = canvas || document.body;
      window.addEventListener('keydown', onKeyDown, false);
      window.addEventListener('keyup', onKeyUp, false);
      window.addEventListener('blur', onBlur, false);
      document.addEventListener('mousemove', onMouseMove, false);
      document.addEventListener('mousedown', onMouseDown, false);
      document.addEventListener('mouseup', onMouseUp, false);
      document.addEventListener('contextmenu', onContext, false);
      document.addEventListener('pointerlockchange', onLockChange, false);
      window.addEventListener('wheel', onWheel, { passive: false });
    },
    setTarget: function (el) { target = el; },
    setSensitivity: function (v) { sensitivity = Math.max(0.1, v || 1); },
    setInvertY: function (v) { invertY = !!v; },
    setBlocked: function (v) { blockGameplay = !!v; if (v) { mouse.left = mouse.right = false; } },
    isBlocked: function () { return blockGameplay; },

    lock: function () {
      if (!target || !target.requestPointerLock) return;
      var p = target.requestPointerLock();
      if (p && p.catch) p.catch(function () { /* browser refused; retry on next click */ });
    },
    unlock: function () { if (document.pointerLockElement) document.exitPointerLock(); },
    isLocked: function () { return locked; },
    onLockChange: function (fn) { lockListeners.push(fn); },

    down: function (code) { return !!keys[code]; },
    pressed: function (code) { return !!justPressed[code]; },
    anyDown: function (codes) { for (var i = 0; i < codes.length; i++) if (keys[codes[i]]) return true; return false; },

    mouse: mouse,
    /* movement axis in -1..1 */
    axis: function () {
      var x = 0, z = 0;
      if (keys.KeyA || keys.ArrowLeft) x -= 1;
      if (keys.KeyD || keys.ArrowRight) x += 1;
      if (keys.KeyW || keys.ArrowUp) z += 1;
      if (keys.KeyS || keys.ArrowDown) z -= 1;
      var len = Math.hypot(x, z);
      if (len > 1) { x /= len; z /= len; }
      return { x: x, z: z };
    },
    /* called once at the end of each frame by the game loop */
    endFrame: function () {
      justPressed = Object.create(null);
      mouse.dx = 0; mouse.dy = 0;
      mouse.wheel = 0;
      mouse.leftPressed = false;
      mouse.rightPressed = false;
    },
    clearMouse: function () { mouse.dx = 0; mouse.dy = 0; }
  });
})();
