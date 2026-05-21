// ============================================================
// STEINS;GATE — Extended Widgets
// ============================================================
//   • BootSequence       — full-screen typing overlay on first load
//   • CharacterPortrait  — PNG + halftone + glow
//   • RightRail          — Worldline / PhoneWave / LabRoster / SERN
//   • CommandPalette     — ⌘K with El Psy Kongroo easter egg
//   • DossierPanel       — clicked avatar → bio overlay
//   • DMailModal         — send a D-Mail, world line shifts
// ============================================================

const { useState: useS, useEffect: useE, useRef: useR, useCallback: useCB, useMemo: useM } = React;

// ─── Character registry (must match EmailApp.jsx keys) ──────────────────────
// Each character has a static `img` (PNG) and an animated `gif` that plays
// while they are actively typing a reply.
const CHARS = {
  "makise.kurisu@viktor-kondria.org": {
    name: "Makise Kurisu", alias: "Christina", color: "#e08868",
    img: "img/kurisu.png",
    gif: "https://media.tenor.com/xxl4WidGyxYAAAAM/makise-kurisu-kurisu.gif",
    role: "Neuroscientist • 18", lab: "Lab Mem No.004",
    quote: "I'm not your assistant.", status: "online",
  },
  "barrel-titor@2ch.net": {
    name: "Itaru Hashida", alias: "Daru / Supah Hacker", color: "#7a96da",
    img: "img/daru.png",
    gif: "https://media.tenor.com/oRCxeeSxDwcAAAAM/daru-itaru-hashida.gif",
    role: "Hacker • 19", lab: "Lab Mem No.003",
    quote: "tutturu in binary, okarin", status: "online",
  },
  "mayushii@tutturu.jp": {
    name: "Mayuri Shiina", alias: "Mayushii", color: "#9ad8d2",
    img: "img/mayuri.png",
    gif: "https://media.tenor.com/OZao1uQfzOgAAAAM/mayuri-shiina-steins-gate.gif",
    role: "Hostage • 16", lab: "Lab Mem No.002",
    quote: "tutturu~ ☆", status: "online",
  },
  "m.kiryuu@r025.com": {
    name: "Kiryuu Moeka", alias: "Shining Finger", color: "#b486dc",
    img: "img/moeka.png",
    gif: "https://media.tenor.com/RvM79ZgnRoYAAAAM/moeka-kiryu-steins-gate.gif",
    role: "Reporter • 22", lab: "Lab Mem No.005",
    quote: "FB.", status: "obscured",
  },
  "nyan@future-gadget-lab.jp": {
    name: "Akiha Rumiho", alias: "Faris NyanNyan", color: "#dc7aaa",
    img: "img/faris.png",
    gif: "https://media.tenor.com/75Hu4jk2UHYAAAAM/steins-gate-faris-nyannyan.gif",
    role: "Akiba Idol • 17", lab: "Lab Mem No.006",
    quote: "nyaa~", status: "online",
  },
  "suzuha.amane@ibm5100.net": {
    name: "Suzuha Amane", alias: "John Titor", color: "#d8c46a",
    img: "img/suzuha.png",
    gif: "https://media.tenor.com/s3jpTCvGX2IAAAAM/steins-gate-suzuha-amane.gif",
    role: "Resistance • 2036", lab: "Lab Mem No.007",
    quote: "Don't send the D-Mail.", status: "transmitting",
  },
};
window.STEINS_CHARS = CHARS;

// ─── Typing-state subscription ──────────────────────────────────────────────
// Allows TypewriterText to broadcast which character is currently typing,
// so any avatar of that character can swap in the animated GIF.
let _sgTypingFrom = null;
const _sgTypingSubs = new Set();
function _sgSetTypingFrom(emailAddr) {
  _sgTypingFrom = emailAddr || null;
  _sgTypingSubs.forEach(fn => fn(_sgTypingFrom));
}
window.sgSetTypingFrom = _sgSetTypingFrom;
window.sgUseTypingFrom = function() {
  const [id, setId] = useS(_sgTypingFrom);
  useE(() => {
    _sgTypingSubs.add(setId);
    return () => _sgTypingSubs.delete(setId);
  }, []);
  return id;
};

// ─── Thinking-state subscription ─────────────────────────────────────────────
// "Thinking" = waiting for AI response (before TypewriterText starts).
// Cleared by TypewriterText as soon as the first character is typed.
let _sgThinkingFrom = null;
const _sgThinkingSubs = new Set();
function _sgSetThinkingFrom(emailAddr) {
  _sgThinkingFrom = emailAddr || null;
  _sgThinkingSubs.forEach(fn => fn(_sgThinkingFrom));
}
window.sgSetThinkingFrom = _sgSetThinkingFrom;
window.sgUseThinkingFrom = function() {
  const [id, setId] = useS(_sgThinkingFrom);
  useE(() => {
    _sgThinkingSubs.add(setId);
    return () => _sgThinkingSubs.delete(setId);
  }, []);
  return id;
};


// ─── Emotion system (all characters) ─────────────────────────────────────────
const FARIS_EMOTION_IMGS = {
  playful:   'img/faris_playful.png',
  anger:     'img/faris_anger.png',
  happiness: 'img/faris_happiness.png',
  confusion: 'img/faris_confusion.png',
  sadness:   'img/faris_sadness.png',
  fear:      'img/faris_fear.png',
  mischief:  'img/faris_mischief.png',
  surprise:  'img/faris_surprise.png',
};
window.FARIS_EMOTION_IMGS = FARIS_EMOTION_IMGS;

// CSS filter per emotion — applied to non-Faris portrait images
const EMOTION_FILTERS = {
  playful:   '',
  happiness: 'brightness(1.18) saturate(1.45)',
  anger:     'sepia(0.25) saturate(2.2) hue-rotate(330deg) brightness(1.05)',
  sadness:   'saturate(0.35) brightness(0.78)',
  fear:      'brightness(0.62) contrast(1.15) saturate(0.7)',
  confusion: 'hue-rotate(18deg) brightness(0.92) saturate(0.85)',
  mischief:  'brightness(1.08) contrast(1.12) saturate(1.25)',
  surprise:  'brightness(1.28) contrast(1.18) saturate(1.1)',
};
window.EMOTION_FILTERS = EMOTION_FILTERS;

// Emotion glows (box-shadow color tint per emotion)
const EMOTION_GLOWS = {
  playful:   null,
  happiness: 'rgba(255,220,80,0.7)',
  anger:     'rgba(220,60,60,0.7)',
  sadness:   'rgba(80,120,220,0.65)',
  fear:      'rgba(80,50,120,0.65)',
  confusion: 'rgba(180,140,220,0.6)',
  mischief:  'rgba(220,80,180,0.65)',
  surprise:  'rgba(255,255,255,0.55)',
};
window.EMOTION_GLOWS = EMOTION_GLOWS;

// Active emotion: { from: emailAddr, emotion: string }
let _sgActiveEmotion = { from: null, emotion: 'playful' };
const _sgActiveEmotionSubs = new Set();
window.sgSetActiveEmotion = function(from, emotion) {
  _sgActiveEmotion = { from: from || null, emotion: emotion || 'playful' };
  _sgActiveEmotionSubs.forEach(fn => fn(_sgActiveEmotion));
};
// Keep backward-compat alias for Faris
window.sgSetFarisEmotion = function(emotion) {
  window.sgSetActiveEmotion('nyan@future-gadget-lab.jp', emotion);
};


// ─── Character Portrait (PNG + glow) ─────────────────────────────────────────
// Inject typing-glow keyframe + visible scrollbar styling once
if (typeof document !== 'undefined' && !document.getElementById('sg-portrait-anim')) {
  const _s = document.createElement('style');
  _s.id = 'sg-portrait-anim';
  _s.textContent = `
    @keyframes sgPortraitGlow { 0%,100%{opacity:0.55} 50%{opacity:1} }
    /* Visible-but-subtle scrollbars on every scrollable surface */
    ::-webkit-scrollbar { width: 10px; height: 10px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb {
      background: rgba(200,195,185,0.22);
      border-radius: 5px;
      border: 2px solid transparent;
      background-clip: padding-box;
    }
    ::-webkit-scrollbar-thumb:hover { background: rgba(200,195,185,0.45); background-clip: padding-box; border: 2px solid transparent; }
    * { scrollbar-color: rgba(200,195,185,0.32) transparent; scrollbar-width: thin; }
  `;
  document.head.appendChild(_s);
}

function CharacterPortrait({ email, size = 36, ring = true, glitch = false, typing = false, thinking = false }) {
  const c = CHARS[email];
  const [hover, setHover] = useS(false);
  const [activeEmotion, setActiveEmotion] = useS(_sgActiveEmotion);
  const outerRef = useR(null);
  const [bubblePos, setBubblePos] = useS(null);
  useE(() => {
    _sgActiveEmotionSubs.add(setActiveEmotion);
    return () => _sgActiveEmotionSubs.delete(setActiveEmotion);
  }, []);
  useE(() => {
    if (!thinking || !outerRef.current) { setBubblePos(null); return; }
    const update = () => {
      const r = outerRef.current?.getBoundingClientRect();
      if (r) setBubblePos({ x: r.left + r.width / 2, y: r.top });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [thinking]);
  const isFaris = email === 'nyan@future-gadget-lab.jp';
  const isActive = activeEmotion.from === email;
  const emotion = isActive ? activeEmotion.emotion : (isFaris ? 'playful' : null);
  if (!c) {
    return (
      <div style={{
        width: size, height: size, borderRadius: "50%",
        background: "rgba(200,146,10,0.08)",
        border: "1px solid rgba(200,146,10,0.3)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "Share Tech Mono,monospace", color: "rgba(200,180,130,0.5)",
        fontSize: size * 0.4, flexShrink: 0,
      }}>?</div>
    );
  }
  return (
    <div ref={outerRef} style={{ position: "relative", flexShrink: 0, width: size, height: size }}>
      {/* Typing glow ring */}
      {typing && (
        <div style={{
          position: "absolute", inset: -4, borderRadius: "50%", zIndex: 2,
          border: `2px solid ${c.color}dd`,
          boxShadow: `0 0 14px ${c.color}cc, 0 0 28px ${c.color}77`,
          animation: "sgPortraitGlow 0.75s ease-in-out infinite",
          pointerEvents: "none",
        }}/>
      )}
      {/* Thought bubble — fixed position to escape stacking contexts */}
      {bubblePos && ReactDOM.createPortal(
        <div style={{
          position: "fixed",
          left: bubblePos.x,
          top: bubblePos.y - 8,
          transform: "translate(-50%, -100%)",
          zIndex: 9999, pointerEvents: "none",
          display: "flex", flexDirection: "column", alignItems: "center",
        }}>
          <div style={{
            background: "rgba(4,10,22,0.95)",
            border: `1px solid ${c.color}99`,
            borderRadius: 8, padding: "4px 10px",
            fontFamily: "Share Tech Mono,monospace", fontSize: 9,
            color: c.color, letterSpacing: "0.2em", whiteSpace: "nowrap",
            boxShadow: `0 0 12px ${c.color}55, inset 0 0 6px ${c.color}11`,
            display: "flex", alignItems: "center", gap: 4,
          }}>
            THINKING
            <span>
              <span style={{ animation: "pulse 1.2s 0s infinite" }}>·</span>
              <span style={{ animation: "pulse 1.2s 0.4s infinite" }}>·</span>
              <span style={{ animation: "pulse 1.2s 0.8s infinite" }}>·</span>
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, marginTop: 3 }}>
            <div style={{ width: 4, height: 4, borderRadius: "50%", background: c.color, opacity: 0.7 }}/>
            <div style={{ width: 3, height: 3, borderRadius: "50%", background: c.color, opacity: 0.5 }}/>
            <div style={{ width: 2, height: 2, borderRadius: "50%", background: c.color, opacity: 0.3 }}/>
          </div>
        </div>,
        document.body
      )}
      <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
        style={{
          width: size, height: size, position: "relative",
          borderRadius: "50%",
          background: `radial-gradient(circle at 30% 25%, ${c.color}33, rgba(2,6,18,0.9))`,
          boxShadow: (() => {
            const glowColor = isActive && emotion ? EMOTION_GLOWS[emotion] : null;
            const base = ring
              ? `0 0 0 1px ${c.color}${typing ? 'cc' : '66'}, 0 0 ${typing ? 18 : hover ? 16 : 8}px ${c.color}${typing ? 'aa' : '55'}, inset 0 0 8px rgba(0,0,0,0.6)`
              : "none";
            return glowColor ? `0 0 0 2px ${glowColor}, 0 0 14px ${glowColor}, ${base}` : base;
          })(),
          overflow: "hidden",
          transition: "box-shadow 0.3s ease, transform 0.25s ease, filter 0.3s ease",
          transform: hover ? "scale(1.04)" : "scale(1)",
          filter: '',
        }}>
        <img
          src={c.img}
          onError={e => { e.target.src = c.img; }}
          alt={c.name} draggable={false} style={{
          position: "absolute", inset: 0, width: "100%", height: "100%",
          objectFit: "cover", objectPosition: "center 18%",
          animation: glitch ? "glitchFlash 0.6s ease" : "none",
        }}/>
        {/* warm tint wash */}
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: `linear-gradient(160deg, ${c.color}1a 0%, transparent 50%, rgba(200,146,10,0.18) 100%)`,
        }}/>
      </div>
    </div>
  );
}
window.CharacterPortrait = CharacterPortrait;


// ─── Boot Sequence ──────────────────────────────────────────────────────────
const BOOT_LINES = [
  "[ FUTURE GADGET LAB / TERMINAL v0.0011 ]",
  "> mounting /dev/microwave   ............ OK",
  "> mounting /dev/phonewave   ............ OK",
  "> linking SERN observation feed ........ BLOCKED",
  "> attractor field ........................ α",
  "> divergence reading ..................... 0.571046%",
  "> auth handshake @amadeus ............... GRANTED",
  "> loading mailbox: hououin.kyouma ....... 6 unread",
  "",
  "EL PSY KONGROO.",
];

// ─── Title-screen save slots ────────────────────────────────────────────────
function GlowBtn({ onClick, disabled, style, hoverStyle, glowColor="rgba(200,146,10,0.7)", children }) {
  const [hov, setHov] = useS(false);
  const on = hov && !disabled;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        ...style,
        ...(on ? hoverStyle : {}),
        // snappy ON, instant OFF — button itself only scales, no glitch/shake
        transition: on
          ? "transform 0.07s cubic-bezier(0.2,0,0,1.2), background 0.12s, border-color 0.12s, box-shadow 0.12s"
          : "none",
        transform: on ? "scale(1.05)" : "scale(1)",
        opacity: disabled ? 0.38 : 1,
        color: on ? "#ffffff" : style.color,
        background: on ? (hoverStyle?.background || style.background) : style.background,
        backdropFilter: on ? (hoverStyle?.backdropFilter || style.backdropFilter || "blur(8px)") : (style.backdropFilter || "none"),
        WebkitBackdropFilter: on ? (hoverStyle?.backdropFilter || style.backdropFilter || "blur(8px)") : (style.backdropFilter || "none"),
        boxShadow: on ? (hoverStyle?.boxShadow || "none") : "none",
      }}
    >
      {/* Glitch is applied to TEXT only, not the button shell */}
      <span style={{
        display: "inline-block",
        animation: on ? "btnGlitch 0.16s steps(3) infinite" : "none",
      }}>{children}</span>
    </button>
  );
}

// ─── Slot Scanner Preview (hover over filled save) ──────────────────────────
function SlotPreview() {
  const CODES = ["0.571046", "1.130426", "0.000337", "0.409420", "1.048596", "0.337187", "0.823978"];
  const SYMBOLS = ["α", "β", "Δ", "γ", "Ω", "σ", "φ"];
  const rnd = () => Array.from({length:5}, () => Math.floor(Math.random()*16).toString(16)).join("").toUpperCase();
  const pickSym = () => SYMBOLS[Math.floor(Math.random()*SYMBOLS.length)];
  const pickCode = () => CODES[Math.floor(Math.random()*CODES.length)];
  const [rows, setRows] = useS(() => Array.from({length:3}, () => ({ hex: rnd(), sym: pickSym(), code: pickCode() })));
  useE(() => {
    const t = setInterval(() => {
      setRows(Array.from({length:3}, () => ({ hex: rnd(), sym: pickSym(), code: pickCode() })));
    }, 75);
    return () => clearInterval(t);
  }, []);
  return (
    <div style={{
      // absolute overlay on the RIGHT side — does NOT affect slot size
      position: "absolute", right: 10, top: 14, bottom: 14,
      paddingLeft: 8, borderLeft: "1px solid rgba(200,146,10,0.25)",
      display: "flex", flexDirection: "column", justifyContent: "center", gap: 2,
      fontFamily: "Share Tech Mono,monospace", fontSize: 7, letterSpacing: "0.06em",
      animation: "scanNumbers 0.15s steps(1) infinite",
      pointerEvents: "none",
    }}>
      {rows.map((r,i) => (
        <div key={i} style={{ display: "flex", gap: 6, alignItems: "center",
          color: i === 1 ? "rgba(240,216,144,0.95)" : "rgba(200,180,130,0.55)",
          textShadow: "1px 1px 2px rgba(0,0,0,0.85)" }}>
          <span>{r.hex}</span>
          <span style={{ color: i === 1 ? "#f0c870" : "rgba(200,180,130,0.75)" }}>{r.sym}</span>
          <span>{r.code}%</span>
        </div>
      ))}
    </div>
  );
}

// ─── Button Scanner (NEW GAME hover effect) ──────────────────────────────────────
function ButtonScanner({ hover }) {
  const CODES = ["0.571046", "1.130426", "0.000337", "0.409420", "1.048596", "0.337187", "0.823978"];
  const SYMBOLS = ["\u03b1", "\u03b2", "\u0394", "\u03b3", "\u03a9", "\u03c3", "\u03c6"];
  const rnd = () => Array.from({length:4}, () => Math.floor(Math.random()*16).toString(16)).join("").toUpperCase();
  const pickSym = () => SYMBOLS[Math.floor(Math.random()*SYMBOLS.length)];
  const pickCode = () => CODES[Math.floor(Math.random()*CODES.length)];
  const [cols, setCols] = useS(() => Array.from({length:6}, () => ({ hex: rnd(), sym: pickSym(), code: pickCode() })));
  useE(() => {
    const speed = hover ? 45 : 160;
    const t = setInterval(() => {
      setCols(Array.from({length:6}, () => ({ hex: rnd(), sym: pickSym(), code: pickCode() })));
    }, speed);
    return () => clearInterval(t);
  }, [hover]);
  return (
    <div style={{
      position: "absolute", inset: 0, display: "flex", justifyContent: "space-between",
      alignItems: "center", padding: "0 14px", pointerEvents: "none", overflow: "hidden",
    }}>
      <div style={{
        display: "flex", gap: 8, fontFamily: "Share Tech Mono,monospace",
        fontSize: 7, letterSpacing: "0.08em",
        animation: hover ? "btnScanIntense 0.1s steps(2) infinite" : "btnScanNumbers 0.35s steps(1) infinite",
      }}>
        {cols.slice(0,3).map((c,i) => (
          <span key={i} style={{ color: hover ? "rgba(240,216,144,0.95)" : "rgba(200,180,130,0.2)",
            transition: "color 0.12s" }}>
            {c.sym}{c.hex}
          </span>
        ))}
      </div>
      <div style={{
        display: "flex", gap: 8, fontFamily: "Share Tech Mono,monospace",
        fontSize: 7, letterSpacing: "0.08em",
        animation: hover ? "btnScanIntense 0.1s steps(2) infinite" : "btnScanNumbers 0.35s steps(1) infinite",
      }}>
        {cols.slice(3).map((c,i) => (
          <span key={i} style={{ color: hover ? "rgba(240,216,144,0.95)" : "rgba(200,180,130,0.2)",
            transition: "color 0.12s" }}>
            {c.code}%{c.sym}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Matrix Rain ────────────────────────────────────────────────────────────
// A single falling column of glyphs. The leading char is bright white with glow,
// trailing chars fade. Characters scramble periodically.
function MatrixColumn({ leftPct, speed, delay, mainColor, charSet, fontSize }) {
  const N = 22;
  const rndChar = () => charSet[Math.floor(Math.random() * charSet.length)];
  const [chars, setChars] = useS(() => Array.from({length: N}, rndChar));
  useE(() => {
    const id = setInterval(() => {
      setChars(prev => {
        const next = [...prev];
        for (let k = 0; k < 3; k++) next[Math.floor(Math.random() * N)] = rndChar();
        return next;
      });
    }, 70);
    return () => clearInterval(id);
  }, []);
  return (
    <div style={{
      position: "absolute",
      left: leftPct + "%", top: 0,
      animation: "matrixFall " + speed + "s linear infinite",
      animationDelay: delay + "s",
      fontFamily: "Share Tech Mono, monospace",
      fontSize: fontSize, lineHeight: 1.2,
      whiteSpace: "nowrap",
      pointerEvents: "none",
      willChange: "transform",
    }}>
      {chars.map((c, i) => (
        <div key={i} style={{
          color: i === 0 ? "#ffffff" : mainColor,
          opacity: i === 0 ? 1 : Math.max(0.04, 1 - (i / N) * 1.05),
          textShadow: i === 0
            ? "0 0 8px #ffffff, 0 0 14px " + mainColor
            : i < 3 ? "0 0 4px " + mainColor : "none",
        }}>{c}</div>
      ))}
    </div>
  );
}

// Matrix rain on one screen edge — multiple columns with varied speeds.
function MatrixRain({ side, mainColor, intense }) {
  const NUM_COLS = intense ? 16 : 12;
  // Hex digits + Greek letters + Katakana — gives the Steins;Gate / Matrix feel
  const charSet = useM(() => [
    "0","1","2","3","4","5","6","7","8","9",
    "A","B","C","D","E","F",
    "\u03b1","\u03b2","\u03b3","\u03b4","\u03a9","\u03a6","\u03a8","\u03a3","\u0394","\u0398","\u039b","\u03a0",
    "\u30a2","\u30a4","\u30a6","\u30a8","\u30aa","\u30ab","\u30ad","\u30af","\u30b1","\u30b3",
    "\u30b5","\u30b7","\u30b9","\u30bb","\u30bd","\u30bf","\u30c1","\u30c4","\u30c6","\u30c8",
    "\u30ca","\u30cb","\u30cc","\u30cd","\u30ce","\u30cf","\u30d2","\u30d5","\u30d8","\u30db",
  ], []);
  const fontSize = intense ? 14 : 13;
  const width = intense ? "32%" : "26%";
  const mask = side === "left"
    ? "linear-gradient(to right, black 0%, black 55%, transparent 100%)"
    : "linear-gradient(to left, black 0%, black 55%, transparent 100%)";
  return (
    <div style={{
      position: "absolute", top: 0, bottom: 0,
      [side]: 0, width,
      overflow: "hidden", pointerEvents: "none",
      maskImage: mask, WebkitMaskImage: mask,
      animation: "matrixIntroFade 0.4s ease forwards",
    }}>
      {Array.from({length: NUM_COLS}).map((_, i) => (
        <MatrixColumn key={i}
          leftPct={(i / NUM_COLS) * 100 + (Math.random() * 4 - 2)}
          speed={intense ? 1.2 + ((i * 0.37) % 1.4) : 2.0 + ((i * 0.31) % 1.6)}
          delay={(i * 0.21) % 2.5}
          mainColor={mainColor}
          charSet={charSet}
          fontSize={fontSize}
        />
      ))}
    </div>
  );
}


// ─── Transition overlays — pure zoom (no matrix rain, no loading screen) ───
// The zoom effect is applied to the title content below; these overlays are
// intentionally empty so the transition is just a clean zoom-into-game.
function NewGameTransition() { return null; }
function LoadTransition() { return null; }


function TitleSaveSlots({ onNewGame, onLoadGame }) {
  const mono = { fontFamily: "Share Tech Mono,monospace" };
  const NUM = 3;
  const readSlots = () => Array.from({ length: NUM }, (_, i) => {
    try { return JSON.parse(localStorage.getItem(`sg_save_slot_${i}`)); } catch { return null; }
  });
  const [slots, setSlots] = useS(readSlots);
  const [busy, setBusy] = useS(null);
  const [flash, setFlash] = useS(null);
  const [hovSlot, setHovSlot] = useS(null);
  const [selSlot, setSelSlot] = useS(0);
  const doFlash = (idx, msg) => { setFlash({ idx, msg }); setTimeout(() => setFlash(null), 1800); };

  const handleLoad = async (i) => {
    if (!slots[i]) return;
    setBusy({ idx: i, action: "load" });
    const fn = window.sg_loadGame;
    if (fn) await fn(i, () => {}, () => {});
    setBusy(null); doFlash(i, "✓ LOADED");
    // Mark this slot as the active slot for auto-save
    localStorage.setItem("sg_active_slot", String(i));
    setTimeout(() => onLoadGame(slots[i]), 450);
  };

  const [hovNewGame, setHovNewGame] = useS(false);

  const handleDelete = (i) => {
    if (!slots[i] || !confirm(`Delete save slot ${i + 1}?`)) return;
    localStorage.removeItem(`sg_save_slot_${i}`);
    setSlots(prev => { const n = [...prev]; n[i] = null; return n; });
  };

  const totalCh = () => { try { return (window.sg_CHAPTERS || []).length || 5; } catch { return 5; } };

  return (
    <div style={{ marginTop: 20 }}>
      {/* Section label */}
      <div style={{ ...mono, fontSize: 10, letterSpacing: "0.35em", color: "#ffffff", marginBottom: 12, fontWeight: "700",
        textAlign: "center", borderBottom: "1px solid rgba(255,255,255,0.1)", paddingBottom: 8 }}>
        GAME STATE
      </div>

      {/* Save slots */}
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        {slots.map((slot, i) => {
          const isBusy = busy?.idx === i;
          const isFlash = flash?.idx === i;
          const isHov = hovSlot === i;
          const doneChaps = slot ? Object.keys(slot.completed || {}).length : 0;
          const chatCount = slot ? Object.keys(slot.chats   || {}).length : 0;
          const mails     = slot?.stats?.emailsSent || 0;
          const tsLabel   = slot
            ? new Date(slot.ts).toLocaleString("de-DE", { day:"2-digit", month:"2-digit", year:"2-digit", hour:"2-digit", minute:"2-digit" })
            : null;
          const isSel = selSlot === i;
          return (
            <div key={i}
              onClick={() => setSelSlot(i)}
              onMouseEnter={() => setHovSlot(i)}
              onMouseLeave={() => setHovSlot(null)}
              style={{
                position: "relative",
                flex: 1, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8,
                cursor: "pointer",
                background: isSel ? "rgba(20,16,8,0.55)" : (isHov ? "rgba(2,6,18,0.55)" : "rgba(2,6,18,0.42)"),
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
                border: `1px solid rgba(200,146,10,${isSel ? 0.85 : isHov ? 0.55 : slot ? 0.22 : 0.1})`,
                boxShadow: isSel
                  ? "0 0 28px rgba(200,146,10,0.32), inset 0 0 18px rgba(200,146,10,0.10)"
                  : (isHov ? "0 0 18px rgba(200,146,10,0.18), inset 0 0 12px rgba(200,146,10,0.05)" : "none"),
                transition: "all 0.18s ease",
              }}>

              {/* Slot header */}
              <div style={{ display: "flex", alignItems: "center" }}>
                <span style={{ ...mono, fontSize: 10, letterSpacing: "0.42em",
                  color: "#f0c870", fontWeight: "700",
                  textShadow: "1px 1px 2px rgba(0,0,0,0.85), 0 0 8px rgba(200,146,10,0.35)" }}>
                  SLOT {i + 1}
                </span>
              </div>

              {/* Orange status dot removed */}

              {/* Hover popup — empty slot: START button */}
              {!slot && isHov && (
                <div style={{
                  position: "absolute", left: -1, right: -1, bottom: "100%", zIndex: 20,
                  display: "flex", gap: 4, padding: 4,
                  background: "rgba(2,6,18,0.92)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
                  border: "1px solid rgba(200,146,10,0.55)",
                  borderBottom: "none",
                  boxShadow: "0 -4px 18px rgba(0,0,0,0.6), 0 0 16px rgba(200,146,10,0.15)",
                  animation: "headerSlideIn 0.18s ease",
                }}>
                  <button onClick={(e) => {
                    e.stopPropagation();
                    localStorage.setItem("sg_active_slot", String(i));
                    localStorage.setItem("sg_chapters", "{}");
                    localStorage.setItem("sg_stats", JSON.stringify({ emailsSent:0, dmailsSent:0, aiRepliesReceived:0, emailsSentTo:{} }));
                    onNewGame();
                  }}
                    style={{ ...mono, flex: 1, fontSize: 8, letterSpacing: "0.2em", padding: "6px 0", cursor: "pointer",
                      background: "rgba(200,146,10,0.12)", border: "1px solid rgba(200,146,10,0.55)",
                      color: "#f0c870", fontWeight: "700", textShadow: "1px 1px 2px rgba(0,0,0,0.85)",
                      transition: "all 0.12s" }}
                    onMouseEnter={e => { e.currentTarget.style.background = "rgba(200,146,10,0.28)"; e.currentTarget.style.color = "#ffffff"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "rgba(200,146,10,0.12)"; e.currentTarget.style.color = "#f0c870"; }}
                  >▶ NEW GAME</button>
                </div>
              )}

              {/* Hover popup — filled slot: LOAD / DELETE */}
              {slot && isHov && (
                <div style={{
                  position: "absolute", left: -1, right: -1, bottom: "100%", zIndex: 20,
                  display: "flex", gap: 4, padding: 4,
                  background: "rgba(2,6,18,0.92)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
                  border: "1px solid rgba(200,146,10,0.55)",
                  borderBottom: "none",
                  boxShadow: "0 -4px 18px rgba(0,0,0,0.6), 0 0 16px rgba(200,146,10,0.15)",
                  animation: "headerSlideIn 0.18s ease",
                }}>
                  <button onClick={(e) => { e.stopPropagation(); handleLoad(i); }}
                    style={{ ...mono, flex: 1, fontSize: 8, letterSpacing: "0.2em", padding: "6px 0", cursor: "pointer",
                      background: "rgba(40,160,70,0.12)", border: "1px solid rgba(100,210,130,0.45)",
                      color: "#9be1a4", fontWeight: "700", textShadow: "1px 1px 2px rgba(0,0,0,0.85)",
                      transition: "all 0.12s" }}
                    onMouseEnter={e => { e.currentTarget.style.background = "rgba(40,160,70,0.28)"; e.currentTarget.style.color = "#ffffff"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "rgba(40,160,70,0.12)"; e.currentTarget.style.color = "#9be1a4"; }}
                  >▶ LOAD</button>
                  <button onClick={(e) => { e.stopPropagation(); handleDelete(i); }}
                    style={{ ...mono, flex: 1, fontSize: 8, letterSpacing: "0.2em", padding: "6px 0", cursor: "pointer",
                      background: "rgba(180,40,40,0.12)", border: "1px solid rgba(220,60,60,0.45)",
                      color: "rgba(230,120,120,0.95)", fontWeight: "700", textShadow: "1px 1px 2px rgba(0,0,0,0.85)",
                      transition: "all 0.12s" }}
                    onMouseEnter={e => { e.currentTarget.style.background = "rgba(180,40,40,0.32)"; e.currentTarget.style.color = "#ffffff"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "rgba(180,40,40,0.12)"; e.currentTarget.style.color = "rgba(230,120,120,0.95)"; }}
                  >✕ DELETE</button>
                </div>
              )}

              {/* Slot data */}
              {slot ? (
                <>
                  <div style={{ ...mono, fontSize: 9, color: isFlash ? "#7acaa8" : "#e8b85c", fontWeight: "700",
                    letterSpacing: "0.12em", transition: "all 0.18s",
                    textShadow: "1px 1px 2px rgba(0,0,0,0.85)" }}>
                    {isFlash ? flash.msg : tsLabel}
                  </div>
                  <div style={{ ...mono, fontSize: 7, color: "#d4a648", fontWeight: "700", letterSpacing: "0.18em",
                    textShadow: "1px 1px 2px rgba(0,0,0,0.85)" }}>
                    CH {doneChaps}/{totalCh()} · {mails} MAILS
                  </div>
                  {isHov && <SlotPreview />}
                </>
              ) : (
                <div style={{ ...mono, fontSize: 8, color: isFlash ? "#7acaa8" : "#d4a648", fontWeight: "700",
                  letterSpacing: "0.32em", textShadow: "1px 1px 2px rgba(0,0,0,0.85)" }}>
                  {isFlash ? flash.msg : "EMPTY"}
                </div>
              )}

              {/* Selected indicator bar */}
              {isSel && <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 2,
                background: "linear-gradient(90deg, transparent, #f0c870, transparent)" }}/>}
            </div>
          );
        })}
      </div>

      {/* Action row: NEW GAME — full width with scanner */}
      <div style={{ position: "relative", overflow: "hidden" }}
        onMouseEnter={() => setHovNewGame(true)}
        onMouseLeave={() => setHovNewGame(false)}>
        <GlowBtn onClick={() => {
            // Use the selected slot for auto-save during the new game
            localStorage.setItem("sg_active_slot", String(selSlot));
            // Reset progress for a fresh start
            localStorage.setItem("sg_chapters", "{}");
            localStorage.setItem("sg_stats", JSON.stringify({ emailsSent: 0, dmailsSent: 0, aiRepliesReceived: 0, emailsSentTo: {} }));
            onNewGame();
          }}
          style={{ ...mono, width: "100%", padding: "16px 0", fontSize: 13, letterSpacing: "0.5em", cursor: "pointer",
            background: "rgba(2,6,18,0.42)",
            backdropFilter: "blur(8px)",
            border: "1px solid rgba(200,146,10,0.45)",
            color: "#ffffff", fontWeight: "700" }}
          hoverStyle={{ background: "rgba(200,146,10,0.16)", borderColor: "rgba(200,146,10,0.9)", color: "#ffffff", letterSpacing: "0.56em", boxShadow: "0 0 22px rgba(200,146,10,0.32)" }}
        >▶ NEW GAME</GlowBtn>
        <ButtonScanner hover={hovNewGame} />
        <div style={{
          position: "absolute", top: 0, left: 0,
          width: "38%", height: "100%",
          background: "linear-gradient(90deg, transparent, rgba(240,216,144,0.38), rgba(255,255,255,0.22), rgba(240,216,144,0.12), transparent)",
          animation: "shimmerSlide 2.6s ease-in-out infinite",
          pointerEvents: "none",
        }}/>
      </div>
    </div>
  );
}

function BootSequence({ onDone, onLoadSave }) {
  const [line, setLine] = useS(0);
  const [glyphs, setGlyphs] = useS("");
  const [booted, setBooted] = useS(false);
  const [exiting, setExiting] = useS(false);
  const audioRef = useR(null); // AudioBufferSourceNode
  const audioCtxRef = useR(null);
  const audioFilterRef = useR(null);
  const audioGainRef = useR(null);
  const [unlocked, setUnlocked] = useS(false);

  // Preload audio on mount. Load from 0 (fastest buffering), then seek to
  // second 26 only after canplaythrough — so clicking plays instantly.
  useE(() => {
    const audio = new Audio('audio/grind.mp3');
    audio.loop = true;
    audio.volume = 0;
    audio.preload = 'auto';
    audioRef.current = audio;
    audio.addEventListener('canplaythrough', () => {
      try { audio.currentTime = 26; } catch(e) {}
    }, { once: true });
    audio.load();
  }, []);

  const unlock = () => {
    if (unlocked) return;
    setUnlocked(true);
    const audio = audioRef.current;
    if (!audio) return;

    // Wire up Web Audio API: source → lowpass filter → gain → destination
    // This enables muffleAndFade's high-quality exponential ramp path.
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const source = ctx.createMediaElementSource(audio);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 20000;
      filter.Q.value = 0.7;
      const gain = ctx.createGain();
      gain.gain.value = 0.16;
      source.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      audioCtxRef.current = ctx;
      audioFilterRef.current = filter;
      audioGainRef.current = gain;
    } catch (e) {
      // Fallback: start immediately at target volume, no fade
      audio.volume = 0.16;
    }
    audio.play().catch(() => {});
  };

  // Muffle (lowpass cutoff sweep down) and fade gain to 0 over `durationMs`.
  const muffleAndFade = (durationMs) => {
    const ctx = audioCtxRef.current;
    const filter = audioFilterRef.current;
    const gain = audioGainRef.current;
    if (ctx && filter && gain) {
      const now = ctx.currentTime;
      const dur = Math.max(0.1, durationMs / 1000);
      // Filter cutoff: 20k → 200 Hz (heavily muffled, like behind a wall)
      // Exponential ramp = perceptually linear pitch shift for smooth ear-pleasing fade
      filter.frequency.cancelScheduledValues(now);
      filter.frequency.setValueAtTime(filter.frequency.value, now);
      filter.frequency.exponentialRampToValueAtTime(200, now + dur);
      // Gentle Q boost mid-sweep for slight resonance, then ease back
      filter.Q.cancelScheduledValues(now);
      filter.Q.setValueAtTime(filter.Q.value, now);
      filter.Q.linearRampToValueAtTime(2.0, now + dur * 0.55);
      filter.Q.linearRampToValueAtTime(0.7, now + dur);
      // Exponential gain fade — sounds smoother than linear (matches human loudness perception)
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0001), now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    } else if (audioRef.current) {
      // Fallback: plain volume fade if Web Audio API unavailable
      const a = audioRef.current;
      const startVol = a.volume;
      const startTime = Date.now();
      const id = setInterval(() => {
        const t = Math.min(1, (Date.now() - startTime) / durationMs);
        a.volume = startVol * (1 - t);
        if (t >= 1) clearInterval(id);
      }, 30);
    }
  };

  // Hard-stop the grind audio (called at end of transition or on unmount).
  const stopAudio = () => {
    if (audioRef.current) {
      try { audioRef.current.pause(); audioRef.current.src = ''; } catch (e) {}
      audioRef.current = null;
    }
    if (audioCtxRef.current) {
      try { audioCtxRef.current.close(); } catch (e) {}
      audioCtxRef.current = null;
    }
  };

  useE(() => {
    return () => { stopAudio(); };
  }, []);

  const [transType, setTransType] = useS(null);

  const doExit = () => {
    onDone();
  };

  const enter = () => {
    stopAudio();
    setExiting(true);
    setTimeout(onDone, 800);
  };

  // Total transition durations — slightly longer for smoother feel
  const NEW_DUR = 1550;
  const LOAD_DUR = 2000;
  // Boot fade kicks in mid-zoom and overlaps the final reveal smoothly
  const NEW_FADE_AT = 850;
  const LOAD_FADE_AT = 1250;

  const startNewGame = () => {
    // Audio keeps playing — muffle and fade so it ends EXACTLY when the transition ends
    muffleAndFade(NEW_DUR);
    setTransType("new");
    // Mid-zoom: kick off boot fade-out so the screen blurs AS the menu zooms past camera
    setTimeout(() => {
        setExiting(true);
    }, NEW_FADE_AT);
    setTimeout(() => { stopAudio(); onDone(); }, NEW_DUR);
  };

  const startLoadGame = (slotData) => {
    muffleAndFade(LOAD_DUR);
    setTransType("load");
    setTimeout(() => {
      onLoadSave && onLoadSave(slotData);
        setExiting(true);
    }, LOAD_FADE_AT);
    setTimeout(() => { stopAudio(); onDone(); }, LOAD_DUR);
  };

  useE(() => {
    if (line >= BOOT_LINES.length) {
      const t = setTimeout(() => setBooted(true), 400);
      return () => clearTimeout(t);
    }
    const cur = BOOT_LINES[line];
    if (cur === "") { setLine(l => l + 1); return; }
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setGlyphs(cur.slice(0, i));
      if (i >= cur.length) {
        clearInterval(id);
        setTimeout(() => { setLine(l => l + 1); setGlyphs(""); }, line >= BOOT_LINES.length - 1 ? 350 : 60);
      }
    }, line === BOOT_LINES.length - 1 ? 55 : 12);
    return () => clearInterval(id);
  }, [line]);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999, overflow: "auto",
      background: "#000",
      display: "flex", alignItems: "center", justifyContent: "center",
      animation: exiting ? "bootFadeOut 0.9s cubic-bezier(0.4, 0, 0.6, 1) forwards" : "none",
      pointerEvents: exiting ? "none" : "auto",
      cursor: "default",
    }}>

      {/* ── Click-to-start overlay ── */}
      {!unlocked && (
        <div onClick={unlock} style={{
          position: "absolute", inset: 0, zIndex: 100,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          cursor: "pointer", background: "rgba(2,6,18,0.0)",
        }}>
          <div style={{
            fontFamily: "Share Tech Mono,monospace",
            fontSize: 18, letterSpacing: "0.45em",
            color: "#f0d890",
            textShadow: "0 0 8px #fff, 0 0 20px rgba(200,146,10,1), 0 0 40px rgba(200,146,10,0.8), 0 0 80px rgba(200,146,10,0.4)",
            animation: "pulse 1.6s ease-in-out infinite",
            pointerEvents: "none",
            marginTop: "72vh",
          }}>▶ CLICK TO START</div>
        </div>
      )}

      {/* background video — muted loop */}
      <video autoPlay muted loop playsInline preload="auto"
        style={{
          position: "absolute", inset: 0,
          width: "100%", height: "100%",
          objectFit: "cover",
          filter: "contrast(1.35) brightness(0.9) saturate(1.2)",
          pointerEvents: "none",
        }}
        src="video/intro.mp4"
        onLoadedMetadata={e => { try { e.target.currentTime = 57; } catch(_) {} }}
        onError={e => e.target.style.display='none'} />

      {/* vignette */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: "radial-gradient(ellipse 100% 100% at 50% 50%, rgba(2,6,18,0.28) 0%, rgba(2,6,18,0.72) 100%)",
      }}/>

      {/* CRT scanlines */}
      <div style={{ position: "absolute", inset: 0, opacity: 0.05, pointerEvents: "none",
        background: "repeating-linear-gradient(to bottom, transparent 0 2px, rgba(255,255,255,0.6) 2px 3px)" }}/>

      {/* ── title content (zooms when transition starts) ── */}
      <div style={{
        position: "relative", zIndex: 3, width: "min(820px, 90vw)",
        fontFamily: "Share Tech Mono,monospace", color: "#c8920a", padding: "24px 0",
        // Two animations: scale/blur with smooth ease-in cubic, opacity with its own curve
        // — keeps the menu readable until the last 15%, no jerky velocity changes.
        animation: transType === "new"
          ? "zoomMenuFast 1.55s cubic-bezier(0.55, 0, 0.4, 1) forwards, zoomMenuFadeOut 1.55s cubic-bezier(0.55, 0, 0.78, 0.4) forwards"
          : transType === "load"
          ? "zoomMenuSlow 2.0s cubic-bezier(0.55, 0, 0.4, 1) forwards, zoomMenuFadeOut 2.0s cubic-bezier(0.55, 0, 0.78, 0.4) forwards"
          : "none",
        transformOrigin: "50% 50%",
        pointerEvents: transType ? "none" : "auto",
        willChange: transType ? "transform, opacity, filter" : "auto",
        backfaceVisibility: "hidden",
      }}>
        <div style={{ fontFamily: '"IM Fell English",serif', fontSize: 58, color: "#f0d890", letterSpacing: "-0.02em", marginBottom: 20, textAlign: "center",
          textShadow: "0 0 40px rgba(240,216,144,0.55), 0 2px 24px rgba(0,0,0,0.9)" }}>
          Steins<span style={{ color: "#c8920a" }}>;</span>Gate
          <div style={{ fontSize: 13, fontFamily: "Share Tech Mono,monospace", letterSpacing: "0.55em", color: "rgba(200,146,10,0.95)", marginTop: 4, textShadow: "none" }}>RE:BOOT · MAIL TERMINAL</div>
        </div>

        {/* terminal box — unified glass panel matching save slots */}
        <div style={{ padding: "22px 28px",
          background: "rgba(2,6,18,0.42)",
          backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
          border: "1px solid rgba(200,146,10,0.28)",
          boxShadow: "0 0 50px rgba(200,146,10,0.08), inset 0 0 24px rgba(0,0,0,0.28)",
          minHeight: 200 }}>
          {BOOT_LINES.slice(0, line).map((l, i) => (
            <div key={i} style={{
              fontSize: 14, letterSpacing: "0.05em",
              color: l.startsWith("[") ? "#f0d890" : l === "EL PSY KONGROO." ? "#f0d890" : "rgba(230,215,175,1)",
              fontWeight: l === "EL PSY KONGROO." ? "bold" : "normal",
              marginBottom: 4,
              textShadow: l === "EL PSY KONGROO." ? "0 0 20px rgba(240,216,144,1)" : "0 0 6px rgba(200,180,130,0.3), 0 1px 4px rgba(0,0,0,0.8)",
            }}>{l || " "}</div>
          ))}
          {!booted && line < BOOT_LINES.length && (
            <div style={{ fontSize: 14, letterSpacing: "0.05em", color: "rgba(220,200,160,0.9)", textShadow: "0 1px 4px rgba(0,0,0,0.8)" }}>
              {glyphs}<span style={{ background: "#c8920a", color: "#02060e", padding: "0 4px", marginLeft: 1, animation: "pulse 1.1s infinite" }}>▍</span>
            </div>
          )}
        </div>

        <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", fontSize: 11, letterSpacing: "0.25em",
          fontFamily:"Share Tech Mono,monospace", color: "#ffffff", fontWeight: "bold",
          textShadow: "1px 1px 3px rgba(0,0,0,0.95), 0 0 12px rgba(0,0,0,0.8)" }}>
          <span>SERN.UNINTERCEPTED</span><span>ATTRACTOR α</span><span>WORLD LINE 0.571046</span>
        </div>

        {booted && unlocked && (
          <div style={{ animation: "bodyFadeIn 0.5s ease" }}>
            <TitleSaveSlots onNewGame={startNewGame} onLoadGame={startLoadGame} />
          </div>
        )}
      </div>

      {/* Transition overlays — fullscreen, above everything */}
      {transType === "new" && <NewGameTransition />}
      {transType === "load" && <LoadTransition />}
    </div>
  );
}
window.BootSequence = BootSequence;


// ─── Worldline Graph ────────────────────────────────────────────────────────
function WorldlineGraph({ divergence }) {
  const [t, setT] = useS(0);

  useE(() => {
    let raf;
    const tick = () => { setT(performance.now() / 1000); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const w = 220, h = 120;

  const path = (phase, amp) => {
    let d = `M 0 ${h/2}`;
    for (let x = 0; x <= w; x += 4) {
      const y = h/2
        + Math.sin((x / 28) + phase + t * 0.2) * amp
        + Math.sin((x / 11) + phase * 1.3 + t * 0.5) * (amp * 0.3);
      d += ` L ${x} ${y}`;
    }
    return d;
  };

  const markerX = (Math.sin(t * 0.4) * 0.5 + 0.5) * w;
  const markerY = h/2
    + Math.sin(markerX / 28 + t * 0.2) * 18
    + Math.sin(markerX / 11 + t * 0.5) * 5.4;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <span style={{ fontFamily: "Share Tech Mono,monospace", fontSize: 8, color: "rgba(200,195,185,0.32)", letterSpacing: "0.2em" }}>WORLD LINE</span>
        <span style={{ fontFamily: "Share Tech Mono,monospace", fontSize: 8, color: "rgba(200,195,185,0.25)", letterSpacing: "0.15em" }}>α &lt; 1.000000 &lt; β</span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: 110, display: "block" }}>
        <defs>
          <linearGradient id="wlGrad" x1="0" x2="1">
            <stop offset="0%" stopColor="#3a5a8a" stopOpacity="0.2"/>
            <stop offset="50%" stopColor="rgba(200,195,185,0.8)" stopOpacity="0.35"/>
            <stop offset="100%" stopColor="#a04040" stopOpacity="0.2"/>
          </linearGradient>
        </defs>
        {/* grid */}
        {[0.25, 0.5, 0.75].map(p => (
          <line key={p} x1="0" y1={h*p} x2={w} y2={h*p} stroke="rgba(200,146,10,0.07)" strokeDasharray="2 4"/>
        ))}
        <line x1="0" y1={h/2} x2={w} y2={h/2} stroke="rgba(200,195,185,0.09)" strokeDasharray="3 3"/>
        {/* attractor band */}
        <rect x="0" y={h/2 - 24} width={w} height="48" fill="url(#wlGrad)" opacity="0.4"/>
        {/* curves */}
        <path d={path(0, 22)} stroke="rgba(120,160,220,0.55)" strokeWidth="1" fill="none"/>
        <path d={path(1.2, 14)} stroke="rgba(200,195,185,0.42)" strokeWidth="1.2" fill="none"/>
        <path d={path(2.4, 28)} stroke="rgba(220,90,90,0.45)" strokeWidth="1" fill="none"/>
        {/* divergence labels */}
        <text x="6" y="14" fill="rgba(120,160,220,0.7)" fontFamily="Share Tech Mono,monospace" fontSize="7" letterSpacing="0.15em">α  0.337187</text>
        <text x="6" y={h - 6} fill="rgba(220,90,90,0.7)" fontFamily="Share Tech Mono,monospace" fontSize="7" letterSpacing="0.15em">β  1.130426</text>
        <text x={w - 60} y="14" fill="rgba(200,146,10,0.85)" fontFamily="Share Tech Mono,monospace" fontSize="7" letterSpacing="0.15em">CURRENT</text>
        {/* moving marker */}
        <circle cx={markerX} cy={markerY} r="4" fill="rgba(230,225,215,0.9)" opacity="0.9">
          <animate attributeName="r" values="3;6;3" dur="1.6s" repeatCount="indefinite"/>
        </circle>
        <circle cx={markerX} cy={markerY} r="2" fill="#fff"/>
      </svg>
      <div style={{ marginTop: 4, display: "flex", justifyContent: "space-between", fontFamily: "Share Tech Mono,monospace", fontSize: 8, letterSpacing: "0.18em" }}>
        <span style={{ color: "rgba(210,210,210,0.32)" }}>READING</span>
        <span style={{ color: "rgba(230,225,215,0.9)", textShadow: "0 0 8px rgba(240,216,144,0.4)" }}>{divergence}</span>
      </div>
    </div>
  );
}
window.WorldlineGraph = WorldlineGraph;


// ─── PhoneWave (D-Mail panel) ───────────────────────────────────────────────
function PhoneWave({ onSendDMail }) {
  const [open, setOpen] = useS(false);
  const [msg, setMsg] = useS("");
  const [target, setTarget] = useS("48h ago");
  const [stage, setStage] = useS("idle"); // idle | charging | sent | shifted

  const send = () => {
    if (!msg.trim()) return;
    setStage("charging");
    setTimeout(() => {
      setStage("sent");
      onSendDMail && onSendDMail({ msg, target });
      setTimeout(() => setStage("shifted"), 800);
      setTimeout(() => { setStage("idle"); setOpen(false); setMsg(""); }, 2400);
    }, 1300);
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        {/* Flip phone (CSS) */}
        <div style={{ position: "relative", width: 56, height: 92, flexShrink: 0 }}>
          <div style={{
            position: "absolute", inset: 0,
            background: "linear-gradient(180deg, #1d0c08 0%, #2a0f08 60%, #160805 100%)",
            border: "1px solid #4a1a10",
            borderRadius: "6px 6px 8px 8px",
            boxShadow: `inset 0 1px 0 #5a2010, 0 8px 18px rgba(0,0,0,0.5), 0 0 ${stage==="charging"?22:6}px ${stage==="charging"?"#ff5a3a":"rgba(200,195,185,0.09)"}`,
            transition: "box-shadow 0.2s",
          }}/>
          {/* hinge */}
          <div style={{ position: "absolute", left: 4, right: 4, top: "44%", height: 3, background: "#0a0303", borderTop: "1px solid #5a2010" }}/>
          {/* screen */}
          <div style={{
            position: "absolute", left: 6, right: 6, top: 8, height: 30,
            background: stage === "charging" ? "#ff8a3a" : stage === "sent" ? "#5acaff" : "#2a3a14",
            borderRadius: 2,
            boxShadow: "inset 0 0 6px rgba(0,0,0,0.6)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "Share Tech Mono,monospace", fontSize: 6, color: "rgba(0,0,0,0.6)", letterSpacing: "0.2em",
            transition: "background 0.2s",
          }}>
            {stage === "idle" && "PHONEWAVE"}
            {stage === "charging" && <span style={{ animation: "pulse 0.4s infinite" }}>RAMPING…</span>}
            {stage === "sent" && "D-MAIL ▶"}
            {stage === "shifted" && "ATTR. SHIFT"}
          </div>
          {/* keypad */}
          <div style={{
            position: "absolute", left: 6, right: 6, top: 50, bottom: 6,
            display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 2,
          }}>
            {Array.from({length: 12}).map((_, i) => (
              <div key={i} style={{
                background: "#3a160c", borderRadius: 1, fontSize: 5,
                color: "rgba(255,200,150,0.5)", display: "flex",
                alignItems: "center", justifyContent: "center",
                fontFamily: "Share Tech Mono,monospace",
              }}>{["1","2","3","4","5","6","7","8","9","*","0","#"][i]}</div>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "Share Tech Mono,monospace", fontSize: 8, color: "rgba(200,195,185,0.32)", letterSpacing: "0.22em", marginBottom: 4 }}>FUTURE GADGET #8</div>
          <div style={{ fontFamily: '"IM Fell English",serif', fontSize: 13, color: "rgba(230,225,215,0.9)", lineHeight: 1.1, marginBottom: 6 }}>Phone Microwave</div>
          <div style={{ fontFamily: "Share Tech Mono,monospace", fontSize: 8, color: "rgba(210,210,210,0.38)", lineHeight: 1.5, letterSpacing: "0.04em", marginBottom: 8 }}>
            Transmits text 36 chars max to the past via SERN's LHC. Side effect: bananas turn to gel.
          </div>
          <button onClick={() => setOpen(o => !o)} style={{
            width: "100%", padding: "5px 8px",
            background: open ? "rgba(200,146,10,0.22)" : "rgba(200,146,10,0.08)",
            border: "1px solid rgba(200,195,185,0.25)",
            color: "rgba(230,225,215,0.9)",
            fontFamily: "Share Tech Mono,monospace", fontSize: 9, letterSpacing: "0.2em",
            cursor: "pointer",
          }}>{open ? "× CANCEL" : "▶ COMPOSE D-MAIL"}</button>
        </div>
      </div>

      {open && (
        <div style={{ marginTop: 10, padding: "10px 10px 10px",
          background: "rgba(200,146,10,0.04)",
          border: "1px solid rgba(200,195,185,0.13)",
        }}>
          <div style={{ fontFamily: "Share Tech Mono,monospace", fontSize: 7, color: "rgba(200,195,185,0.28)", letterSpacing: "0.22em", marginBottom: 4 }}>TARGET TIME</div>
          <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap" }}>
            {["1h ago", "48h ago", "1 week", "2010-08", "Pre-IBN"].map(t => (
              <button key={t} onClick={() => setTarget(t)} disabled={stage !== "idle"} style={{
                fontFamily: "Share Tech Mono,monospace", fontSize: 8, letterSpacing: "0.1em",
                padding: "3px 6px", cursor: stage === "idle" ? "pointer" : "not-allowed",
                background: target === t ? "rgba(200,195,185,0.15)" : "transparent",
                border: `1px solid ${target === t ? "rgba(200,146,10,0.6)" : "rgba(200,195,185,0.13)"}`,
                color: target === t ? "rgba(230,225,215,0.9)" : "rgba(210,210,210,0.45)",
              }}>{t}</button>
            ))}
          </div>
          <div style={{ fontFamily: "Share Tech Mono,monospace", fontSize: 7, color: "rgba(200,195,185,0.28)", letterSpacing: "0.22em", marginBottom: 4 }}>MESSAGE • {36 - msg.length} chars left</div>
          <textarea value={msg} onChange={e => setMsg(e.target.value.slice(0, 36))} disabled={stage !== "idle"}
            placeholder="warn past self..."
            rows={2}
            style={{
              width: "100%", padding: "6px 8px",
              background: "rgba(2,6,18,0.55)", border: "1px solid rgba(200,195,185,0.15)",
              color: "rgba(220,205,170,0.9)", fontFamily: "Share Tech Mono,monospace",
              fontSize: 10, letterSpacing: "0.04em", outline: "none", resize: "none", lineHeight: 1.5,
            }}/>
          <button onClick={send} disabled={stage !== "idle" || !msg.trim()} style={{
            marginTop: 8, width: "100%", padding: "6px 8px",
            background: stage === "idle" && msg.trim() ? "linear-gradient(180deg, #c8920a 0%, #8a6010 100%)" : "rgba(200,146,10,0.05)",
            border: "1px solid rgba(200,195,185,0.32)",
            color: stage === "idle" && msg.trim() ? "#02060e" : "rgba(200,180,130,0.3)",
            fontFamily: "Share Tech Mono,monospace", fontSize: 9, letterSpacing: "0.25em",
            cursor: stage === "idle" && msg.trim() ? "pointer" : "not-allowed",
            fontWeight: "bold",
          }}>
            {stage === "idle" && "▶ TRANSMIT TO PAST"}
            {stage === "charging" && "⟳ MICROWAVE RAMPING"}
            {stage === "sent" && "✓ TRANSMITTED"}
            {stage === "shifted" && "⚠ WORLD LINE SHIFTED"}
          </button>
        </div>
      )}
    </div>
  );
}
window.PhoneWave = PhoneWave;


// ─── Lab Roster ─────────────────────────────────────────────────────────────
function LabRoster({ onPick }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
        <span style={{ fontFamily: "Share Tech Mono,monospace", fontSize: 8, color: "rgba(200,195,185,0.32)", letterSpacing: "0.22em" }}>LAB ROSTER</span>
        <span style={{ fontFamily: "Share Tech Mono,monospace", fontSize: 7, color: "rgba(200,195,185,0.22)", letterSpacing: "0.15em" }}>7/7</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {Object.entries(CHARS).map(([email, c]) => (
          <button key={email} onClick={() => onPick && onPick(email)} style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "5px 6px",
            background: "transparent", border: "1px solid transparent",
            cursor: "pointer", textAlign: "left",
            transition: "background 0.15s, border-color 0.15s",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(200,146,10,0.06)"; e.currentTarget.style.borderColor = "rgba(200,195,185,0.11)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "transparent"; }}>
            <CharacterPortrait email={email} size={26} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: "Share Tech Mono,monospace", fontSize: 9, color: "rgba(215,215,215,0.80)", letterSpacing: "0.04em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.alias}</div>
              <div style={{ fontFamily: "Share Tech Mono,monospace", fontSize: 7, color: "rgba(200,195,185,0.28)", letterSpacing: "0.12em" }}>{c.lab}</div>
            </div>
            <span style={{
              width: 5, height: 5, borderRadius: "50%",
              background: c.status === "online" ? "#7acaa8" : c.status === "transmitting" ? "rgba(200,195,185,0.8)" : "#a04040",
              boxShadow: `0 0 6px ${c.status === "online" ? "#7acaa8" : c.status === "transmitting" ? "rgba(200,195,185,0.8)" : "#a04040"}`,
              animation: c.status === "transmitting" ? "pulse 1.2s infinite" : "none",
              flexShrink: 0,
            }}/>
          </button>
        ))}
      </div>
    </div>
  );
}
window.LabRoster = LabRoster;


// ─── SERN Surveillance Indicator ────────────────────────────────────────────
function SernIndicator() {
  const [t, setT] = useS(0);
  useE(() => {
    const id = setInterval(() => setT(x => x + 1), 1500);
    return () => clearInterval(id);
  }, []);
  const noise = Math.sin(t) * 0.5 + 0.5;
  return (
    <div style={{
      padding: "8px 10px",
      background: `linear-gradient(90deg, rgba(160,40,40,${0.04 + noise * 0.06}) 0%, transparent 100%)`,
      border: "1px solid rgba(160,40,40,0.25)",
      display: "flex", alignItems: "center", gap: 8,
    }}>
      <div style={{
        width: 8, height: 8, borderRadius: "50%",
        background: "#c84040",
        boxShadow: "0 0 10px #c84040",
        animation: "pulse 1.4s infinite",
      }}/>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: "Share Tech Mono,monospace", fontSize: 8, color: "#e8a0a0", letterSpacing: "0.22em" }}>SERN OBSERVATION</div>
        <div style={{ fontFamily: "Share Tech Mono,monospace", fontSize: 7, color: "rgba(232,160,160,0.55)", letterSpacing: "0.12em", marginTop: 2 }}>
          {t % 4 === 0 ? "scanning packets…" : t % 4 === 1 ? "ECHELON tap inactive" : t % 4 === 2 ? "ROUNDER patrol distant" : "encryption holding"}
        </div>
      </div>
    </div>
  );
}
window.SernIndicator = SernIndicator;


// ─── Right Rail ─────────────────────────────────────────────────────────────
function RightRail({ divergence, onSendDMail, onPickCharacter, dmailLog }) {
  return (
    <aside style={{
      width: 260, flexShrink: 0,
      background: "rgba(3,7,18,0.78)",
      borderLeft: "1px solid rgba(200,195,185,0.09)",
      display: "flex", flexDirection: "column",
      overflowY: "auto",
      zIndex: 10,
    }}>
      <Section label="WORLD LINE / DIVERGENCE">
        <WorldlineGraph divergence={divergence}/>
      </Section>

      <Section label="PHONEWAVE (NAME SUBJECT TO CHANGE)">
        <PhoneWave onSendDMail={onSendDMail}/>
      </Section>

      {dmailLog && dmailLog.length > 0 && (
        <Section label="D-MAIL LOG">
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {dmailLog.slice(-3).reverse().map((d, i) => (
              <div key={i} style={{ padding: "5px 8px", background: "rgba(200,146,10,0.05)", border: "1px solid rgba(200,195,185,0.09)" }}>
                <div style={{ fontFamily: "Share Tech Mono,monospace", fontSize: 7, color: "rgba(200,195,185,0.32)", letterSpacing: "0.18em" }}>→ {d.target}</div>
                <div style={{ fontFamily: "Share Tech Mono,monospace", fontSize: 9, color: "rgba(215,215,215,0.80)", letterSpacing: "0.04em", marginTop: 2 }}>{d.msg}</div>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section label="LAB ROSTER">
        <LabRoster onPick={onPickCharacter}/>
      </Section>

      <Section label="THREAT MONITOR" tight>
        <SernIndicator/>
      </Section>

      <div style={{ padding: "12px 14px", borderTop: "1px solid rgba(200,195,185,0.07)", marginTop: "auto" }}>
        <div style={{ fontFamily: "Share Tech Mono,monospace", fontSize: 7, color: "rgba(200,195,185,0.22)", letterSpacing: "0.25em", textAlign: "center", lineHeight: 1.7 }}>
          PRESS ⌘K FOR<br/>COMMAND PALETTE
        </div>
      </div>
    </aside>
  );
}

function Section({ label, children, tight }) {
  return (
    <div style={{ padding: tight ? "10px 14px" : "14px 14px", borderBottom: "1px solid rgba(200,146,10,0.08)" }}>
      {label && <div style={{ fontFamily: "Share Tech Mono,monospace", fontSize: 7, color: "rgba(200,195,185,0.25)", letterSpacing: "0.28em", marginBottom: 8 }}>{label}</div>}
      {children}
    </div>
  );
}
window.RightRail = RightRail;


// ─── Dossier Panel ──────────────────────────────────────────────────────────
function DossierPanel({ email, onClose }) {
  const c = CHARS[email];
  if (!c) return null;
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 200,
      background: "rgba(2,5,15,0.78)",
      backdropFilter: "blur(6px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      animation: "bodyFadeIn 0.25s ease",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 540, display: "flex",
        background: "rgba(4,10,24,0.95)",
        border: `1px solid ${c.color}77`,
        boxShadow: `0 0 60px ${c.color}33, 0 0 0 1px rgba(200,195,185,0.13)`,
        animation: "headerSlideIn 0.3s ease",
      }}>
        {/* portrait side */}
        <div style={{ width: 220, position: "relative", overflow: "hidden", background: "#02060e", flexShrink: 0 }}>
          <img src={c.img} alt={c.name} style={{
            position: "absolute", inset: 0, width: "100%", height: "100%",
            objectFit: "cover", objectPosition: "center 15%",
            filter: "saturate(0.85) contrast(1.05)",
          }}/>
          <div style={{
            position: "absolute", inset: 0,
            background: `linear-gradient(180deg, transparent 40%, rgba(2,6,18,0.92) 100%), linear-gradient(90deg, ${c.color}33 0%, transparent 30%, transparent 70%, rgba(2,6,18,0.6) 100%)`,
          }}/>
          {/* halftone */}
          <div style={{
            position: "absolute", inset: 0,
            backgroundImage: "radial-gradient(rgba(2,6,18,0.4) 1px, transparent 1.4px)",
            backgroundSize: "3px 3px", mixBlendMode: "multiply", opacity: 0.5,
          }}/>
          <div style={{ position: "absolute", left: 14, bottom: 10, right: 14 }}>
            <div style={{ fontFamily: "Share Tech Mono,monospace", fontSize: 7, color: c.color, letterSpacing: "0.28em" }}>{c.lab}</div>
            <div style={{ fontFamily: '"IM Fell English",serif', fontSize: 18, color: "rgba(230,225,215,0.9)", lineHeight: 1.1 }}>{c.name}</div>
          </div>
          {/* corner brackets */}
          {["00","01","10","11"].map(b => (
            <div key={b} style={{
              position: "absolute",
              ...(b[0]==="0" ? {top: 8} : {bottom: 8}),
              ...(b[1]==="0" ? {left: 8} : {right: 8}),
              width: 12, height: 12,
              borderTop: b[0]==="0" ? `1px solid ${c.color}` : "none",
              borderBottom: b[0]==="1" ? `1px solid ${c.color}` : "none",
              borderLeft: b[1]==="0" ? `1px solid ${c.color}` : "none",
              borderRight: b[1]==="1" ? `1px solid ${c.color}` : "none",
            }}/>
          ))}
        </div>
        {/* dossier text */}
        <div style={{ flex: 1, padding: "20px 22px", position: "relative" }}>
          <div style={{ position: "absolute", top: 8, right: 12, fontFamily: "Share Tech Mono,monospace", fontSize: 8, color: "rgba(200,195,185,0.25)", letterSpacing: "0.2em" }}>// CLASSIFIED</div>
          <div style={{ fontFamily: "Share Tech Mono,monospace", fontSize: 8, color: c.color, letterSpacing: "0.25em", marginBottom: 4 }}>DOSSIER • α</div>
          <div style={{ fontFamily: '"IM Fell English",serif', fontSize: 22, color: "rgba(230,225,215,0.9)", lineHeight: 1.1, marginBottom: 4 }}>{c.alias}</div>
          <div style={{ fontFamily: "Share Tech Mono,monospace", fontSize: 9, color: "rgba(210,210,210,0.40)", letterSpacing: "0.12em", marginBottom: 14 }}>{c.role}</div>

          <Field k="EMAIL" v={email} mono/>
          <Field k="ROLE" v={c.role}/>
          <Field k="STATUS" v={c.status} color={c.status === "online" ? "#7acaa8" : c.status === "transmitting" ? "rgba(200,195,185,0.8)" : "#a04040"}/>
          <Field k="SIGN-OFF" v={c.quote} italic/>

          <button onClick={onClose} style={{
            marginTop: 16, padding: "6px 18px",
            background: "transparent", border: `1px solid ${c.color}55`,
            color: c.color, fontFamily: "Share Tech Mono,monospace",
            fontSize: 9, letterSpacing: "0.22em", cursor: "pointer",
          }}>× CLOSE</button>
        </div>
      </div>
    </div>
  );
}

function Field({ k, v, mono, italic, color }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontFamily: "Share Tech Mono,monospace", fontSize: 7, color: "rgba(200,195,185,0.25)", letterSpacing: "0.28em" }}>{k}</div>
      <div style={{
        fontFamily: mono ? "Share Tech Mono,monospace" : '"IM Fell English",serif',
        fontStyle: italic ? "italic" : "normal",
        fontSize: mono ? 10 : 12,
        color: color || "rgba(215,215,215,0.80)",
        letterSpacing: mono ? "0.04em" : "0",
        marginTop: 2,
      }}>{v}</div>
    </div>
  );
}
window.DossierPanel = DossierPanel;


// ─── Command Palette (⌘K) ───────────────────────────────────────────────────
function CommandPalette({ open, onClose, commands }) {
  const [q, setQ] = useS("");
  const [sel, setSel] = useS(0);
  const inputRef = useR(null);

  useE(() => {
    if (open) {
      setQ(""); setSel(0);
      setTimeout(() => inputRef.current && inputRef.current.focus(), 50);
    }
  }, [open]);

  const filtered = commands.filter(c => c.label.toLowerCase().includes(q.toLowerCase()) || (c.hint||"").toLowerCase().includes(q.toLowerCase()));

  const onKey = e => {
    if (e.key === "Escape") onClose();
    else if (e.key === "ArrowDown") { setSel(s => Math.min(s + 1, filtered.length - 1)); e.preventDefault(); }
    else if (e.key === "ArrowUp") { setSel(s => Math.max(s - 1, 0)); e.preventDefault(); }
    else if (e.key === "Enter") {
      const cmd = filtered[sel];
      if (cmd) { cmd.run(); onClose(); }
    }
  };

  if (!open) return null;
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 300,
      background: "rgba(2,5,15,0.65)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "flex-start", justifyContent: "center",
      paddingTop: "12vh",
      animation: "bodyFadeIn 0.18s ease",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 520, background: "rgba(4,10,24,0.96)",
        border: "1px solid rgba(200,195,185,0.32)",
        boxShadow: "0 0 60px rgba(200,195,185,0.11), 0 20px 60px rgba(0,0,0,0.6)",
      }}>
        <div style={{ padding: "8px 14px", borderBottom: "1px solid rgba(200,195,185,0.13)", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontFamily: "Share Tech Mono,monospace", fontSize: 11, color: "rgba(200,195,185,0.8)" }}>▶</span>
          <input ref={inputRef} value={q} onChange={e => { setQ(e.target.value); setSel(0); }} onKeyDown={onKey}
            placeholder="run a command…  (try: el psy)"
            style={{
              flex: 1, background: "transparent", border: "none", outline: "none",
              fontFamily: "Share Tech Mono,monospace", fontSize: 13, color: "rgba(230,225,215,0.9)",
              letterSpacing: "0.06em",
            }}/>
          <span style={{ fontFamily: "Share Tech Mono,monospace", fontSize: 8, color: "rgba(200,195,185,0.25)", letterSpacing: "0.2em" }}>ESC</span>
        </div>
        <div style={{ maxHeight: 320, overflowY: "auto" }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 22, textAlign: "center", fontFamily: "Share Tech Mono,monospace", fontSize: 10, color: "rgba(200,180,130,0.3)", letterSpacing: "0.15em" }}>
              NO MATCHING COMMANDS
            </div>
          ) : filtered.map((c, i) => (
            <div key={c.id} onMouseEnter={() => setSel(i)} onClick={() => { c.run(); onClose(); }}
              style={{
                padding: "9px 14px", cursor: "pointer",
                background: sel === i ? "rgba(200,195,185,0.08)" : "transparent",
                borderLeft: `2px solid ${sel === i ? "rgba(200,195,185,0.8)" : "transparent"}`,
                display: "flex", alignItems: "center", gap: 10,
              }}>
              <span style={{ fontFamily: "Share Tech Mono,monospace", fontSize: 11, color: sel === i ? "rgba(200,195,185,0.8)" : "rgba(200,195,185,0.28)", width: 16 }}>{c.icon || "›"}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "Share Tech Mono,monospace", fontSize: 10, color: sel === i ? "rgba(230,225,215,0.9)" : "rgba(220,200,160,0.7)", letterSpacing: "0.08em" }}>{c.label}</div>
                {c.hint && <div style={{ fontFamily: "Share Tech Mono,monospace", fontSize: 8, color: "rgba(200,195,185,0.25)", letterSpacing: "0.1em", marginTop: 2 }}>{c.hint}</div>}
              </div>
              {c.shortcut && <span style={{ fontFamily: "Share Tech Mono,monospace", fontSize: 8, color: "rgba(200,195,185,0.32)", letterSpacing: "0.15em", padding: "2px 6px", background: "rgba(200,146,10,0.08)", border: "1px solid rgba(200,195,185,0.13)" }}>{c.shortcut}</span>}
            </div>
          ))}
        </div>
        <div style={{ padding: "7px 14px", borderTop: "1px solid rgba(200,195,185,0.09)", display: "flex", justifyContent: "space-between", fontFamily: "Share Tech Mono,monospace", fontSize: 8, color: "rgba(200,195,185,0.28)", letterSpacing: "0.18em" }}>
          <span>↑↓ navigate · ↵ run</span>
          <span>EL PSY KONGROO</span>
        </div>
      </div>
    </div>
  );
}
window.CommandPalette = CommandPalette;


// ─── World Line Shift Effect (overlay) ──────────────────────────────────────
function ShiftFlash({ active, onDone }) {
  useE(() => {
    if (!active) return;
    const t = setTimeout(onDone, 1700);
    return () => clearTimeout(t);
  }, [active, onDone]);
  if (!active) return null;
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 500, pointerEvents: "none",
    }}>
      {/* Soft dim — darkens without going fully black */}
      <div style={{
        position: "absolute", inset: 0,
        background: "rgba(2,6,18,0.72)",
        animation: "bgDim 1.7s ease forwards",
      }}/>
      {/* Amber center glow on top of dim */}
      <div style={{
        position: "absolute", inset: 0,
        background: "radial-gradient(ellipse at center, rgba(200,146,10,0.18) 0%, transparent 65%)",
        animation: "shiftPulse 1.7s 0.1s ease forwards",
        opacity: 0,
      }}/>
      <div style={{
        position: "absolute", inset: 0,
        background: "repeating-linear-gradient(0deg, transparent 0 8px, rgba(200,195,185,0.09) 8px 9px)",
        animation: "shiftScan 1.7s linear forwards",
      }}/>
      <div style={{
        position: "absolute", top: "44%", left: 0, right: 0, textAlign: "center",
        fontFamily: '"IM Fell English",serif', fontSize: 68, fontWeight: 700,
        color: "#f0e8d0",
        textShadow: "0 0 50px rgba(240,216,144,0.9), 0 0 18px #c8920a, 1px 1px 0 rgba(0,0,0,0.8), -1px -1px 0 rgba(0,0,0,0.6)",
        letterSpacing: "0.04em",
        animation: "shiftText 1.7s cubic-bezier(0.2, 0.8, 0.2, 1) forwards",
      }}>WORLD LINE SHIFT</div>
      <div style={{
        position: "absolute", top: "57%", left: 0, right: 0, textAlign: "center",
        fontFamily: "Share Tech Mono,monospace", fontSize: 15, fontWeight: 700,
        color: "#e8dcc8",
        letterSpacing: "0.6em",
        textShadow: "0 0 14px rgba(240,216,144,0.6), 1px 1px 0 rgba(0,0,0,0.9)",
        animation: "shiftText 1.7s 0.2s cubic-bezier(0.2, 0.8, 0.2, 1) forwards",
        opacity: 0,
      }}>EL PSY KONGROO</div>
    </div>
  );
}
window.ShiftFlash = ShiftFlash;


// ─── Ambient Particles (drifting glyphs) ────────────────────────────────────
function AmbientParticles() {
  const particles = useM(() => Array.from({ length: 28 }).map((_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 20,
    duration: 16 + Math.random() * 24,
    size: 7 + Math.random() * 6,
    glyph: ["α","β","Ω","φ","Ψ","◇","◈","△","∇","λ","∞","§","µ","θ","∆","χ"][Math.floor(Math.random() * 16)],
    opacity: 0.2 + Math.random() * 0.4,
  })), []);
  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 2, overflow: "hidden" }}>
      {particles.map(p => (
        <div key={p.id} style={{
          position: "absolute", left: `${p.left}%`, bottom: -20,
          fontFamily: "Share Tech Mono,monospace",
          fontSize: p.size,
          color: `rgba(200,146,10,${p.opacity})`,
          animation: `floatParticle ${p.duration}s ${p.delay}s linear infinite`,
          textShadow: "0 0 6px rgba(200,195,185,0.18)",
        }}>{p.glyph}</div>
      ))}
    </div>
  );
}
window.AmbientParticles = AmbientParticles;
