/* ==========================================================================
   BLOXNITE — local profile persistence (cosmetics, XP, settings)
   ========================================================================== */
(function () {
  var BN = (window.BN = window.BN || {});
  var KEY = 'bloxnite.profile.v2';

  var DEFAULTS = {
    name: 'Recruit',
    xp: 0,
    coins: 300,
    loadout: {
      outfit: 'outfit_vanguard',
      variants: { outfit_vanguard: 0 },
      hat: 'hat_cap',
      backbling: 'bb_none',
      wrap: 'wrap_cyan'
    },
    stats: { matches: 0, wins: 0, kills: 0, bestPlacement: 0, stormDeaths: 0, damage: 0, timePlayed: 0 },
    settings: {
      master: 0.8, sfx: 0.7, music: 0.35,
      sensitivity: 1.0, fov: 75,
      shadows: true, showFps: false, invertY: false
    }
  };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function merge(base, over) {
    var out = clone(base);
    if (!over || typeof over !== 'object') return out;
    Object.keys(over).forEach(function (k) {
      var v = over[k];
      if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object') {
        out[k] = merge(out[k], v);
      } else if (v !== undefined) {
        out[k] = v;
      }
    });
    return out;
  }

  var Save = (BN.Save = {
    profile: clone(DEFAULTS),

    load: function () {
      try {
        var raw = localStorage.getItem(KEY);
        if (raw) Save.profile = merge(DEFAULTS, JSON.parse(raw));
      } catch (e) {
        console.warn('[Bloxnite] profile load failed, using defaults', e);
        Save.profile = clone(DEFAULTS);
      }
      Save.sanitize();
      return Save.profile;
    },

    save: function () {
      try { localStorage.setItem(KEY, JSON.stringify(Save.profile)); }
      catch (e) { console.warn('[Bloxnite] profile save failed', e); }
    },

    sanitize: function () {
      var p = Save.profile;
      if (!p.loadout) p.loadout = clone(DEFAULTS.loadout);
      if (!p.loadout.variants) p.loadout.variants = {};
      var outfit = BN.cosmeticById(p.loadout.outfit);
      if (!outfit || outfit.category !== 'outfit') p.loadout.outfit = 'outfit_vanguard';
      if (!BN.cosmeticById(p.loadout.hat)) p.loadout.hat = 'hat_none';
      if (!BN.cosmeticById(p.loadout.backbling)) p.loadout.backbling = 'bb_none';
      if (!BN.cosmeticById(p.loadout.wrap)) p.loadout.wrap = 'wrap_steel';
      p.xp = Math.max(0, p.xp || 0);
      p.coins = Math.max(0, p.coins || 0);
    },

    reset: function () {
      Save.profile = clone(DEFAULTS);
      Save.save();
      return Save.profile;
    },

    level: function () { return BN.levelInfo(Save.profile.xp).level; },

    /* true when the player can equip the cosmetic at their current level */
    owned: function (cosmetic) {
      if (!cosmetic) return false;
      if (cosmetic.category === 'emote' && cosmetic.implemented === false) return false;
      return Save.level() >= (cosmetic.unlockLevel || 1);
    },

    outfit: function () {
      var p = Save.profile;
      var o = BN.cosmeticById(p.loadout.outfit) || BN.OUTFITS[0];
      var idx = p.loadout.variants[o.id] || 0;
      var v = o.variants[Math.min(idx, o.variants.length - 1)] || o.variants[0];
      return { outfit: o, variant: v, variantIndex: Math.min(idx, o.variants.length - 1) };
    },

    cosmetic: function (id) { return BN.cosmeticById(id); },

    /* equipped look, ready for the character builder */
    palette: function () {
      var look = Save.outfit();
      var hat = BN.cosmeticById(Save.profile.loadout.hat) || BN.HATS[0];
      var bb = BN.cosmeticById(Save.profile.loadout.backbling) || BN.BACKBLINGS[0];
      var wrap = BN.cosmeticById(Save.profile.loadout.wrap) || BN.WRAPS[0];
      return {
        shirt: look.variant.shirt,
        pants: look.variant.pants,
        skin: look.variant.skin,
        accent: look.variant.accent,
        hat: hat.shape,
        hatColor: look.variant.accent,
        backbling: bb.shape,
        wrap: wrap.color,
        outfitName: look.outfit.name,
        variantName: look.variant.name
      };
    },

    /* award post-match rewards; returns {xp, coins, leveledTo} */
    award: function (result) {
      var p = Save.profile;
      var before = Save.level();
      var xp = 40 + (result.kills || 0) * 60 + (result.placement ? Math.max(0, 11 - result.placement) * 25 : 0) + (result.win ? 250 : 0);
      var coins = 25 + (result.kills || 0) * 12 + (result.win ? 150 : 0);
      p.xp += xp;
      p.coins += coins;
      p.stats.matches += 1;
      p.stats.kills += result.kills || 0;
      p.stats.damage += Math.round(result.damage || 0);
      p.stats.timePlayed += result.time || 0;
      if (result.win) p.stats.wins += 1;
      if (result.placement) {
        p.stats.bestPlacement = p.stats.bestPlacement
          ? Math.min(p.stats.bestPlacement, result.placement)
          : result.placement;
      }
      Save.save();
      return { xp: xp, coins: coins, leveledTo: Save.level() > before ? Save.level() : 0 };
    }
  });

  BN.Save.DEFAULTS = DEFAULTS;
})();
