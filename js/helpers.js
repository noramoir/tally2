// ═══════════════════════════════════════════════════
// HELPERS — Core logic, leaderboard, game creation
// Uses variables from config.js (loaded first)
// ═══════════════════════════════════════════════════

// Shorthand references from config
var C = PALETTE;
var TC = TEAM_COLORS;
var TCL = TEAM_COLORS_LIGHT;
var TE = TEAM_EMOJIS;

// ─── Supabase ────────────────────────────────────
var sb = null;
try {
  if (SUPABASE_URL !== "YOUR_SUPABASE_URL_HERE")
    sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
} catch(e) {}

async function dbLoad(c) {
  if (!sb) return null;
  try {
    const { data } = await sb.from("family_games").select("games").eq("family_code", c).single();
    return data?.games || null;
  } catch { return null; }
}
async function dbSave(c, g) {
  if (!sb) return;
  try {
    await sb.from("family_games").upsert(
      { family_code: c, games: g, updated_at: new Date().toISOString() },
      { onConflict: "family_code" }
    );
  } catch {}
}
async function dbLoadUser(u) { return dbLoad("user_" + u); }
async function dbSaveUser(u, d) { return dbSave("user_" + u, d); }

// ─── Shared Styles ───────────────────────────────
var S = {
  card: { background: C.card, border: "2px solid " + C.ink, borderRadius: 14, boxShadow: "3px 3px 0 " + C.ink },
  limeCard: { background: C.lime, border: "2px solid " + C.ink, borderRadius: 14, boxShadow: "3px 3px 0 " + C.ink },
};
var secHead = { fontSize: 11, textTransform: "uppercase", letterSpacing: 2, color: C.muted, marginBottom: 10, fontFamily: "'Courier New',monospace" };
var inp = { width: "100%", background: "#fff", border: "2px solid " + C.ink, borderRadius: 10, color: C.ink, padding: "12px 14px", fontSize: 15, boxSizing: "border-box", fontFamily: "'Courier New',monospace" };

// ─── Utility Functions ───────────────────────────
var calcTotal = function(p) {
  return p?.scores ? Object.values(p.scores).reduce(function(s, v) { return s + (parseFloat(v) || 0); }, 0) : 0;
};

var fmtTime = function(s) {
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, '0');
};

function medal(r) {
  return r === 1 ? "🥇" : r === 2 ? "🥈" : r === 3 ? "🥉" : r + ".";
}

function getRanks(a, fn) {
  var r = [];
  for (var i = 0; i < a.length; i++) {
    if (i === 0) r.push(1);
    else if (Math.abs(fn(a[i]) - fn(a[i-1])) < 0.001) r.push(r[i-1]);
    else r.push(i + 1);
  }
  return r;
}

function pkey(p) { return p.userId || p.name; }

function rname(p, fu) {
  if (p.userId && fu[p.userId]) return fu[p.userId].displayName;
  return p.name;
}

function gameName(g) {
  return g.gameName || g.customName || (BUILT_IN_GAMES[g.gameKey] ? BUILT_IN_GAMES[g.gameKey].name : null) || "Game";
}

function gameEmoji(g) {
  return g.emoji || (BUILT_IN_GAMES[g.gameKey] ? BUILT_IN_GAMES[g.gameKey].emoji : null) || "🎲";
}

function getFreqPlayers(hist, uid, n) {
  if (!uid) return [];
  var ct = {};
  hist.slice(0, 15).forEach(function(g) {
    var allP = g.teamMode && g.teams ? g.teams.flatMap(function(t) { return t.members; }) : g.players.map(function(p) { return p.name; });
    if (!g.players.some(function(p) { return p.userId === uid; }) && !allP.includes(uid)) return;
    allP.forEach(function(nm) { if (nm !== uid) ct[nm] = (ct[nm] || 0) + 1; });
  });
  return Object.entries(ct).sort(function(a, b) { return b[1] - a[1]; }).slice(0, n || 5).map(function(e) { return e[0]; });
}

// ─── Team Helpers ────────────────────────────────
function teamTotals(game) {
  if (!game.teamMode || !game.teams) return [];
  return game.teams.map(function(t, i) {
    var tp = game.players.find(function(p) { return p.name === t.name; });
    return { name: t.name, members: t.members, total: tp ? calcTotal(tp) : 0, idx: i };
  });
}

function getWinner(game) {
  if (game.teamMode && game.teams) {
    var tt = teamTotals(game);
    var sorted = tt.slice().sort(function(a, b) { return game.lowWins ? (a.total - b.total) : (b.total - a.total); });
    return sorted[0];
  }
  var sorted = game.players.slice().sort(function(a, b) { return game.lowWins ? (calcTotal(a) - calcTotal(b)) : (calcTotal(b) - calcTotal(a)); });
  return sorted[0];
}

// ─── Sound Effects ───────────────────────────────
function playSound(type) {
  try {
    var c = new (window.AudioContext || window.webkitAudioContext)();
    var t = c.currentTime;
    if (type === "frog") {
      [0, 0.25].forEach(function(off) {
        var o = c.createOscillator(), g = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
        o.connect(g); g.connect(c.destination); lfo.connect(lg); lg.connect(o.frequency);
        o.frequency.value = 180; lfo.frequency.value = 30; lg.gain.value = 60;
        g.gain.setValueAtTime(0.4, t+off); g.gain.exponentialRampToValueAtTime(0.01, t+off+0.2);
        o.start(t+off); o.stop(t+off+0.22); lfo.start(t+off); lfo.stop(t+off+0.22);
      });
    } else if (type === "cat") {
      var o = c.createOscillator(), g = c.createGain();
      o.connect(g); g.connect(c.destination);
      o.frequency.setValueAtTime(700, t); o.frequency.linearRampToValueAtTime(350, t+0.55);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.35, t+0.05); g.gain.linearRampToValueAtTime(0, t+0.6);
      o.start(t); o.stop(t+0.65);
    } else if (type === "bird") {
      [0, 0.4].forEach(function(off) {
        var o = c.createOscillator(), g = c.createGain(), vib = c.createOscillator(), vg = c.createGain();
        o.connect(g); g.connect(c.destination); vib.connect(vg); vg.connect(o.frequency);
        o.frequency.setValueAtTime(1800, t+off); o.frequency.linearRampToValueAtTime(1200, t+off+0.3);
        vib.frequency.value = 25; vg.gain.value = 120;
        g.gain.setValueAtTime(0, t+off); g.gain.linearRampToValueAtTime(0.3, t+off+0.03); g.gain.linearRampToValueAtTime(0, t+off+0.35);
        o.start(t+off); o.stop(t+off+0.37); vib.start(t+off); vib.stop(t+off+0.37);
      });
    } else if (type === "dino") {
      var o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain();
      var dist = c.createWaveShaper(), curve = new Float32Array(256);
      for (var i = 0; i < 256; i++) { var x = i*2/256-1; curve[i] = Math.sign(x)*(1-Math.exp(-3*Math.abs(x))); }
      dist.curve = curve; o.connect(dist); o2.connect(dist); dist.connect(g); g.connect(c.destination);
      o.frequency.setValueAtTime(90, t); o.frequency.linearRampToValueAtTime(45, t+0.8);
      o2.frequency.setValueAtTime(130, t); o2.frequency.linearRampToValueAtTime(55, t+0.8);
      o.type = "sawtooth"; o2.type = "square";
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.4, t+0.08); g.gain.linearRampToValueAtTime(0, t+0.9);
      o.start(t); o.stop(t+0.95); o2.start(t); o2.stop(t+0.95);
    } else {
      var o = c.createOscillator(), g = c.createGain();
      o.connect(g); g.connect(c.destination); o.frequency.value = 800; g.gain.value = 0.3;
      o.start(); o.stop(t+0.3);
    }
  } catch(e) {}
}

// ─── Leaderboard Builder ─────────────────────────
function buildLeaderboard(history, fu) {
  fu = fu || {};
  var players = {};

  history.forEach(function(game) {
    if (!game.finished || game.scoringType === "independent") return;

    if (game.teamMode && game.teams) {
      var tt = teamTotals(game);
      var sorted = tt.slice().sort(function(a, b) { return game.lowWins ? (a.total - b.total) : (b.total - a.total); });
      var winTotal = sorted[0] ? sorted[0].total : 0;

      tt.forEach(function(team) {
        var sz = Math.max(1, team.members.length);
        var isWin = team.total === winTotal;
        team.members.forEach(function(memberName) {
          var uid = null;
          for (var gi = 0; gi < history.length; gi++) {
            var g2 = history[gi];
            var found = g2.players.find(function(p) { return p.name === memberName && p.userId; });
            if (found) { uid = found.userId; break; }
          }
          var k = uid || memberName;
          var dn = uid && fu[uid] ? fu[uid].displayName : memberName;
          if (!players[k]) players[k] = { name: dn, key: k, wins: 0, games: 0, totalScore: 0, wWins: 0, wGames: 0 };
          players[k].name = dn;
          var tier = game.tier || DEFAULT_TIER;
          players[k].games += 1;
          players[k].wGames += tier;
          players[k].totalScore += Math.round(team.total / sz) * tier;
          if (isWin) { players[k].wins += 1/sz; players[k].wWins += tier/sz; }
        });
      });
    } else {
      var scores = game.players.map(calcTotal);
      var maxT = Math.max.apply(null, scores);
      var minT = Math.min.apply(null, scores);
      var winT = game.lowWins ? minT : maxT;

      game.players.forEach(function(p) {
        var k = pkey(p), dn = rname(p, fu);
        if (!players[k]) players[k] = { name: dn, key: k, wins: 0, games: 0, totalScore: 0, wWins: 0, wGames: 0 };
        players[k].name = dn;
        var tier = game.tier || DEFAULT_TIER;
        players[k].games += 1;
        players[k].wGames += tier;
        players[k].totalScore += calcTotal(p) * tier;
        if (calcTotal(p) === winT) { players[k].wins += 1; players[k].wWins += tier; }
      });
    }
  });

  // Independent game leaders
  var indGames = {};
  history.forEach(function(g) {
    if (!g.finished || g.scoringType !== "independent") return;
    var k = g.gameKey === "custom" ? gameName(g) : g.gameKey;
    if (!indGames[k]) indGames[k] = { entries: {} };
    g.players.forEach(function(p) {
      var sc = parseFloat(p.scores && p.scores.Score) || 0;
      var pk = pkey(p);
      if (!indGames[k].entries[pk]) indGames[k].entries[pk] = { total: 0, count: 0, name: rname(p, fu) };
      indGames[k].entries[pk].total += sc;
      indGames[k].entries[pk].count += 1;
    });
  });

  Object.values(indGames).forEach(function(ig) {
    var best = -1, effs = {};
    Object.entries(ig.entries).forEach(function(e) {
      var n = e[0], total = e[1].total, count = e[1].count;
      var eff = (total/count) * Math.min(1, count/INDIE_VOLUME_CAP);
      effs[n] = eff;
      if (eff > best) best = eff;
    });
    if (best <= 0) return;
    Object.entries(effs).forEach(function(e) {
      var n = e[0], eff = e[1];
      if (Math.abs(eff - best) < 0.001) {
        if (!players[n]) players[n] = { name: ig.entries[n] ? ig.entries[n].name : n, key: n, wins: 0, games: 0, totalScore: 0, wWins: 0, wGames: 0 };
        players[n].wins += 1; players[n].games += 1;
        players[n].wWins += 1; players[n].wGames += 1;
      }
    });
  });

  return Object.values(players).map(function(p) {
    return {
      name: p.name, key: p.key,
      wins: Math.round(p.wins * 100) / 100,
      games: p.games,
      wWins: p.wWins, wGames: p.wGames,
      winRate: p.wGames > 0 ? p.wWins / p.wGames : 0,
      avgScore: p.games > 0 ? Math.round(p.totalScore / p.games) : 0,
    };
  });
}

function buildIndependentRankings(history, gameKey, fu) {
  fu = fu || {};
  var players = {};
  history.forEach(function(g) {
    if (!g.finished || g.scoringType !== "independent") return;
    var k = g.gameKey === "custom" ? gameName(g) : g.gameKey;
    if (k !== gameKey) return;
    g.players.forEach(function(p) {
      var sc = parseFloat(p.scores && p.scores.Score) || 0;
      var pk = pkey(p), dn = rname(p, fu);
      if (!players[pk]) players[pk] = { name: dn, total: 0, count: 0, lastPlayed: null };
      players[pk].name = dn; players[pk].total += sc; players[pk].count += 1;
      var d = g.finishedAt || g.startedAt;
      if (!players[pk].lastPlayed || d > players[pk].lastPlayed) players[pk].lastPlayed = d;
    });
  });
  var ms = DEFAULT_MAX_SCORE;
  var found = history.find(function(g) {
    var k = g.gameKey === "custom" ? gameName(g) : g.gameKey;
    return k === gameKey && g.scoringType === "independent";
  });
  if (found && found.maxScore) ms = found.maxScore;

  return Object.values(players).map(function(p) {
    return {
      name: p.name, total: p.total, count: p.count, lastPlayed: p.lastPlayed,
      avg: p.count > 0 ? p.total / p.count : 0,
      effective: p.count > 0 ? (p.total / p.count) * Math.min(1, p.count / INDIE_VOLUME_CAP) : 0,
      maxScore: ms,
    };
  }).sort(function(a, b) { return b.effective - a.effective; });
}

// ─── New Game Creator ────────────────────────────
function newGame(gk, pn, cats, cn, ce, tm, teams, st, ms, user, fu, lw) {
  var def = BUILT_IN_GAMES[gk] || { name: cn, emoji: ce || "🎲", categories: cats, scoringType: st };
  var isInd = st === "independent" || def.scoringType === "independent";
  var categories = isInd ? ["Score"] : (gk === "custom" ? cats : def.categories);
  var emoji = gk === "custom" ? (ce || "🎲") : def.emoji;
  var maxScore = isInd ? (ms || def.maxScore || DEFAULT_MAX_SCORE) : null;
  var lowWins = !!(lw || def.lowWins);
  var gn = gk === "custom" ? (cn || "Custom Game") : def.name;
  var tier = TIER_OVERRIDES[gn] || def.tier || DEFAULT_TIER;
  var myName = user && fu && fu[user.userId] ? fu[user.userId].displayName : (user ? user.displayName : null);

  var players;
  if (tm && teams) {
    players = teams.map(function(t) {
      return { name: t.name, scores: Object.fromEntries(categories.map(function(c) { return [c, ""]; })) };
    });
  } else {
    players = pn.map(function(n) {
      return { name: n, scores: Object.fromEntries(categories.map(function(c) { return [c, ""]; })), userId: user && n === myName ? user.userId : undefined };
    });
  }

  return {
    id: Date.now(), gameKey: gk, gameName: gn, emoji: emoji, categories: categories,
    players: players, teamMode: !!tm, teams: tm ? teams : null,
    startedAt: new Date().toISOString(), finished: false,
    scoringType: isInd ? "independent" : "standard",
    maxScore: maxScore, lowWins: lowWins, tier: tier,
  };
}
