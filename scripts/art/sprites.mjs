/**
 * sprites.mjs — Pixel-art sources for the game's icons.
 *
 * Every sprite is a grid of characters; '.' is empty and every other
 * character is a palette key (PALETTE below). build.mjs turns them into SVG:
 *   voxel  — 16×16 grids extruded into blocks (items, materials, spells)
 *   flat   — small colored glyphs with a dark outline (status effects, HUD)
 *   mono   — single-color UI symbols ('#' = on), drawn in currentColor
 * Tiered items reuse one drawing with palette swaps (VARIANTS).
 */

export const PALETTE = {
  // wood
  w: '#9a6435', W: '#c98d52', d: '#5e3a1d', U: '#e2b47c', u: '#a0683a',
  // metal (tier keys: I light, i mid, j dark)
  I: '#eef2f5', i: '#b9c0c8', j: '#7a818a',
  // stone
  s: '#8f949c', S: '#b4b9c0', t: '#5f646c',
  // gold
  g: '#f2c14e', G: '#ffe08a', h: '#b07e26',
  // red / meat
  r: '#d93d44', R: '#ff7f77', q: '#8f2228',
  // crystal / ice
  c: '#45bfe3', C: '#c4f6ff', x: '#2a85ad',
  // leather
  l: '#b47a4b', L: '#d8a06e', m: '#6f4529',
  // leaf / plant
  f: '#5fa844', F: '#98d468', e: '#3c7a2b',
  // glass / white
  a: '#cfe6ec', A: '#ffffff',
  // dirt / cooked
  o: '#7a4f2e', O: '#a5703f',
  // arcane purple
  p: '#5b2aa6', P: '#8f5cf0', z: '#c9a6ff', Z: '#f4e9ff',
  // coal
  k: '#3c3c47', K: '#70707f',
  // bone
  b: '#e8e0cc', B: '#fffaf0', v: '#b8ad94',
  // clay
  4: '#c6cfda', 5: '#a9b4c2', 6: '#7d8898',
  // sand
  7: '#f3e3b5', 8: '#e3cc8e', 9: '#c4ad6e',
  // fire
  '+': '#ff9a2e',
  // wind
  '%': '#e4f6f6', '=': '#9fc9c9',
  // poison
  '^': '#a8e05a', '~': '#5d9a2a',
  // shield blue
  '@': '#6fa8ff', '#': '#2f5fb8',
  // water
  '&': '#5cb8ff', '*': '#2a7fd0',
  // death
  '!': '#2a1838',
};

// Tier palettes for metal keys (I/i/j)
const TIER = {
  stone: { I: '#c7ccd2', i: '#8f949c', j: '#5f646c' },
  iron: { I: '#eef2f5', i: '#b9c0c8', j: '#7a818a' },
  steel: { I: '#e3edf7', i: '#93a8be', j: '#4f6276' },
  crystal: { I: '#d8fbff', i: '#45bfe3', j: '#2a85ad' },
  leather: { I: '#e3b07c', i: '#b47a4b', j: '#6f4529' },
  gold: { I: '#ffe08a', i: '#f2c14e', j: '#b07e26' },
};
const LIQUID = {
  health: { R: '#ff7f77', r: '#d93d44', q: '#8f2228' },
  mana: { R: '#8ec8ff', r: '#3d7fe0', q: '#1f4a99' },
  rage: { R: '#ffc27a', r: '#f07a1e', q: '#a2470e' },
  elixir: { R: '#f4e9ff', r: '#a56cf2', q: '#5b2aa6' },
};

// ── Voxel sprites (16×16) ────────────────────────────────────────────────

export const VOXEL = {
  pickaxe: ['', '....jjjjjjjj....', '..jjIIIIIIIIjj..', '.jIIiijddjiiIIj.', 'jIij...dW...jiIj', 'jIj....dW....jIj', 'jj.....dW.....jj', '.......dW.......', '.......dW.......', '.......dW.......', '.......dW.......', '.......dW.......', '.......dW.......', '.......dW.......', '.......dd.......'],
  sword: ['.......I........', '......IIj.......', '......Iij.......', '......Iij.......', '......Iij.......', '......Iij.......', '......Iij.......', '......Iij.......', '......Iij.......', '...hgGGGGGgh....', '....hhgggghh....', '......dWd.......', '......dWd.......', '......dWd.......', '.....hgGgh......', '......hgh.......'],
  axe: ['', '......dW..jjj...', '......dW.jIIIj..', '....jjdWjjiIIIj.', '...jIjdWjiiiIIj.', '....jjdWjiiiiIj.', '......dWjiiiiIj.', '......dWjiiiIIj.', '......dWjjiIIIj.', '......dW.jIIIj..', '......dW..jjj...', '......dW........', '......dW........', '......dW........', '......dd........'],
  club: ['', '......dWWd......', '.....dWWWWd.....', '.....dWwWWd.....', '.....dWWwWd.....', '.....dwWWwd.....', '.....dWWWWd.....', '......dWWd......', '.......dW.......', '.......dW.......', '.......dW.......', '.......dW.......', '.......dW.......', '.......dW.......', '.......dd.......'],
  shield: ['', '.jjjjjjjjjjjjjj.', '.jWwWwWwWwWwWwj.', '.jWwWwWwWwWwWwj.', '.jWwWwWwWwWwWwj.', '.jWwWwWggWwWwWj.', '.jWwWwgGGgWwWwj.', '.jWwWwgGGgWwWwj.', '.jWwWwWggWwWwWj.', '.jWwWwWwWwWwWwj.', '..jWwWwWwWwWwj..', '..jWwWwWwWwWwj..', '...jWwWwWwWwj...', '....jjWwWwjj....', '......jjjj......'],
  armor: ['', '', '...jj......jj...', '..jIIj....jIIj..', '..jIIIjjjjIIIj..', '..jIIiiiiiiIIj..', '...jIiiiiiiIj...', '...jIiiggiiIj...', '...jIiiggiiIj...', '...jIiiiiiiIj...', '...jIiiiiiiIj...', '...jjIiiiiIjj...', '.....jjjjjj.....'],
  helmet: ['', '', '.....jjjjjj.....', '....jIIIIIij....', '...jIIIiiiiij...', '..jIIiiiiiiiij..', '..jIiiiiiiiiij..', '..jIiiiiiiiiij..', '..jIijjjjjjiij..', '..jIj..jj..jij..', '..jIijjjjjjiij..', '..jIiiijjiiiij..', '..jjiiij.iiijj..', '...jjjj..jjjj...'],
  ring: ['', '......xCCx......', '.....xCCCcx.....', '......xccx......', '.....jIIIIj.....', '....IIIiiIIi....', '...iIj....jIi...', '..iIj......jIi..', '..iI........ii..', '..iI........ij..', '..iIj......jij..', '...iIj....jij...', '....iiiiijjj....', '.....jjjjjj.....'],
  potion: ['', '......dWWd......', '......dWWd......', '......aAaa......', '......aAaa......', '.....aaAaaa.....', '....aRRRRRRa....', '...aRARrrrRRa...', '..aRArrrrrrrRa..', '..aRrrrrrrrrra..', '..arrrrrrrrrqa..', '..arrrrrrrrqqa..', '...arrrrrqqqa...', '....aqqqqqqa....', '.....aaaaaa.....'],
  salve: ['', '', '', '', '....dddddddd....', '...dWWWWWWWWd...', '...dddddddddd...', '...jFFFFFFFFj...', '...iFfFFfFFFi...', '...ifFFFFfFFi...', '...iFFfFFFFfi...', '...jiiiiiiiij...', '....jjjjjjjj....'],
  jam: ['', '', '.....rrrrrr.....', '....rArrArrA....', '.....dddddd.....', '....aaaaaaaa....', '...aPPPPPPPPa...', '...aPzPPPPPPa...', '...aPPPPPzPPa...', '...apPPPPPPpa...', '...appppppppa...', '....aaaaaaaa....'],
  cookedMeat: ['', '', '......oooo......', '.....oOOOOo.....', '....oOOdOOOo....', '....oOOOOOdo....', '....oOdOOOOo....', '.....oOOOOo.....', '......oOOo......', '.......bb.......', '......bBBb......', '.....bBb.bb.....', '......b.........'],
  stew: ['', '', '.....rRr........', '....rRARr.......', '.....bbb...F....', '..W..bbb..FfF...', '.dddddddddddddd.', '.dOOOOOOOOOOOOd.', '..dwWWWWWWWWWd..', '...dwWWWWWWwd...', '....dwwwwwwd....', '.....dddddd.....'],
  // materials
  wood: ['', '', '', '....WWWWWWWWWUU.', '....wwwwwwwwwUuU', '....dddddddddUU.', '.WWWWWWWWWWUU...', '.wwwwwwwwwwUuU..', '.ddddddddddUU...', '...WWWWWWWWWWUU.', '...wwwwwwwwwwUuU', '...ddddddddddUU.'],
  stone: ['', '', '', '', '.....tsssst.....', '....tsSSSsst....', '...tsSSssssst...', '..tsSSsssstsst..', '..tsSssssssstt..', '..tssssstssstt..', '...ttssssssttt..', '....tttttttt....'],
  iron: ['', '', '', '', '', '', '....jjjjjjjj....', '...jIIIIIIIIj...', '..jIIIIIIIIIij..', '.jiiiiiiiiiiiij.', '.jiiiiiiiiiiiij.', '.jjjjjjjjjjjjjj.'],
  crystal: ['', '', '.......C........', '......CCx.......', '......Ccx...C...', '..C...Ccx..Ccx..', '.CCx..Ccx..Ccx..', '.Ccx..Ccx..Ccx..', '.Ccx..Ccx..Ccx..', '.Ccx.CCccx.Ccx..', '..cxtssssst.cx..', '...tsssssssst...', '....tttttttt....'],
  leather: ['', '', '', '..m........m....', '..mlm....mlm....', '...mLLLLLLlm....', '...lLLLLLLLl....', '..mlLLlLLLLlm...', '.mllLLLLLlLllm..', '..mlLLLLLLLlm...', '...lLLLlLLLl....', '...mlLLLLLlm....', '..mlm.mlm.mlm...', '..m....m....m...'],
  seeds: ['', '', '', '......F.F.......', '.....FfFfF......', '......fFf.......', '.......e........', '.......e........', '....oOOOOOo.....', '...oOOooOOOo....', '..ooOoooooOoo...', '..oooooooooooo..'],
  berries: ['', '', '......f.........', '.....fFf..f.....', '...rRf.fFfFf....', '..rRrrfFfrRr....', '..rrrqfefrRrr...', '...rqrRrfrrqr...', '....rRrrr.qq....', '....rrrq........', '.....qq.........'],
  coal: ['', '', '', '', '......kKKk......', '....kKKkkKk.....', '...kKkkkkkkk....', '..kKkkkKkkkkk...', '..kkkkkkkkkKk...', '...kkkKkkkkk....', '....kkkkkkk.....', '.....kkkkk......'],
  goldOre: ['', '', '', '', '.......hh.......', '.....hgGGgh.....', '....hgGGGggh....', '...hgGGgggggh...', '...hggGgggghh...', '....hhgggghh....', '.....hhhhhh.....'],
  clay: ['', '', '', '', '...666666666....', '..64444444456...', '..65444444556...', '..65544445556...', '..65555555556...', '..66666666666...'],
  sand: ['', '', '', '', '', '', '.......77.......', '.....778877.....', '....78888887....', '...7888898887...', '..788898888897..', '.79999999999997.'],
  dirt: ['', '', '', '', '', '', '.......OO.......', '.....OOooOO.....', '....OooooooO....', '...OoooodoooO...', '..OoooOooooodO..', '.odddddddddddo..'],
  snow: ['', '', '', '', '......AAAA......', '....AAAAAAAa....', '...AAAAAAAAaa...', '...AAAAAAAAaa...', '...AAAAAAAaaa...', '....AAAAAaaa....', '......aaaa......'],
  ice: ['', '', '', '...cccccccccc...', '...cAAaaaaaac...', '...cAaaaaaaxc...', '...caaaaaaaxc...', '...caaaaaaaxc...', '...caaaaaaxxc...', '...caaaaxxxxc...', '...cccccccccc...'],
  bone: ['', '', '', '', '', '..bb.......bb...', '.bBBb.....bBBb..', '.bBBBbbbbbBBBb..', '.vbBBBBBBBBBbv..', '.bBvvvvvvvvvBb..', '..bb.......bb...'],
  fiber: ['', '', '....F..F.F......', '....fF.Ff.F.....', '.....fFfFf......', '.....ffFff......', '.....fFfFf......', '.....uUUUu......', '.....fFfff......', '.....ffFff......', '....fF.fF.F.....', '....f..f..f.....'],
  meat: ['', '', '', '.....RRRRR......', '...RRrrrrRR.....', '..RrrArrrrrR....', '..RrrrrAAArRq...', '..qrrrrrrrrrq...', '...qrrrrrrrq....', '....qqqqqqq.....'],
  campfire: ['', '.......G........', '......GR........', '......RGR.......', '.....R+GR.......', '....R++G+R......', '....R+GG++R.....', '.....R+GG+R.....', '......R++R......', '..UdddddddddU...', '...wwdWWWdww....', '..UwwwWWWwwwU...', '...dddddddddd...'],
  // spells
  fireball: ['', '..........R.....', '.......R.RR.R...', '......R+RR+R....', '.....R++GG+R....', '....R+GGAGG+R...', '....R+GAAAG+R...', '....R+GGAGG+R...', '.....R++GG++R...', '......RR++RR....', '...R...RRRR.....', '..R..R..........', '.R..............'],
  lightning: ['', '........GGGG....', '.......GAAG.....', '......GAAG......', '.....GAAG.......', '....GAAGGGG.....', '...GAAAAAAG.....', '....GGGGAAG.....', '.......GAG......', '......GAG.......', '.....GAG........', '....GG..........', '...G............'],
  iceShard: ['', '.........A......', '........ACx.....', '.......ACcx.....', '......ACccx.....', '.....ACccx......', '....ACccx.......', '...ACccx........', '...Cccx.........', '..Ccx...........', '..cx............', '.x..............'],
  windBlast: ['', '', '...%%%%%%%......', '..%=====%%%.....', '.........%=%....', '...%%%%%..%=....', '..%=====%.%=....', '........%=%.....', '.%%%%%%%%%=.....', '%==========%....', '...........%=...', '..%%%%%%%%%=....'],
  meteor: ['', '............G...', '..........GG....', '.........G+.....', '....kkkk+R......', '...kKKkk+.......', '..kKRkkkk.......', '..kKkkRkk.......', '..kkkRkkk.......', '...kkkkk........', '....kkk.........'],
  chainLightning: ['', '..GG......GG....', '..GA......GA....', '...GA......GA...', '..GAG.....GAG...', '..GGAG...GGAG...', '....GAGGGG.GA...', '....GAAAAAAGAG..', '...GAGGGGGGGAG..', '...GA......GA...', '..GA......GA....', '..G.......G.....'],
  poisonCloud: ['', '', '.....^^^^.......', '...^^~~~~^^.....', '..^~~^^^~~~^^...', '.^~~^~~~^~~~~^..', '.^~~~~~~~~~~~^..', '..^~~~ee~~~~^...', '...^^^~~~^^^....', '......e..e......', '.....e....e.....', '......e.e.......'],
  frostNova: ['.......A.......', '.....A.A.A.....', '......AcA......', '.A.....c.....A.', '..A....c....A..', '...A...c...A...', '....AccAccA....', 'AcccccAAAcccccA', '....AccAccA....', '...A...c...A...', '..A....c....A..', '.A.....c.....A.', '......AcA......', '.....A.A.A.....', '.......A.......'],
  heal: ['', '......eeee......', '......eFFe......', '......eFFe......', '..eeeeeFFeeeee..', '..eFFFFFFFFFFe..', '..eFFFFFFFFFFe..', '..eeeeeFFeeeee..', '......eFFe......', '......eFFe......', '......eeee......', '..A.........A...', '.AAA.......AAA..', '..A.........A...'],
  shieldSpell: ['', '...##########...', '...#@@@@@@@@#...', '...#@AA@@@@@#...', '...#@A@@@@@@#...', '...#@@@@@@@@#...', '...#@@@@@@@@#...', '....#@@@@@@#....', '....#@@@@@@#....', '.....#@@@@#.....', '......#@@#......', '.......##.......'],
  haste: ['', '', '..GG....GG......', '...GG....GG.....', '....GG....GG....', '.....GG....GG...', '....GG....GG....', '...GG....GG.....', '..GG....GG......'],
  inferno: ['', '....R.....R.....', '...RR..R..RR....', '...R+R.RR.R+R...', '..R++RR++RR++R..', '..R+G++R+G++R+R.', '..R+GG++GG++G+R.', '.R++GAG+GAG+GG+R', '.R+GAAGGAAGGAAG+', '.RR+GAAAAAAAAG+R', '..RRRRRRRRRRRRR.'],
  arcaneBarrage: ['', '', '..pp............', '.pZzp...........', '.pzzp.....pp....', '..pp.....pZzp...', '.........pzzp...', '....pp....pp....', '...pZzp.........', '...pzzp.........', '....pp..........'],
  waterJet: ['', '', '', '..........&&&...', '........&&AA&&..', '......&&A&&**&..', '....&&&&&****...', '..&&&&*****.....', '.&&****.........', '&&*..&...&...&..', '.......&...&....'],
  deathRay: ['', '....!!!!!!!.....', '...!ZZZZZZZ!....', '..!ZZZZZZZZZ!...', '..!Z!!ZZZ!!Z!...', '..!Z!!ZZZ!!Z!...', '..!ZZZZ!ZZZZ!...', '...!ZZZZZZZ!....', '....!Z!Z!Z!.....', '....!!!!!!!.....'],
  // gold coin for the purse
  coin: ['', '.....hhhhhh.....', '....hgGGGGgh....', '...hgGGggGGgh...', '..hgGGghhgGGgh..', '..hgGgGGGGhGgh..', '..hgGgGhhhgGgh..', '..hgGgGGGghGgh..', '..hgGghggggGgh..', '..hgGGgGGgGGgh..', '...hgGGggGGgh...', '....hggggggh....', '.....hhhhhh.....'],
  // portal for toasts
  rift: ['', '......pppp......', '....ppPPPPpp....', '...pPPzzzzPPp...', '...pPzzZZzzPp...', '..pPzzZZZZzzPp..', '..pPzZZZZZZzPp..', '..pPzZZZZZZzPp..', '..pPzzZZZZzzPp..', '...pPzzZZzzPp...', '...pPPzzzzPPp...', '....ppPPPPpp....', '...ssstssstss...', '..tssssssssst...'],
};

// ── Flat glyphs (status effects, HUD stats) ─────────────────────────────

export const FLAT = {
  stun: ['', '..G......G..', '.GAG....GAG.', '..G......G..', '', '....GGG.....', '...G...G....', '...G.G.G....', '...G..G.....', '....GG......'],
  slow: ['..hhhhhhhh..', '...a7777a...', '....a77a....', '.....aa.....', '....a..a....', '...a.77.a...', '..a.7777.a..', '..hhhhhhhh..'],
  health: ['', '..qq...qq...', '.qRRq.qRRq..', 'qRARRqRRRRq.', 'qRRRRRRRRrq.', 'qRRRRRRRrrq.', '.qRRRRRrrq..', '..qRRRrrq...', '...qRrrq....', '....qrq.....', '.....q......'],
  mana: ['', '.....&......', '....&&&.....', '...&&A&&....', '...&AA&&....', '..&&A&&*&...', '..&&&&&**&..', '..&&&&***&..', '...&&***&...', '....&&&&....'],
  stamina: ['', '.....FFFF...', '....FAAF....', '...FAAF.....', '..FAAFFFF...', '..FAAAAAF...', '..FFFFAAF...', '....FAAF....', '...FAAF.....', '...FFF......'],
  rage: ['', '....+.......', '...++..+....', '...+R+.++...', '..+RR++R+...', '..+RGR+RR+..', '.+RGGRRGR+..', '.+RGAGGGR+..', '.+RGAAGGR+..', '..+RRRRR+...', '...+++++....'],
  xp: ['', '.....G......', '....GAG.....', '....GAG.....', 'GGGGGAGGGGG.', '.GAAAAAAAG..', '..GAAAAAG...', '..GAAGAAG...', '.GAG...GAG..', '.GG.....GG..'],
};

// ── Mono UI symbols (12×12, '#' = on) ───────────────────────────────────

export const MONO = {
  bag: ['....####....', '...#....#...', '..########..', '.#........#.', '.#..####..#.', '.#..#..#..#.', '.#..####..#.', '.#........#.', '.#........#.', '..########..'],
  hammer: ['..########..', '..########..', '..##....##..', '....####....', '....####....', '.....##.....', '.....##.....', '.....##.....', '.....##.....', '.....##.....'],
  mapPin: ['...######...', '..##....##..', '..#..##..#..', '..#..##..#..', '..##....##..', '...##..##...', '....####....', '.....##.....', '.....##.....'],
  people: ['..##....##..', '.####..####.', '.####..####.', '..##....##..', '............', '.####..####.', '######.#####', '######.#####'],
  box: ['############', '#..........#', '############', '#....##....#', '#....##....#', '#..........#', '#..........#', '#..........#', '############'],
  wrench: ['........##..', '.......#..#.', '......#..##.', '.....#..#...', '....#..#....', '...#..#.....', '..#..#......', '.#..#.......', '#..#........', '.##.........'],
  grid: ['####.####', '#..#.#..#', '####.####', '.........', '####.####', '#..#.#..#', '####.####'],
  pickaxe: ['.########...', '##......##..', '#...##...#..', '....##......', '....##......', '....##......', '....##......', '....##......', '....##......'],
  sword: ['..........##', '.........###', '........###.', '.......###..', '..#...###...', '...#.###....', '....###.....', '...###......', '..#..#......', '.#....#.....', '#...........'],
  armor: ['##.......##.', '####...####.', '###########.', '.#########..', '.####.####..', '.#########..', '.#########..', '.#########..', '..#######...'],
  flask: ['....####....', '....#..#....', '....#..#....', '...#....#...', '..#......#..', '.#........#.', '.#.######.#.', '.#.######.#.', '..########..'],
  crate: ['############', '#.#......#.#', '#..#....#..#', '#...#..#...#', '#....##....#', '#...#..#...#', '#..#....#..#', '#.#......#.#', '############'],
  sprout: ['..##....##..', '.####..####.', '..###..###..', '....####....', '.....##.....', '.....##.....', '.....##.....', '..########..', '############'],
  trash: ['....####....', '############', '.#........#.', '.#.#.##.#.#.', '.#.#.##.#.#.', '.#.#.##.#.#.', '.#.#.##.#.#.', '.#........#.', '..########..'],
  shield: ['############', '#..........#', '#..........#', '#..........#', '.#........#.', '.#........#.', '..#......#..', '...#....#...', '....####....'],
  helmet: ['...######...', '..#......#..', '.#........#.', '.#........#.', '.#.######.#.', '.#.#....#.#.', '.#.#....#.#.', '.###....###.'],
  gloves: ['..#.#.#.....', '.#.#.#.#....', '.#.#.#.#.##.', '.#.......#.#', '.#........#.', '.#.......#..', '.#.......#..', '..#######...'],
  boots: ['..#####.....', '..#...#.....', '..#...#.....', '..#...#.....', '..#...#####.', '..#........#', '..#........#', '..##########'],
  ring: ['....####....', '...#.##.#...', '....####....', '..##....##..', '.#........#.', '.#........#.', '.#........#.', '..##....##..', '....####....'],
  trophy: ['############', '.#........#.', '##........##', '##........##', '.#........#.', '..#......#..', '...######...', '.....##.....', '....####....', '..########..'],
  swords: ['#..........#', '.#........#.', '..#......#..', '...#....#...', '....#..#....', '.....##.....', '.....##.....', '....#..#....', '..##....##..', '.##......##.'],
  levelUp: ['.....##.....', '....####....', '...######...', '..########..', '.....##.....', '.....##.....', '.....##.....', '.....##.....', '............', '############'],
  check: ['..........##', '.........##.', '........##..', '##.....##...', '.##...##....', '..##.##.....', '...###......', '....#.......'],
  warning: ['.....##.....', '....####....', '....#..#....', '...#.##.#...', '...#.##.#...', '..#..##..#..', '..#......#..', '.#...##...#.', '.##########.'],
  info: ['..######..', '.#......#.', '#...##...#', '#........#', '#...##...#', '#...##...#', '#...##...#', '.#......#.', '..######..'],
  sleep: ['######......', '....##......', '...##.......', '..##........', '######.####.', '..........#.', '.........#..', '........####'],
  food: ['......####..', '.....######.', '....#######.', '....#######.', '.....#####..', '....##......', '...##.......', '.###........', '###.........', '.#..........'],
  talk: ['############', '#..........#', '#.##.##.##.#', '#..........#', '############', '..##........', '.#..........'],
  jump: ['.....##.....', '....####....', '...######...', '..##.##.##..', '.....##.....', '.....##.....', '.....##.....', '.....##.....'],
  dash: ['##....##....', '.##....##...', '..##....##..', '...##....##.', '..##....##..', '.##....##...', '##....##....'],
  wand: ['..........#.', '.........#.#', '........#.#.', '.......#.#..', '......#.#...', '.....###....', '....##......', '...##.......', '..##........', '.##.........'],
  wheel: ['....####....', '..##....##..', '.#...##...#.', '.#..####..#.', '#..######..#', '#..######..#', '.#..####..#.', '.#...##...#.', '..##....##..', '....####....'],
  hand: ['...#.#.#....', '..#.#.#.#...', '..#.#.#.#...', '..#.#.#.#.#.', '..#.......##', '..#.......#.', '...#.....#..', '....#####...'],
  lock: ['....####....', '...#....#...', '...#....#...', '..########..', '..########..', '..####.###..', '..###..###..', '..########..', '..########..'],
  close: ['.##......##.', '..##....##..', '...##..##...', '....####....', '....####....', '...##..##...', '..##....##..', '.##......##.'],
  sun: ['#....#....#.', '.#...#...#..', '...#####....', '..#.....#...', '###.....###.', '..#.....#...', '...#####....', '.#...#...#..', '#....#....#.'],
  moon: ['....####....', '..###.......', '.###........', '.##.........', '##..........', '##..........', '.##.........', '.###......#.', '..########..', '....####....'],
  home: ['.....##.....', '....####....', '...######...', '..########..', '.##########.', '############', '.#........#.', '.#..##....#.', '.#..##..###.', '.#..##..###.', '.##########.'],
  alert: ['.....##.....', '.....##.....', '.....##.....', '.....##.....', '.....##.....', '............', '.....##.....'],
};

// ── Icon list: what to draw, how, and what in the game it's for ──────────

const v = (id, label, sprite, extra = {}) => ({ id, label, kind: 'voxel', sprite, ...extra });

export const ICONS = {
  items: [
    v('woodenClub', 'Wooden Club', 'club'),
    v('stoneSword', 'Stone Sword', 'sword', { palette: TIER.stone }),
    v('ironSword', 'Iron Sword', 'sword', { palette: TIER.iron }),
    v('steelSword', 'Steel Sword', 'sword', { palette: TIER.steel }),
    v('crystalSword', 'Crystal Sword', 'sword', { palette: TIER.crystal }),
    v('stoneAxe', 'Stone Axe', 'axe', { palette: TIER.stone }),
    v('ironAxe', 'Iron Axe', 'axe', { palette: TIER.iron }),
    v('steelAxe', 'Steel Axe', 'axe', { palette: TIER.steel }),
    v('stonePickaxe', 'Stone Pickaxe', 'pickaxe', { palette: TIER.stone }),
    v('ironPickaxe', 'Iron Pickaxe', 'pickaxe', { palette: TIER.iron }),
    v('steelPickaxe', 'Steel Pickaxe', 'pickaxe', { palette: TIER.steel }),
    v('leatherArmor', 'Leather Armor', 'armor', { palette: { ...TIER.leather, g: '#b07e26', G: '#f2c14e' } }),
    v('ironArmor', 'Iron Armor', 'armor', { palette: TIER.iron }),
    v('crystalArmor', 'Crystal Armor', 'armor', { palette: TIER.crystal }),
    v('ironHelmet', 'Iron Helmet', 'helmet', { palette: TIER.iron }),
    v('ironRing', 'Iron Ring', 'ring', { palette: TIER.iron }),
    v('crystalRing', 'Crystal Ring', 'ring', { palette: TIER.gold }),
    v('woodenShield', 'Wooden Shield', 'shield', { note: 'off-hand (not craftable yet)' }),
    v('healthPotion', 'Health Potion', 'potion', { palette: LIQUID.health }),
    v('manaPotion', 'Mana Potion', 'potion', { palette: LIQUID.mana }),
    v('ragePotion', 'Rage Potion', 'potion', { palette: LIQUID.rage }),
    v('crystalElixir', 'Crystal Elixir', 'potion', { palette: LIQUID.elixir }),
    v('herbalSalve', 'Herbal Salve', 'salve'),
    v('berryJam', 'Berry Jam', 'jam'),
    v('cookedMeat', 'Cooked Meat', 'cookedMeat'),
    v('mushroomStew', 'Mushroom Stew', 'stew'),
  ],
  materials: [
    v('wood', 'Wood', 'wood'), v('stone', 'Stone', 'stone'), v('iron', 'Iron', 'iron'),
    v('coal', 'Coal', 'coal'), v('gold_ore', 'Gold Ore', 'goldOre'), v('crystal', 'Crystal', 'crystal'),
    v('clay', 'Clay', 'clay'), v('sand', 'Sand', 'sand'), v('dirt', 'Dirt', 'dirt'),
    v('snow', 'Snow', 'snow'), v('ice', 'Ice', 'ice'), v('leather', 'Leather', 'leather'),
    v('bone', 'Bone', 'bone'), v('fiber', 'Fiber', 'fiber'), v('meat', 'Meat', 'meat'),
    v('berry', 'Berries', 'berries'), v('seed', 'Seeds', 'seeds'),
  ],
  spells: [
    v('fireball', 'Fireball', 'fireball'), v('lightning', 'Lightning', 'lightning'),
    v('iceShard', 'Ice Shard', 'iceShard'), v('windBlast', 'Wind Blast', 'windBlast'),
    v('meteor', 'Meteor', 'meteor'), v('chainLightning', 'Chain Lightning', 'chainLightning'),
    v('poisonCloud', 'Poison Cloud', 'poisonCloud'), v('frostNova', 'Frost Nova', 'frostNova'),
    v('heal', 'Heal', 'heal'), v('shield', 'Shield', 'shieldSpell'), v('haste', 'Haste', 'haste'),
    v('inferno', 'Inferno', 'inferno'), v('arcaneBarrage', 'Arcane Barrage', 'arcaneBarrage'),
    v('waterjet', 'Water Jet', 'waterJet'), v('deathRay', 'Death Ray', 'deathRay'),
  ],
  status: [
    { id: 'STUN', label: 'Stun', kind: 'flat', sprite: 'stun' },
    { id: 'FREEZE', label: 'Freeze', kind: 'flat', from: 'frostNova' },
    { id: 'POISON', label: 'Poison', kind: 'flat', from: 'poisonCloud' },
    { id: 'BURN', label: 'Burn', kind: 'flat', from: 'fireball' },
    { id: 'SLOW', label: 'Slow', kind: 'flat', sprite: 'slow' },
    { id: 'SHIELD', label: 'Shield', kind: 'flat', from: 'shieldSpell' },
    { id: 'HASTE', label: 'Haste', kind: 'flat', from: 'haste' },
  ],
  hud: [
    { id: 'health', label: 'Health', kind: 'flat', sprite: 'health' },
    { id: 'mana', label: 'Mana', kind: 'flat', sprite: 'mana' },
    { id: 'stamina', label: 'Stamina', kind: 'flat', sprite: 'stamina' },
    { id: 'hunger', label: 'Hunger', kind: 'flat', from: 'cookedMeat' },
    { id: 'rage', label: 'Rage', kind: 'flat', sprite: 'rage' },
    { id: 'xp', label: 'XP', kind: 'flat', sprite: 'xp' },
  ],
  misc: [
    v('campfire', 'Campfire', 'campfire'),
    v('rift', 'Rift', 'rift'),
    v('coin', 'Gold', 'coin'),
  ],
  // UI symbols, grouped by where they're used
  ui: Object.entries({
    'Mode buttons': { bag: 'Bag', hammer: 'Build', mapPin: 'Plan', people: 'Settlement' },
    'Bag tabs & categories': { box: 'Inventory', wrench: 'Repair', grid: 'All', pickaxe: 'Tools', sword: 'Weapons', armor: 'Armor', flask: 'Potions' },
    'Plan tools': { crate: 'Stockpile', sprout: 'Farm', trash: 'Remove' },
    'Equipment slots': { shield: 'Off-hand', helmet: 'Helmet', gloves: 'Gloves', boots: 'Boots', ring: 'Ring' },
    'Notifications': { trophy: 'Achievement', swords: 'Raid', levelUp: 'Level up', check: 'Success', warning: 'Warning', info: 'Info' },
    'Settler activities': { sleep: 'Sleeping', food: 'Hungry', talk: 'Socialising' },
    'Touch controls': { jump: 'Jump', dash: 'Sprint', wand: 'Spell', wheel: 'Tool wheel', hand: 'Hand' },
    'General': { lock: 'Locked', close: 'Close', alert: 'Alert', sun: 'Day', moon: 'Night', home: 'Shelter' },
  }).flatMap(([group, entries]) => Object.entries(entries).map(([sprite, label]) => ({ id: sprite, label, kind: 'mono', sprite, group }))),
};

// ── Blocks: isometric cubes with 8×8 procedural faces ───────────────────

export const BLOCKS = [
  { id: 'STONE', label: 'Stone', top: '#8f949c', side: '#868b93', noise: 0.08, specks: [['#6e737b', 0.15]] },
  { id: 'DIRT', label: 'Dirt', top: '#8a5a35', side: '#7f5230', noise: 0.08, specks: [['#6b4428', 0.15]] },
  { id: 'GRASS', label: 'Grass', top: '#6cbf4a', side: '#5a9e3c', noise: 0.06, specks: [['#5fa844', 0.12]] },
  { id: 'SAND', label: 'Sand', top: '#e3cc8e', side: '#d8bf80', noise: 0.05, specks: [['#c4ad6e', 0.12]] },
  { id: 'WOOD', label: 'Wood', top: '#c99358', side: '#6b4428', noise: 0.06, rings: '#9a6435', bark: '#4f311b' },
  { id: 'LEAVES', label: 'Leaves', top: '#4e9a35', side: '#468f30', noise: 0.12, specks: [['#2f6b22', 0.22], ['#7fc45a', 0.1]] },
  { id: 'GRAVEL', label: 'Gravel', top: '#8a8a8a', side: '#828282', noise: 0.12, specks: [['#6a6a6a', 0.3], ['#a8a8a8', 0.2]] },
  { id: 'COAL_ORE', label: 'Coal Ore', top: '#8f949c', side: '#868b93', noise: 0.08, specks: [['#26262c', 0.22]] },
  { id: 'IRON_ORE', label: 'Iron Ore', top: '#8f949c', side: '#868b93', noise: 0.08, specks: [['#d9a87a', 0.18]] },
  { id: 'GOLD_ORE', label: 'Gold Ore', top: '#8f949c', side: '#868b93', noise: 0.08, specks: [['#f2c14e', 0.18]] },
  { id: 'CLAY', label: 'Clay', top: '#a9b4c2', side: '#9eaab8', noise: 0.05, specks: [['#8d99a8', 0.12]] },
  { id: 'SNOW', label: 'Snow', top: '#f4f8fa', side: '#e4eef2', noise: 0.03, specks: [['#d4e2ea', 0.12]] },
  { id: 'ICE', label: 'Ice', top: '#a8dcf0', side: '#8ccbe6', noise: 0.04, specks: [['#d8f2fb', 0.12]], streak: '#e8f8ff' },
];
