/* ==========================================================================
   BLOXNITE — data definitions
   Pure data: no rendering, no input, no DOM. Safe to unit test in Node.
   ========================================================================== */
(function () {
  var BN = (window.BN = window.BN || {});

  /* ------------------------------ rarities ------------------------------ */
  BN.RARITIES = {
    common:    { id: 'common',    name: 'Common',    color: '#8b95a8', damageMul: 1.00, order: 0 },
    uncommon:  { id: 'uncommon',  name: 'Uncommon',  color: '#4ade80', damageMul: 1.06, order: 1 },
    rare:      { id: 'rare',      name: 'Rare',      color: '#3b9dff', damageMul: 1.12, order: 2 },
    epic:      { id: 'epic',      name: 'Epic',      color: '#a855f7', damageMul: 1.20, order: 3 },
    legendary: { id: 'legendary', name: 'Legendary', color: '#ffb020', damageMul: 1.30, order: 4 },
    mythic:    { id: 'mythic',    name: 'Mythic',    color: '#ff7a18', damageMul: 1.45, order: 5 }
  };
  BN.RARITY_LIST = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
  BN.rarity = function (id) { return BN.RARITIES[id] || BN.RARITIES.common; };

  /* ------------------------------ ammunition ---------------------------- */
  BN.AMMO = {
    light:  { id: 'light',  name: 'Light Ammo',  short: 'LIGHT',  color: '#c9d4ff', max: 999 },
    medium: { id: 'medium', name: 'Medium Ammo', short: 'MEDIUM', color: '#8fe3a8', max: 999 },
    heavy:  { id: 'heavy',  name: 'Heavy Ammo',  short: 'HEAVY',  color: '#ffc46b', max: 999 },
    shells: { id: 'shells', name: 'Shells',      short: 'SHELLS', color: '#ff9a9a', max: 200 }
  };

  /* --------------------------- weapon archetypes ------------------------ */
  /* Data only. Rendering/input live in js/game/*.js and read from here.    */
  var ARCHETYPES = [
    {
      key: 'ar', name: 'Ranger Assault Rifle', category: 'assault', model: 'rifle',
      ammo: 'medium', fireMode: 'auto', damage: 30, fireRate: 5.4, mag: 30, reload: 2.4,
      spread: 0.85, recoil: 0.85, range: 120, falloff: 0.55, pellets: 1, moveMul: 0.92,
      sound: { fire: 'rifle', reload: 'magReload' },
      rarities: ['common', 'uncommon', 'rare', 'epic', 'legendary']
    },
    {
      key: 'smg', name: 'Vector SMG', category: 'smg', model: 'smg',
      ammo: 'light', fireMode: 'auto', damage: 14, fireRate: 11, mag: 30, reload: 2.0,
      spread: 2.3, recoil: 0.5, range: 62, falloff: 0.45, pellets: 1, moveMul: 1.0,
      sound: { fire: 'smg', reload: 'magReload' },
      rarities: ['common', 'uncommon', 'rare', 'epic', 'legendary']
    },
    {
      key: 'shotgun', name: 'Breacher Shotgun', category: 'shotgun', model: 'shotgun',
      ammo: 'shells', fireMode: 'pump', damage: 11, fireRate: 0.85, mag: 5, reload: 3.4,
      spread: 5.4, recoil: 2.4, range: 26, falloff: 0.15, pellets: 8, moveMul: 0.96,
      sound: { fire: 'shotgun', reload: 'pumpReload' },
      rarities: ['common', 'uncommon', 'rare', 'epic', 'legendary']
    },
    {
      key: 'pistol', name: 'Sidearm Pistol', category: 'pistol', model: 'pistol',
      ammo: 'light', fireMode: 'semi', damage: 25, fireRate: 6.2, mag: 16, reload: 1.6,
      spread: 1.15, recoil: 0.7, range: 70, falloff: 0.5, pellets: 1, moveMul: 1.0,
      sound: { fire: 'pistol', reload: 'magReload' },
      rarities: ['common', 'uncommon', 'rare', 'epic']
    },
    {
      key: 'sniper', name: 'Longshot Sniper', category: 'sniper', model: 'sniper',
      ammo: 'heavy', fireMode: 'semi', damage: 96, fireRate: 0.55, mag: 5, reload: 3.2,
      spread: 0.12, recoil: 3.2, range: 400, falloff: 0.9, pellets: 1, scope: 2.6, moveMul: 0.8,
      sound: { fire: 'sniper', reload: 'boltReload' },
      rarities: ['rare', 'epic', 'legendary']
    },
    {
      key: 'cannon', name: 'Arc Cannon', category: 'special', model: 'cannon',
      ammo: 'heavy', fireMode: 'single', damage: 62, fireRate: 0.7, mag: 3, reload: 3.8,
      spread: 0.3, recoil: 2.8, range: 150, falloff: 1.0, pellets: 1, projectile: true,
      splash: 6.5, splashDamage: 38, moveMul: 0.85,
      sound: { fire: 'cannon', reload: 'boltReload' },
      rarities: ['mythic']
    }
  ];

  /* Generated weapon table: one definition per archetype x rarity. */
  BN.WEAPON_ARCHETYPES = ARCHETYPES;
  BN.WEAPONS = {};
  BN.WEAPON_IDS = [];

  ARCHETYPES.forEach(function (a) {
    a.rarities.forEach(function (rid) {
      var r = BN.RARITIES[rid];
      var id = a.key + '_' + rid;
      BN.WEAPONS[id] = {
        id: id,
        archetype: a.key,
        name: a.name,
        category: a.category,
        rarity: rid,
        rarityColor: r.color,
        damage: Math.round(a.damage * r.damageMul * 10) / 10,
        fireRate: a.fireRate,
        magazine: a.mag,
        reloadDuration: a.reload,
        ammoType: a.ammo,
        spread: a.spread,
        recoil: a.recoil,
        range: a.range,
        falloff: a.falloff,
        pellets: a.pellets,
        fireMode: a.fireMode,
        projectiles: !!a.projectile,
        splash: a.splash || 0,
        splashDamage: a.splashDamage || 0,
        scope: a.scope || 0,
        moveMul: a.moveMul || 1,
        modelRef: a.model,
        iconRef: a.model,
        soundRef: a.sound,
        /* effective damage at a given distance (linear falloff past 35% range) */
        damageAt: function (dist) {
          var start = this.range * 0.35;
          if (dist <= start) return this.damage;
          var t = Math.min(1, (dist - start) / Math.max(1, this.range - start));
          return this.damage * (1 - t * (1 - this.falloff));
        }
      };
      BN.WEAPON_IDS.push(id);
    });
  });

  /* Distribution used by ground loot + bots. */
  BN.RARITY_WEIGHTS = { common: 34, uncommon: 26, rare: 20, epic: 12, legendary: 6, mythic: 2 };

  /* ------------------------------ consumables --------------------------- */
  BN.CONSUMABLES = {
    medkit: { id: 'medkit', name: 'Med Kit', category: 'heal', heal: 60, useTime: 2.0, maxStack: 3, rarity: 'uncommon', icon: 'medkit' },
    shieldpot: { id: 'shieldpot', name: 'Shield Potion', category: 'shield', shield: 50, useTime: 2.8, maxStack: 3, rarity: 'rare', icon: 'shieldpot' },
    minishield: { id: 'minishield', name: 'Mini Shield', category: 'shield', shield: 25, useTime: 1.4, maxStack: 6, rarity: 'uncommon', icon: 'minishield' }
  };

  /* ------------------------------ cosmetics ----------------------------- */
  /* Every cosmetic: id, name, category, rarity, preview (generated), owned  */
  BN.OUTFITS = [
    {
      id: 'outfit_vanguard', name: 'Vanguard', category: 'outfit', rarity: 'rare', unlockLevel: 1,
      variants: [
        { name: 'Cobalt', shirt: '#2f6bff', pants: '#1b2550', skin: '#f0c39d', accent: '#37e5ff' },
        { name: 'Slate', shirt: '#4a5580', pants: '#232a45', skin: '#d9a97f', accent: '#9fb6ff' },
        { name: 'Frost', shirt: '#bfe6ff', pants: '#3b5b7a', skin: '#f5d3b3', accent: '#37e5ff' }
      ]
    },
    {
      id: 'outfit_nomad', name: 'Nomad', category: 'outfit', rarity: 'uncommon', unlockLevel: 1,
      variants: [
        { name: 'Dune', shirt: '#c9a15c', pants: '#6b5232', skin: '#e6b58c', accent: '#ffd27a' },
        { name: 'Moss', shirt: '#6f8f4a', pants: '#3c4a2b', skin: '#d8a97f', accent: '#b6e36a' },
        { name: 'Ash', shirt: '#8a8f9c', pants: '#42474f', skin: '#e8c4a3', accent: '#d6dbe8' }
      ]
    },
    {
      id: 'outfit_specter', name: 'Specter', category: 'outfit', rarity: 'epic', unlockLevel: 3,
      variants: [
        { name: 'Phantom', shirt: '#e8ecff', pants: '#3a2c6b', skin: '#efe0d2', accent: '#a855f7' },
        { name: 'Wraith', shirt: '#2b2440', pants: '#171226', skin: '#d9cec6', accent: '#a855f7' },
        { name: 'Veil', shirt: '#8f7ad6', pants: '#2a2140', skin: '#f0ddcc', accent: '#d3b6ff' }
      ]
    },
    {
      id: 'outfit_tundra', name: 'Tundra', category: 'outfit', rarity: 'rare', unlockLevel: 5,
      variants: [
        { name: 'Glacier', shirt: '#7fd8e8', pants: '#1e3a52', skin: '#f2d6bd', accent: '#e6faff' },
        { name: 'Polar', shirt: '#e9f2f7', pants: '#465a6b', skin: '#e3c1a3', accent: '#8fe6ff' },
        { name: 'Deep', shirt: '#2c6d8f', pants: '#12303f', skin: '#d7b294', accent: '#6fe0ff' }
      ]
    },
    {
      id: 'outfit_circuit', name: 'Circuit', category: 'outfit', rarity: 'epic', unlockLevel: 7,
      variants: [
        { name: 'Neon', shirt: '#134a3a', pants: '#0d2420', skin: '#c7a98c', accent: '#4ade80' },
        { name: 'Volt', shirt: '#2b2f36', pants: '#171a1f', skin: '#b99a80', accent: '#eaff6b' },
        { name: 'Pulse', shirt: '#123e56', pants: '#0b1f2c', skin: '#a88f76', accent: '#37e5ff' }
      ]
    },
    {
      id: 'outfit_ember', name: 'Ember', category: 'outfit', rarity: 'legendary', unlockLevel: 9,
      variants: [
        { name: 'Forge', shirt: '#b8501e', pants: '#3a2018', skin: '#e0b48f', accent: '#ffb020' },
        { name: 'Cinder', shirt: '#5e2a2a', pants: '#26121a', skin: '#c99a78', accent: '#ff7a18' },
        { name: 'Blaze', shirt: '#e08a2a', pants: '#4a2a12', skin: '#f0cba6', accent: '#ffd98a' }
      ]
    },
    {
      id: 'outfit_orbit', name: 'Orbit', category: 'outfit', rarity: 'epic', unlockLevel: 12,
      variants: [
        { name: 'Nebula', shirt: '#4b2f8a', pants: '#1e1740', skin: '#e7cdb5', accent: '#ff6bd6' },
        { name: 'Comet', shirt: '#1f3f7a', pants: '#111d3a', skin: '#dcc0a8', accent: '#8fb8ff' },
        { name: 'Void', shirt: '#221a33', pants: '#100c1c', skin: '#b99980', accent: '#a855f7' }
      ]
    },
    {
      id: 'outfit_ronin', name: 'Ronin', category: 'outfit', rarity: 'legendary', unlockLevel: 15,
      variants: [
        { name: 'Crimson', shirt: '#a3252f', pants: '#2a1416', skin: '#e2b795', accent: '#ffd7a0' },
        { name: 'Graphite', shirt: '#3a3f4a', pants: '#1b1f26', skin: '#d1ab8a', accent: '#c8d2e0' },
        { name: 'Jade', shirt: '#1f5c46', pants: '#12261f', skin: '#dcb492', accent: '#8ef0c0' }
      ]
    }
  ];

  BN.HATS = [
    { id: 'hat_none', name: 'No Headgear', category: 'hat', rarity: 'common', unlockLevel: 1, shape: 'none' },
    { id: 'hat_cap', name: 'Field Cap', category: 'hat', rarity: 'common', unlockLevel: 1, shape: 'cap' },
    { id: 'hat_band', name: 'Runner Band', category: 'hat', rarity: 'uncommon', unlockLevel: 2, shape: 'band' },
    { id: 'hat_helm', name: 'Ranger Helm', category: 'hat', rarity: 'rare', unlockLevel: 4, shape: 'helm' },
    { id: 'hat_visor', name: 'Pulse Visor', category: 'hat', rarity: 'epic', unlockLevel: 6, shape: 'visor' },
    { id: 'hat_crown', name: 'Rift Crown', category: 'hat', rarity: 'legendary', unlockLevel: 10, shape: 'crown' },
    { id: 'hat_horns', name: 'Storm Horns', category: 'hat', rarity: 'epic', unlockLevel: 13, shape: 'horns' },
    { id: 'hat_halo', name: 'Aurora Halo', category: 'hat', rarity: 'mythic', unlockLevel: 18, shape: 'halo' }
  ];

  BN.BACKBLINGS = [
    { id: 'bb_none', name: 'No Back Bling', category: 'backbling', rarity: 'common', unlockLevel: 1, shape: 'none' },
    { id: 'bb_pack', name: 'Field Pack', category: 'backbling', rarity: 'uncommon', unlockLevel: 1, shape: 'pack' },
    { id: 'bb_wings', name: 'Glide Wings', category: 'backbling', rarity: 'epic', unlockLevel: 8, shape: 'wings' },
    { id: 'bb_beacon', name: 'Signal Beacon', category: 'backbling', rarity: 'rare', unlockLevel: 11, shape: 'beacon' },
    { id: 'bb_core', name: 'Rift Core', category: 'backbling', rarity: 'legendary', unlockLevel: 16, shape: 'core' }
  ];

  BN.WRAPS = [
    { id: 'wrap_steel', name: 'Steel Wrap', category: 'wrap', rarity: 'common', unlockLevel: 1, color: '#8f9bb0' },
    { id: 'wrap_cyan', name: 'Cyan Wrap', category: 'wrap', rarity: 'uncommon', unlockLevel: 1, color: '#37e5ff' },
    { id: 'wrap_violet', name: 'Violet Wrap', category: 'wrap', rarity: 'rare', unlockLevel: 4, color: '#a855f7' },
    { id: 'wrap_toxic', name: 'Toxic Wrap', category: 'wrap', rarity: 'rare', unlockLevel: 6, color: '#4ade80' },
    { id: 'wrap_ember', name: 'Ember Wrap', category: 'wrap', rarity: 'epic', unlockLevel: 9, color: '#ff7a18' },
    { id: 'wrap_gold', name: 'Bullion Wrap', category: 'wrap', rarity: 'legendary', unlockLevel: 14, color: '#ffb020' }
  ];

  /* Emotes are declared but NOT implemented in gameplay — surfaced as locked. */
  BN.EMOTES = [
    { id: 'emote_wave', name: 'Wave', category: 'emote', rarity: 'common', unlockLevel: 1, implemented: false },
    { id: 'emote_dance', name: 'Shuffle', category: 'emote', rarity: 'rare', unlockLevel: 5, implemented: false },
    { id: 'emote_flex', name: 'Flex', category: 'emote', rarity: 'epic', unlockLevel: 9, implemented: false }
  ];

  BN.COSMETIC_CATEGORIES = [
    { id: 'outfit', name: 'Outfits', list: BN.OUTFITS },
    { id: 'hat', name: 'Headgear', list: BN.HATS },
    { id: 'backbling', name: 'Back Bling', list: BN.BACKBLINGS },
    { id: 'wrap', name: 'Wraps', list: BN.WRAPS },
    { id: 'emote', name: 'Emotes', list: BN.EMOTES }
  ];

  BN.cosmeticById = function (id) {
    var all = [].concat(BN.OUTFITS, BN.HATS, BN.BACKBLINGS, BN.WRAPS, BN.EMOTES);
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    return null;
  };

  /* ------------------------------ progression --------------------------- */
  BN.XP_PER_LEVEL = 1200;
  BN.levelInfo = function (xp) {
    xp = Math.max(0, xp || 0);
    var level = Math.floor(xp / BN.XP_PER_LEVEL) + 1;
    var into = xp - (level - 1) * BN.XP_PER_LEVEL;
    return { level: level, into: into, need: BN.XP_PER_LEVEL, pct: (into / BN.XP_PER_LEVEL) * 100 };
  };

  /* ------------------------------ bot names ----------------------------- */
  BN.BOT_NAMES = [
    'Rook', 'Perch', 'Halcyon', 'Dune', 'Kestrel', 'Marrow', 'Onyx', 'Pike', 'Quill', 'Rivet',
    'Saber', 'Talon', 'Umber', 'Vesper', 'Wisp', 'Yarrow', 'Zephyr', 'Basalt', 'Cinder', 'Drift',
    'Echo', 'Flint', 'Gale', 'Hollow', 'Ivory', 'Jett', 'Kite', 'Lumen', 'Mica', 'Nimbus'
  ];

  /* --------------------------- weapon icons (svg) ----------------------- */
  var ICON_PATHS = {
    rifle: '<rect x="2" y="10" width="26" height="4" rx="1"/><rect x="9" y="14" width="6" height="7" rx="1"/><rect x="15" y="14" width="3" height="4"/><rect x="28" y="8" width="11" height="4" rx="1"/><rect x="35" y="12" width="4" height="6" rx="1"/><rect x="20" y="7" width="7" height="3" rx="1"/>',
    smg: '<rect x="6" y="9" width="22" height="5" rx="1"/><rect x="11" y="14" width="5" height="9" rx="1"/><rect x="28" y="10" width="9" height="3" rx="1"/><rect x="20" y="6" width="6" height="3" rx="1"/>',
    shotgun: '<rect x="2" y="10" width="30" height="4" rx="1"/><rect x="8" y="14" width="7" height="3" rx="1"/><rect x="14" y="13" width="10" height="5" rx="1"/><rect x="32" y="9" width="12" height="3" rx="1"/><rect x="24" y="15" width="5" height="4" rx="1"/>',
    pistol: '<rect x="14" y="8" width="18" height="5" rx="1"/><rect x="16" y="13" width="7" height="10" rx="2"/><rect x="26" y="13" width="4" height="3"/>',
    sniper: '<rect x="2" y="11" width="34" height="3" rx="1"/><rect x="36" y="9" width="10" height="3" rx="1"/><rect x="14" y="14" width="6" height="7" rx="1"/><rect x="20" y="5" width="12" height="4" rx="1"/><rect x="22" y="14" width="4" height="4" rx="1"/>',
    cannon: '<rect x="4" y="9" width="24" height="7" rx="2"/><rect x="28" y="10" width="14" height="5" rx="2"/><rect x="12" y="16" width="7" height="8" rx="1"/><circle cx="40" cy="12.5" r="3"/>',
    medkit: '<rect x="8" y="8" width="32" height="22" rx="3"/><rect x="20" y="12" width="8" height="14" fill="#0a1029"/><rect x="14" y="16" width="20" height="6" fill="#0a1029"/>',
    shieldpot: '<path d="M18 5h12v6l6 8v17a4 4 0 0 1-4 4H16a4 4 0 0 1-4-4V19l6-8z"/><rect x="18" y="22" width="12" height="10" fill="#0a1029"/>',
    minishield: '<path d="M20 6h8v5l5 7v15a3 3 0 0 1-3 3H18a3 3 0 0 1-3-3V18l5-7z"/><rect x="19" y="20" width="10" height="7" fill="#0a1029"/>',
    ammo: '<rect x="12" y="10" width="10" height="8" rx="1"/><rect x="26" y="10" width="10" height="8" rx="1"/><rect x="12" y="20" width="10" height="8" rx="1"/><rect x="26" y="20" width="10" height="8" rx="1"/>'
  };

  BN.iconSVG = function (ref, color) {
    var body = ICON_PATHS[ref] || ICON_PATHS.rifle;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 40" fill="' + (color || '#ffffff') + '">' + body + '</svg>';
  };
  BN.iconURI = function (ref, color) {
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(BN.iconSVG(ref, color));
  };

  /* ------------------------- item helpers (pure) ------------------------- */
  BN.makeWeaponItem = function (defId) {
    var def = BN.WEAPONS[defId];
    if (!def) return null;
    return { kind: 'weapon', defId: defId, mag: def.magazine, instance: BN.uid() };
  };
  BN.makeConsumableItem = function (defId, count) {
    var def = BN.CONSUMABLES[defId];
    if (!def) return null;
    return { kind: 'consumable', defId: defId, count: count || 1 };
  };
  BN.makeAmmoItem = function (ammo, count) {
    return { kind: 'ammo', ammo: ammo, count: count || 20 };
  };
  BN.uid = function () {
    return 'i' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
  };

  BN.itemLabel = function (item) {
    if (!item) return '';
    if (item.kind === 'weapon') {
      var d = BN.WEAPONS[item.defId];
      return d ? d.name : 'Weapon';
    }
    if (item.kind === 'consumable') {
      var c = BN.CONSUMABLES[item.defId];
      return c ? c.name : 'Consumable';
    }
    if (item.kind === 'ammo') {
      var a = BN.AMMO[item.ammo];
      return a ? a.name : 'Ammo';
    }
    return 'Item';
  };

  BN.itemRarity = function (item) {
    if (!item) return BN.RARITIES.common;
    if (item.kind === 'weapon') return BN.rarity((BN.WEAPONS[item.defId] || {}).rarity);
    if (item.kind === 'consumable') return BN.rarity((BN.CONSUMABLES[item.defId] || {}).rarity);
    return BN.RARITIES.common;
  };

  BN.itemIcon = function (item) {
    if (!item) return 'rifle';
    if (item.kind === 'weapon') return (BN.WEAPONS[item.defId] || {}).iconRef || 'rifle';
    if (item.kind === 'consumable') return (BN.CONSUMABLES[item.defId] || {}).icon || 'medkit';
    return 'ammo';
  };

  BN.weaponsByRarity = function (rarity) {
    return BN.WEAPON_IDS.filter(function (id) { return BN.WEAPONS[id].rarity === rarity; });
  };

  /* Weighted random weapon for loot + bots. */
  BN.randomWeaponId = function (rnd) {
    rnd = rnd || Math.random;
    var pool = [];
    BN.WEAPON_IDS.forEach(function (id) {
      var w = BN.RARITIES[BN.WEAPONS[id].rarity].order;
      var weight = Math.max(1, 6 - w);
      for (var i = 0; i < weight; i++) pool.push(id);
    });
    return pool[Math.floor(rnd() * pool.length)];
  };
})();
