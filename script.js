
"use strict";

const $ = id => document.getElementById(id);

const teams = [
  ["Argentina", "🇦🇷", "#75cfff", "#ffffff", "#14213d"],
  ["Brazil", "🇧🇷", "#ffdf00", "#229954", "#14213d"],
  ["Portugal", "🇵🇹", "#c92840", "#08754e", "#ffffff"],
  ["France", "🇫🇷", "#234aa5", "#16336d", "#ffffff"],
  ["Germany", "🇩🇪", "#f5f5f5", "#17191d", "#17191d"],
  ["Spain", "🇪🇸", "#d32939", "#ffd166", "#ffffff"],
  ["England", "🏴", "#f5f5f5", "#d4e4f5", "#14213d"],
  ["Bangladesh", "🇧🇩", "#087a50", "#e63946", "#ffffff"]
].map(([name, flag, shirt, stripe, ink]) => ({
  name, flag, shirt, stripe, ink
}));

const canvas = $("canvas");
const ctx = canvas.getContext("2d");

const W = 960;
const H = 600;

let match = null;
let selectedAim = 4;
let locked = false;
let soundEnabled = true;
let audio = null;
let animation = null;
let particles = [];
let session = 0;

const sleep = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

const rand = (min, max) =>
  min + Math.random() * (max - min);

const clamp = (n, min, max) =>
  Math.max(min, Math.min(max, n));

const zones = Array.from({ length: 9 }, (_, i) => ({
  x: 320 + (i % 3) * 160,
  y: 250 + Math.floor(i / 3) * 65
}));

// ==========================
// TEAM SELECTION
// ==========================

teams.forEach((team, i) => {
  $("home").add(new Option(team.flag + " " + team.name, i));
  $("away").add(new Option(team.flag + " " + team.name, i));
});

$("away").value = "1";

function jerseyNumber() {
  return clamp(Number($("number").value) || 10, 1, 99);
}

function getKit(team, away = false) {
  if (!away) return team;

  return {
    ...team,
    shirt: "#f2f5fa",
    stripe: team.shirt,
    ink: "#14213d"
  };
}

function preview() {
  const home = getKit(
    teams[Number($("home").value)],
    $("kitStyle").value === "away"
  );

  const away = teams[Number($("away").value)];

  for (const [id, team] of [
    ["homeKit", home],
    ["awayKit", away]
  ]) {
    const el = $(id);
    el.style.setProperty("--shirt", team.shirt);
    el.style.setProperty("--stripe", team.stripe);
    el.style.setProperty("--ink", team.ink);
  }

  $("kitName").textContent =
    ($("player").value.trim() || "CAPTAIN").toUpperCase();

  $("kitNumber").textContent = jerseyNumber();
}

["home", "away", "player", "number", "kitStyle"]
  .forEach(id => {
    $(id).addEventListener("input", preview);
  });

preview();

// ==========================
// AIM CONTROLS
// ==========================

const aimIcons = [
  "↖", "↑", "↗",
  "←", "●", "→",
  "↙", "↓", "↘"
];

aimIcons.forEach((icon, i) => {
  const button = document.createElement("button");
  button.textContent = icon;

  button.addEventListener("click", () => {
    if (!locked) selectAim(i);
  });

  $("aimGrid").appendChild(button);
});

function selectAim(i) {
  selectedAim = i;

  [...$("aimGrid").children].forEach((button, n) => {
    button.classList.toggle("active", n === i);
  });
}

selectAim(4);

$("power").addEventListener("input", () => {
  $("powerValue").textContent = $("power").value + "%";
});

function setLocked(value) {
  locked = value;
  $("shoot").disabled = value;

  [...$("aimGrid").children].forEach(button => {
    button.disabled = value;
  });
}

// ==========================
// MATCH SETUP
// ==========================

function startMatch() {
  if ($("home").value === $("away").value) {
    alert("Please select two different teams!");
    return;
  }

  session++;
  animation = null;
  particles = [];

  const home = teams[Number($("home").value)];

  match = {
    home,
    away: teams[Number($("away").value)],
    kit: getKit(home, $("kitStyle").value === "away"),
    difficulty: $("difficulty").value,
    player: $("player").value.trim() || "CAPTAIN",
    number: jerseyNumber(),
    homeShots: [],
    awayShots: []
  };

  $("menu").classList.add("hidden");
  $("results").classList.add("hidden");
  $("game").classList.remove("hidden");

  $("homeName").textContent =
    match.home.flag + " " + match.home.name;

  $("awayName").textContent =
    match.away.flag + " " + match.away.name;

  $("turn").textContent = "YOUR PENALTY";
  $("announcement").textContent = "SELECT YOUR TARGET";

  setLocked(false);
  updateScore();
}

function countGoals(shots) {
  return shots.filter(Boolean).length;
}

function shotSymbols(shots) {
  return [
    ...shots.map(goal => goal ? "●" : "✕"),
    ...Array(Math.max(0, 5 - shots.length)).fill("○")
  ].join(" ");
}

function updateScore() {
  if (!match) return;

  $("homeScore").textContent =
    countGoals(match.homeShots);

  $("awayScore").textContent =
    countGoals(match.awayShots);

  $("homeDots").textContent =
    shotSymbols(match.homeShots);

  $("awayDots").textContent =
    shotSymbols(match.awayShots);

  const round = match.homeShots.length + 1;

  $("round").textContent = round <= 5
    ? `ROUND ${round} / 5`
    : "SUDDEN DEATH";
}

// ==========================
// SHOT PHYSICS & AI
// ==========================

function calculateShot(zone, power, isCPU = false) {
  const corner = zone % 3 !== 1;

  const difficulty = {
    easy: 0.17,
    normal: 0.34,
    hard: 0.53
  }[match.difficulty];

  let missChance = 0.03;

  if (power > 84) {
    missChance += (power - 84) * 0.015;
  }

  if (power < 30) missChance += 0.08;
  if (corner && zone < 3) missChance += 0.025;

  if (isCPU) {
    missChance = 0.07;
  }

  const miss = Math.random() < missChance;

  let keeperZone;

  if (isCPU) {
    // Computer shoots; player's goalkeeper reacts.
    const playerSaveChance = 0.30;

    keeperZone = Math.random() < playerSaveChance
      ? zone
      : Math.floor(rand(0, 9));
  } else {
    const saveSkill = clamp(
      difficulty
      - (corner ? 0.08 : 0)
      - (power > 75 ? 0.10 : 0)
      + (power < 45 ? 0.10 : 0),
      0.05,
      0.75
    );

    keeperZone = Math.random() < saveSkill
      ? zone
      : Math.floor(rand(0, 9));
  }

  const dx = Math.abs(
    zone % 3 - keeperZone % 3
  );

  const dy = Math.abs(
    Math.floor(zone / 3) -
    Math.floor(keeperZone / 3)
  );

  const saved = !miss && dx === 0 && dy <= 1;

  return {
    zone,
    keeperZone,
    miss,
    saved,
    goal: !miss && !saved,
    power
  };
}

// ==========================
// SOUND EFFECTS
// ==========================

function playSound(type) {
  if (!soundEnabled) return;

  try {
    audio ??= new (
      window.AudioContext ||
      window.webkitAudioContext
    )();

    if (audio.state === "suspended") {
      audio.resume();
    }

    function tone(freq, duration, delay = 0) {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();

      oscillator.type = "triangle";
      oscillator.frequency.value = freq;

      const start = audio.currentTime + delay;

      gain.gain.setValueAtTime(0.08, start);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        start + duration
      );

      oscillator.connect(gain);
      gain.connect(audio.destination);

      oscillator.start(start);
      oscillator.stop(start + duration);
    }

    if (type === "kick") tone(120, 0.13);
    if (type === "save") tone(180, 0.35);
    if (type === "miss") tone(145, 0.4);

    if (type === "goal") {
      tone(500, 0.25);
      tone(650, 0.25, 0.13);
      tone(820, 0.4, 0.26);
    }
  } catch (error) {
    // Game works even if audio is unavailable.
  }
}

// ==========================
// MATCH RULES
// ==========================

function earlyWinner() {
  const h = countGoals(match.homeShots);
  const a = countGoals(match.awayShots);

  // Early finish applies only to the first five kicks.
  if (
    match.homeShots.length >= 5 &&
    match.awayShots.length >= 5
  ) {
    return false;
  }

  const homeRemaining =
    Math.max(0, 5 - match.homeShots.length);

  const awayRemaining =
    Math.max(0, 5 - match.awayShots.length);

  return (
    h > a + awayRemaining ||
    a > h + homeRemaining
  );
}

function matchFinished() {
  if (earlyWinner()) return true;

  // Both teams must complete the same number
  // of kicks before sudden-death results are decided.
  return (
    match.homeShots.length >= 5 &&
    match.homeShots.length === match.awayShots.length &&
    countGoals(match.homeShots) !==
    countGoals(match.awayShots)
  );
}

// ==========================
// CELEBRATION PARTICLES
// ==========================

function celebrate() {
  for (let i = 0; i < 70; i++) {
    particles.push({
      x: rand(120, 840),
      y: rand(-100, 130),
      vx: rand(-3, 3),
      vy: rand(1, 4),
      life: rand(50, 100),
      color: [
        "#ffd166",
        "#ffffff",
        "#66d9ff",
        "#ff6680"
      ][i % 4]
    });
  }
}

// ==========================
// ANIMATION CONTROL
// ==========================

function animateShot(outcome, token) {
  return new Promise(resolve => {
    animation = {
      outcome,
      start: performance.now(),
      duration: 1100,
      resolve,
      token
    };

    playSound("kick");
  });
}

// ==========================
// PENALTY SHOOTOUT
// ==========================

async function shoot() {
  if (locked || !match) return;

  setLocked(true);

  const token = session;

  $("turn").textContent = "YOUR PENALTY";
  $("announcement").textContent = "SHOOTING...";

  const shot = calculateShot(
    selectedAim,
    Number($("power").value)
  );

  await animateShot(shot, token);
  if (token !== session) return;

  match.homeShots.push(shot.goal);
  updateScore();

  $("announcement").textContent = shot.goal
    ? "⚽ GOOOOAL!"
    : shot.miss
      ? "❌ OFF TARGET!"
      : "🧤 WHAT A SAVE!";

  playSound(
    shot.goal ? "goal" : shot.miss ? "miss" : "save"
  );

  if (shot.goal) celebrate();

  await sleep(1100);
  if (token !== session) return;

  if (earlyWinner()) {
    endMatch();
    return;
  }

  // COMPUTER'S TURN
  $("turn").textContent = "COMPUTER PENALTY";

  $("announcement").textContent =
    match.away.name.toUpperCase() + " SHOOTING...";

  const cpu = calculateShot(
    Math.floor(rand(0, 9)),
    rand(45, 90),
    true
  );

  await animateShot(cpu, token);
  if (token !== session) return;

  match.awayShots.push(cpu.goal);
  updateScore();

  $("announcement").textContent = cpu.goal
    ? "⚽ OPPONENT SCORES!"
    : cpu.miss
      ? "❌ OPPONENT MISSES!"
      : "🧤 YOUR KEEPER SAVES!";

  playSound(
    cpu.goal ? "goal" : cpu.miss ? "miss" : "save"
  );

  if (cpu.goal) celebrate();

  await sleep(1100);
  if (token !== session) return;

  if (matchFinished()) {
    endMatch();
    return;
  }

  $("turn").textContent = "YOUR PENALTY";
  $("announcement").textContent = "SELECT YOUR TARGET";

  setLocked(false);
}

function endMatch() {
  const h = countGoals(match.homeShots);
  const a = countGoals(match.awayShots);
  const won = h > a;

  $("game").classList.add("hidden");
  $("results").classList.remove("hidden");

  $("trophy").textContent = won ? "🏆" : "🥈";

  $("resultTitle").textContent = won
    ? "YOU ARE THE CHAMPION!"
    : "MATCH FINISHED";

  $("finalScore").textContent =
    `${match.home.name} ${h} - ${a} ${match.away.name}`;

  $("resultInfo").textContent =
    `${match.homeShots.length} penalties taken` +
    (match.homeShots.length > 5
      ? " • Sudden Death Played"
      : " • Championship Shootout");
}

function returnMenu() {
  session++;

  // Resolve an unfinished animation before clearing it.
  if (animation) {
    animation.resolve();
    animation = null;
  }

  particles = [];
  match = null;

  $("game").classList.add("hidden");
  $("results").classList.add("hidden");
  $("menu").classList.remove("hidden");

  setLocked(false);
  preview();
}

// ==========================
// CANVAS DRAWING HELPERS
// ==========================

function rectangle(x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

function ellipse(x, y, rx, ry, color) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function line(x1, y1, x2, y2, color, width = 2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

// ==========================
// DRAW FOOTBALL PLAYER
// ==========================

function drawPlayer(x, y, scale, kit, keeper = false, tilt = 0) {
  ctx.save();

  ctx.translate(x, y);
  ctx.rotate(tilt);
  ctx.scale(scale, scale);

  ellipse(0, 6, 27, 8, "#0005");

  line(-12, -48, -18, -10, "#15243d", 12);
  line(12, -48, 18, -10, "#15243d", 12);

  rectangle(
    -22, -99, 44, 55,
    keeper ? "#ff8833" : kit.shirt
  );

  if (!keeper) {
    rectangle(-7, -99, 14, 55, kit.stripe);

    ctx.fillStyle = kit.ink;
    ctx.font = "bold 19px Arial";
    ctx.textAlign = "center";
    ctx.fillText(match?.number || 10, 0, -62);
  }

  line(-22, -91, -42, -62, "#dba17b", 11);
  line(22, -91, 42, -62, "#dba17b", 11);

  ellipse(0, -118, 17, 20, "#e4ad85");
  ellipse(0, -134, 17, 8, "#263348");

  if (keeper) {
    ellipse(-42, -62, 11, 9, "white");
    ellipse(42, -62, 11, 9, "white");
  }

  ctx.restore();
}

// ==========================
// DRAW FOOTBALL
// ==========================

function drawBall(x, y, r, rotation = 0) {
  ctx.save();

  ctx.translate(x, y);
  ctx.rotate(rotation);

  ellipse(0, 0, r, r, "#f8f8fa");

  ctx.beginPath();

  for (let i = 0; i < 5; i++) {
    const angle = -Math.PI / 2 + i * Math.PI * 2 / 5;

    const px = Math.cos(angle) * r * 0.45;
    const py = Math.sin(angle) * r * 0.45;

    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }

  ctx.closePath();
  ctx.fillStyle = "#17263a";
  ctx.fill();

  for (let i = 0; i < 5; i++) {
    const angle = i * Math.PI * 2 / 5;

    ellipse(
      Math.cos(angle) * r * 0.8,
      Math.sin(angle) * r * 0.8,
      r * 0.12,
      r * 0.12,
      "#17263a"
    );
  }

  ctx.restore();
}

// ==========================
// STADIUM RENDERING ENGINE
// ==========================

function draw(time) {
  const sky = ctx.createLinearGradient(0, 0, 0, 350);
  sky.addColorStop(0, "#071327");
  sky.addColorStop(1, "#29536b");

  rectangle(0, 0, W, H, sky);

  // STADIUM FLOODLIGHTS
  for (const x of [95, 865]) {
    const glow = ctx.createRadialGradient(
      x, 65, 8, x, 65, 240
    );

    glow.addColorStop(0, "#ffffff99");
    glow.addColorStop(1, "#ffffff00");

    rectangle(x - 240, -150, 480, 450, glow);
    rectangle(x - 38, 44, 76, 8, "#eff8ff");
  }

  // ANIMATED CROWD
  rectangle(0, 150, W, 155, "#15283e");

  for (let i = 0; i < 1000; i++) {
    const x = (i * 137) % W;
    const y = 158 + (i * 47) % 139;

    const colors = [
      "#e9c46a",
      "#b3d8f2",
      "#d7a5a5",
      "#6da5a2"
    ];

    const flicker = Math.sin(time * 0.002 + i) > 0.8;
    rectangle(x, y, 3, 3, flicker ? "#ffffff" : colors[i % 4]);
  }

  // FOOTBALL FIELD
  rectangle(0, 302, W, 298, "#126b3c");

  for (let i = 0; i < 8; i++) {
    rectangle(
      i * 120, 302, 120, 298,
      i % 2 ? "#167b43" : "#136d3b"
    );
  }

  line(0, 600, 260, 335, "#ffffff70", 3);
  line(960, 600, 700, 335, "#ffffff70", 3);

  // GOALPOST & NET
  const gx = 240;
  const gy = 206;
  const gw = 480;
  const gh = 206;

  rectangle(gx + 8, gy + 7, gw - 16, gh - 8, "#092536");

  for (let x = gx + 14; x < gx + gw; x += 24) {
    line(x, gy + 8, x, gy + gh, "#ffffff55", 1);
  }

  for (let y = gy + 8; y < gy + gh; y += 20) {
    line(gx + 8, y, gx + gw - 8, y, "#ffffff55", 1);
  }

  ctx.strokeStyle = "#f5faff";
  ctx.lineWidth = 10;
  ctx.strokeRect(gx, gy, gw, gh);

  let keeperX = 480;
  let keeperY = 401;
  let keeperTilt = 0;

  let ballX = 480;
  let ballY = 505;
  let ballR = 29;
  let ballRotation = 0;

  let runner = 0;

  // BALL & GOALKEEPER ANIMATION
  if (animation) {
    const t = clamp(
      (time - animation.start) / animation.duration,
      0, 1
    );

    const out = animation.outcome;
    const target = zones[out.zone];
    const keeperTarget = zones[out.keeperZone];

    const fly = clamp((t - 0.17) / 0.68, 0, 1);
    const ease = fly * fly * (3 - 2 * fly);

    runner = clamp(t / 0.25, 0, 1);

    ballX = 480 + (target.x - 480) * ease;
    ballY = 505 + (target.y - 505) * ease
      - 65 * Math.sin(Math.PI * fly);

    ballR = 29 - 15 * ease;
    ballRotation = t * 13;

    const dive = clamp((t - 0.22) / 0.47, 0, 1);

    keeperX = 480 + (keeperTarget.x - 480) * dive;
    keeperY = 401 + (keeperTarget.y - 335) * dive;

    keeperTilt = (
      keeperTarget.x < 480 ? -0.65 :
      keeperTarget.x > 480 ? 0.65 : 0
    ) * dive;

    if (out.miss) {
      ballX += fly * (target.x < 480 ? -140 : 140);
      ballY -= fly * 80;
    }

    if (t >= 1) {
      const completed = animation;
      animation = null;
      completed.resolve();
    }
  }

  // GOALKEEPER
  drawPlayer(
    keeperX,
    keeperY,
    0.85,
    {
      shirt: "#ff8833",
      stripe: "#ff8833",
      ink: "white"
    },
    true,
    keeperTilt
  );

  // FOOTBALL PLAYER
  if (match) {
    drawPlayer(
      335 + runner * 52,
      548 - runner * 14,
      1.03,
      match.kit,
      false,
      runner * 0.1
    );
  }

  // FOOTBALL
  drawBall(ballX, ballY, ballR, ballRotation);

  // AIM TARGET
  if (match && !animation && !locked) {
    const target = zones[selectedAim];

    ctx.beginPath();
    ctx.arc(target.x, target.y, 23, 0, Math.PI * 2);
    ctx.strokeStyle = "#ffdb65";
    ctx.lineWidth = 3;
    ctx.stroke();

    line(
      target.x - 36, target.y,
      target.x - 15, target.y,
      "#ffdb65"
    );

    line(
      target.x + 15, target.y,
      target.x + 36, target.y,
      "#ffdb65"
    );

    line(
      target.x, target.y - 36,
      target.x, target.y - 15,
      "#ffdb65"
    );

    line(
      target.x, target.y + 15,
      target.x, target.y + 36,
      "#ffdb65"
    );
  }

  // CELEBRATION CONFETTI
  particles = particles.filter(p => p.life > 0);

  for (const p of particles) {
    rectangle(p.x, p.y, 7, 4, p.color);

    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.07;
    p.life--;
  }

  requestAnimationFrame(draw);
}

// ==========================
// BUTTON EVENTS
// ==========================

$("start").addEventListener("click", startMatch);
$("shoot").addEventListener("click", shoot);
$("restart").addEventListener("click", returnMenu);
$("playAgain").addEventListener("click", returnMenu);

$("sound").addEventListener("click", () => {
  soundEnabled = !soundEnabled;

  $("sound").textContent = soundEnabled
    ? "🔊 SOUND ON"
    : "🔇 SOUND OFF";
});

// ==========================
// MOUSE / TOUCH AIM
// ==========================

canvas.addEventListener("pointerdown", event => {
  if (!match || locked) return;

  const rect = canvas.getBoundingClientRect();

  const x =
    (event.clientX - rect.left) / rect.width * W;

  const y =
    (event.clientY - rect.top) / rect.height * H;

  if (x < 240 || x > 720 || y < 206 || y > 412) {
    return;
  }

  let nearest = 0;
  let distance = Infinity;

  zones.forEach((zone, i) => {
    const d = (zone.x - x) ** 2 + (zone.y - y) ** 2;

    if (d < distance) {
      distance = d;
      nearest = i;
    }
  });

  selectAim(nearest);
});

// ==========================
// KEYBOARD CONTROLS
// ==========================

window.addEventListener("keydown", event => {
  if (!match || locked) return;

  if (
    ["INPUT", "SELECT", "TEXTAREA"].includes(
      document.activeElement.tagName
    )
  ) {
    return;
  }

  let row = Math.floor(selectedAim / 3);
  let col = selectedAim % 3;

  if (event.key === "ArrowLeft") {
    col = Math.max(0, col - 1);
  } else if (event.key === "ArrowRight") {
    col = Math.min(2, col + 1);
  } else if (event.key === "ArrowUp") {
    row = Math.max(0, row - 1);
  } else if (event.key === "ArrowDown") {
    row = Math.min(2, row + 1);
  } else if (event.code === "Space") {
    event.preventDefault();
    shoot();
    return;
  } else {
    return;
  }

  event.preventDefault();
  selectAim(row * 3 + col);
});

// START THE GAME ENGINE
requestAnimationFrame(draw);
