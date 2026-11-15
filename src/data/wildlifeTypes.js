/**
 * wildlifeTypes.js — Definitions for all ambient wildlife animals.
 *
 * Each type specifies behavior and spawning properties. Their looks (voxel
 * models and animation) live in components/3d/wildlife/animalModels.js.
 * hp/xp are stored for future combat integration but unused for now.
 */

export const WILDLIFE_TYPES = {
  DEER:     { name: 'Deer',      speed: 3.5,  fleeRange: 16,  biomes: ['forest', 'plains'],  nocturnal: false,  ground: true,   hp: 20,  xp: 15 },
  RACCOON:  { name: 'Raccoon',   speed: 2.5,  fleeRange: 10,  biomes: ['forest'],            nocturnal: true,   ground: true,   hp: 10,  xp: 8 },
  BEAVER:   { name: 'Beaver',    speed: 1.8,  fleeRange: 12,  biomes: ['wetland'],           nocturnal: false,  ground: true,   hp: 15,  xp: 10 },
  SKUNK:    { name: 'Skunk',     speed: 1.5,  fleeRange: 8,   biomes: ['forest', 'plains'],  nocturnal: true,   ground: true,   hp: 8,   xp: 5 },
  OPOSSUM:  { name: 'Opossum',   speed: 1.8,  fleeRange: 10,  biomes: ['forest'],            nocturnal: true,   ground: true,   hp: 8,   xp: 5 },
  MOLE:     { name: 'Mole',      speed: 1.0,  fleeRange: 6,   biomes: ['plains', 'forest'],  nocturnal: false,  ground: true,   hp: 5,   xp: 3 },
  BEAR:     { name: 'Bear',      speed: 3.0,  fleeRange: 0,   biomes: ['forest'],            nocturnal: false,  ground: true,   hp: 60,  xp: 40 },
  WOLF:     { name: 'Wolf',      speed: 4.0,  fleeRange: 0,   biomes: ['forest', 'snow'],    nocturnal: false,  ground: true,   hp: 30,  xp: 25 },
  PUMA:     { name: 'Puma',      speed: 4.5,  fleeRange: 0,   biomes: ['forest', 'plains'],  nocturnal: true,   ground: true,   hp: 35,  xp: 30 },
  BAT:      { name: 'Bat',       speed: 3.0,  fleeRange: 12,  biomes: ['all'],               nocturnal: true,   ground: false,  hp: 5,   xp: 3 },
  CROW:     { name: 'Crow',      speed: 3.5,  fleeRange: 14,  biomes: ['all'],               nocturnal: false,  ground: false,  hp: 5,   xp: 3 },
  SQUIRREL: { name: 'Squirrel',  speed: 3.0,  fleeRange: 12,  biomes: ['forest'],            nocturnal: false,  ground: true,   hp: 5,   xp: 3 },
};

// Pre-computed list of all type keys for random selection
export const WILDLIFE_TYPE_KEYS = Object.keys(WILDLIFE_TYPES);
