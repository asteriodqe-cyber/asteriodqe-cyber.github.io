/* ═══════════ 主题切换（localStorage + 系统偏好） ═══════════ */
(function () {
  var root = document.documentElement;
  var btn = document.querySelector('.theme-toggle');
  var saved = null;
  try { saved = localStorage.getItem('theme'); } catch (e) {}
  if (saved === 'light' || saved === 'dark') root.setAttribute('data-theme', saved);
  function current() {
    var t = root.getAttribute('data-theme');
    if (t === 'light' || t === 'dark') return t;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  var SUN = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="3.1" fill="currentColor"/><g stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.4 1.4M11.55 11.55l1.4 1.4M3.05 12.95l1.4-1.4M11.55 4.45l1.4-1.4"/></g></svg>';
  var MOON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M13.4 9.9A6.2 6.2 0 0 1 6.1 2.6a6.2 6.2 0 1 0 7.3 7.3Z"/></svg>';
  function render() { btn.innerHTML = current() === 'dark' ? SUN : MOON; }
  btn.addEventListener('click', function () {
    var next = current() === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('theme', next); } catch (e) {}
    render();
  });
  render();
})();

/* ═══════════ 像素玄猫（精灵图帧布局借鉴 oneko.js，MIT；已重着色为玄猫金瞳） ═══════════
   精灵图: 3x3 帧，每帧 32px（base64 内联在 style.css）
   row0: sit / blink / alert   row1: walkR1 / walkR2 / sleep1   row2: walkL1 / walkL2 / sleep2
   行为：追鼠标（沿地面）+ 眨眼/惊喜/入睡 + 位置记忆 + prefers-reduced-motion 不渲染
*/
(function () {
  // 系统开了"减少动态效果"就不渲染猫（oneko 的同款无障碍设计）
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.getElementById('px-cat').style.display = 'none';
    return;
  }

  var SCALE = window.innerWidth < 640 ? 2 : 3;
  var CELL = 32 * SCALE;          // 单帧显示尺寸
  var SHEET = 96 * SCALE;         // 整张精灵图显示尺寸

  var FR = {                      // 帧名 → [col, row]
    sit: [0, 0], blink: [1, 0], alert: [2, 0],
    walkR1: [0, 1], walkR2: [1, 1], sleep1: [2, 1],
    walkL1: [0, 2], walkL2: [1, 2], sleep2: [2, 2]
  };

  var cat = document.getElementById('px-cat');
  cat.style.width = CELL + 'px';
  cat.style.height = CELL + 'px';
  cat.style.backgroundSize = SHEET + 'px ' + SHEET + 'px';

  function setSprite(name) {
    var f = FR[name];
    cat.style.backgroundPosition = (-f[0] * CELL) + 'px ' + (-f[1] * CELL) + 'px';
  }

  // ── 状态（支持 localStorage 记忆：刷新后猫还在原地） ──
  var saved = null;
  try { saved = JSON.parse(localStorage.getItem('xuan-cat') || 'null'); } catch (e) {}
  var mode = 'sit';               // 'sit' | 'walk'
  var facing = (saved && saved.facing) || 1;
  var posX = (saved && typeof saved.posX === 'number')
    ? Math.max(8, Math.min(saved.posX, window.innerWidth - CELL - 8))
    : window.innerWidth - CELL - 36;
  var posBottom = 20;
  var walkFrame = 0;
  var lastPawX = posX;
  var sleeping = !!(saved && saved.sleeping);
  var lastActive = Date.now();    // 最后一次被鼠标"惊动"的时间

  // 鼠标追踪
  var mouseX = null;
  var mouseY = null;
  document.addEventListener('mousemove', function (e) {
    if (mouseX === null || Math.abs(e.clientX - mouseX) > 24 || Math.abs(e.clientY - mouseY) > 24) {
      lastActive = Date.now();
      if (sleeping) { sleeping = false; if (mode === 'sit') setSprite('alert'); }
    }
    mouseX = e.clientX;
    mouseY = e.clientY;
  });

  function applyPos() {
    cat.style.left = posX + 'px';
    cat.style.bottom = posBottom + 'px';
  }

  // ── 喵叫：WebAudio 合成 ──
  var audioCtx = null;
  function meow() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      var t = audioCtx.currentTime;
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(620, t);
      osc.frequency.linearRampToValueAtTime(900, t + 0.09);
      osc.frequency.linearRampToValueAtTime(430, t + 0.28);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.08, t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t); osc.stop(t + 0.35);
    } catch (e) {}
  }

  var MEOWS = ['喵~', '喵！', 'meow!', 'にゃん', '냥', 'miau'];
  function bubble() {
    var old = cat.querySelector('.meow-bubble');
    if (old) old.remove();
    var b = document.createElement('div');
    b.className = 'meow-bubble';
    b.textContent = MEOWS[Math.floor(Math.random() * MEOWS.length)];
    cat.appendChild(b);
    setTimeout(function () { b.remove(); }, 1200);
  }

  function spawnPaw(x) {
    var paw = document.createElement('div');
    paw.className = 'paw-print';
    paw.style.left = (x + CELL * 0.4) + 'px';
    paw.style.bottom = (posBottom + 2) + 'px';
    document.body.appendChild(paw);
    setTimeout(function () { paw.remove(); }, 1600);
  }

  // ── 主循环：追鼠标（沿地面水平走，像真猫在地板上跟着你） ──
  setInterval(function () {
    if (sleeping) return;
    var target = (mouseX === null) ? null : mouseX - CELL / 2;
    if (target === null) { if (mode === 'walk') { mode = 'sit'; setSprite('sit'); } return; }

    var dx = target - posX;
    if (Math.abs(dx) > 48) {
      // 起身后先愣一下（alert）再走，更像活物
      if (mode === 'sit' && Date.now() - lastActive < 400) {
        if (mode === 'sit') setSprite('alert');
        return;
      }
      mode = 'walk';
      facing = dx > 0 ? 1 : -1;
      posX += facing * 1.6;
      posX = Math.max(8, Math.min(posX, window.innerWidth - CELL - 8));
      applyPos();
      if (Math.abs(posX - lastPawX) > 42) { lastPawX = posX; spawnPaw(posX); }
    } else if (mode === 'walk') {
      mode = 'sit';
      facing = dx > 0 ? 1 : -1;   // 坐下后面朝你的光标
      setSprite('sit');
    }
  }, 16);

  // 走路换步（160ms/帧）
  setInterval(function () {
    if (mode !== 'walk' || sleeping) return;
    walkFrame = 1 - walkFrame;
    setSprite((facing === 1 ? 'walkR' : 'walkL') + (walkFrame ? '2' : '1'));
  }, 160);

  // ── 坐着时的小动作：眨眼 / 惊喜 / 久置入睡 ──
  (function idleLoop() {
    setTimeout(function () {
      if (mode === 'sit' && !sleeping) {
        var r = Math.random();
        if (r < 0.6) {
          setSprite('blink');
          setTimeout(function () { if (mode === 'sit' && !sleeping) setSprite('sit'); }, 180);
        } else {
          setSprite('alert');
          setTimeout(function () { if (mode === 'sit' && !sleeping) setSprite('sit'); }, 400);
        }
        if (Date.now() - lastActive > 30000) sleeping = true;  // 30 秒没人动鼠标就睡
      }
      idleLoop();
    }, 2500 + Math.random() * 4500);
  })();

  // 睡觉呼吸循环
  var sleepFrame = 0;
  setInterval(function () {
    if (sleeping) {
      mode = 'sit';
      sleepFrame = 1 - sleepFrame;
      setSprite(sleepFrame ? 'sleep2' : 'sleep1');
    }
  }, 900);

  // ── 点猫 = 撸猫：喵 + 气泡 + 弹跳，睡觉会被叫醒 ──
  cat.addEventListener('click', function () {
    meow();
    bubble();
    cat.classList.remove('boing');
    void cat.offsetWidth;
    cat.classList.add('boing');
    if (sleeping) { sleeping = false; setSprite('alert'); lastActive = Date.now(); }
  });

  // ── 刷新/关页前记住猫的状态 ──
  window.addEventListener('beforeunload', function () {
    try {
      localStorage.setItem('xuan-cat', JSON.stringify({ posX: posX, facing: facing, sleeping: sleeping }));
    } catch (e) {}
  });

  window.addEventListener('resize', function () {
    posX = Math.max(8, Math.min(posX, window.innerWidth - CELL - 8));
    applyPos();
  });

  applyPos();
  setSprite(sleeping ? 'sleep1' : 'sit');
})();
