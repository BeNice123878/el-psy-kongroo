// ============================================================
// STEINS;GATE — Visual Novel / Story Mode
// ============================================================
//   • Faithful chapter-based storyline (5 chapters, branching scenes)
//   • Progress unlocked by chatting with AI characters via mail
//   • Visual novel renderer (typewriter dialogue, character portraits,
//     branching choices, scene transitions, name plates)
//   • Save state in localStorage
//   • CG Gallery, World Line Map, Game Stats
// ============================================================

const { useState: vnUS, useEffect: vnUE, useRef: vnUR, useMemo: vnUM, useCallback: vnUC } = React;

// ─── CHARACTERS in story ────────────────────────────────────────────────────
// Use existing PNGs + an Okabe placeholder
const STORY_CAST = {
  okabe:  { name: "HOUOUIN KYOUMA", real: "Rintarou Okabe", color: "#c8920a", img: null },
  kurisu: { name: "MAKISE KURISU",  real: "Christina",     color: "#e08868", img: "img/kurisu.png" },
  mayuri: { name: "SHIINA MAYURI",  real: "Mayushii",      color: "#9ad8d2", img: "img/mayuri.png" },
  daru:   { name: "DARU",           real: "Itaru Hashida", color: "#7a96da", img: "img/daru.png" },
  faris:  { name: "FARIS NYANNYAN", real: "Akiha Rumiho",  color: "#dc7aaa", img: "img/faris.png" },
  moeka:  { name: "KIRYUU MOEKA",   real: "Shining Finger",color: "#b486dc", img: "img/moeka.png" },
  suzuha: { name: "SUZUHA AMANE",   real: "John Titor",    color: "#d8c46a", img: "img/suzuha.png" },
  narrator: { name: "READING STEINER", real: "", color: "#a0c0e0", img: null },
};


// ─── CHAPTERS ───────────────────────────────────────────────────────────────
// Each chapter: title, unlock-gate, scenes (linear w/ optional choices), reward
const CHAPTERS = [
{
  id: "ch1",
  num: 1,
  title: "Akihabara Convergence",
  subtitle: "Radio Kaikan · July 28, 2010 · 13:00",
  setting: "α attractor field — Operation Skuld begins",
  bg: "https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEgmYk-34j3fO1vaqJdRJN89IEiP5ydiuHk9OaVT7DKnoKYd1tdc4g_i7iA81bmbEpy9zpxPH9FIzg1ZmMx533Prz-bcAtFEbaj8ypdYHNjkpTJt38a-S_FnkvDt8Pml6dQP3NGbgessvW536wwgInD_USOQx7uXK0m5zCjxe1uhpOvNRjmdz5JsILzE0Kqj/s1920-rw/steins-gate-wallpapers-1.jpg",
  unlock: { type: "free" },
  summary: "Mayuri drags Okabe to a time-travel press conference at Radio Kaikan. There, he finds the body of a girl who shouldn't exist — Makise Kurisu, the woman whose paper he had attended to mock.",
  scenes: [
    { who: "narrator", text: "July 28th, 2010. The summer of the year a chosen nation finally believed in time travel. The streets of Akihabara hum with vending-machine ozone and the shouts of barkers." },
    { who: "mayuri", text: "Tutturu~! Okarin, hurry up! The lecture's about to start!", emote: "happy" },
    { who: "okabe", text: "Mayuri, a true mad scientist does not bend to schedules — schedules bend to HIM! MWAHAHAHA!" },
    { who: "okabe", text: "...also, what was the lecture about again?" },
    { who: "mayuri", text: "Tii-meeee tray-belling~ The young professor invented it!" },
    { who: "narrator", text: "The auditorium was already packed. The speaker — Tennouji Yuugo? No, Tennouji was the landlord. This man called himself..." },
    { who: "narrator", text: "Dr. Saionji. Time-machine theorist. His Z-Theory contradicted itself in the third slide. Okabe scoffed." },
    { who: "okabe", text: "Mayuri, this is FRAUD. The man is rebranding John Titor's IRC posts. We're leaving." },
    { choice: true, options: [
      { label: "Search the upper floors.", next: 0 },
      { label: "Yell at the speaker.",     next: 0, flavor: "okabe" },
    ]},
    { who: "narrator", text: "The eighth floor was empty except for a girl, alone, slumped against the wall. Red on red on red." },
    { who: "kurisu", text: "...Okabe...?", emote: "wounded" },
    { who: "okabe", text: "How... how do you know my name?" },
    { who: "kurisu", text: "It's already... happening again... I have to tell you. Don't... 1.048596...", emote: "wounded" },
    { who: "narrator", text: "She collapsed. Okabe's phone — buzzing. He sent a panicked text to Daru: 'Mayuri. Murder. Help.'" },
    { who: "narrator", text: "And the world tore in half." },
    { who: "narrator", text: "Vertigo. Static. The corridor empty. Kurisu's body — gone. The phone signal — sent yet undelivered. The auditorium below — empty, silent, locked." },
    { who: "narrator", text: "READING STEINER. The mad scientist's curse. To remember a world line that no longer exists." },
  ],
  reward: {
    type: "email",
    email: {
      id: "story_msg_1",
      from: "system@future-gadget-lab.jp",
      fromName: "FG. LAB · SYSTEM",
      subject: "[CHAPTER 1] Reading Steiner online",
      preview: "Anomaly logged. World line shift detected without phonewave activation.",
      body: "// LAB SYSTEM // \n\nAnomaly logged. World line shift detected without phonewave activation.\n\nSubject: HOUOUIN KYOUMA\nObserved capability: retain memory across attractor shifts (\"Reading Steiner\")\nRecommended action: do nothing. Do not tell Daru. Do not tell Mayuri.\n\nThe lab is now your shelter. The mailbox is now your weapon.\n\n— FG.LAB",
      date: new Date(Date.now() - 86400000 * 12).toISOString(),
      read: false, starred: true, folder: "inbox",
      labels: ["STORY", "Ch.1"],
    },
  },
  achievement: { id: "ach_steiner", name: "Reading Steiner Activated", desc: "Remembered something the world forgot." },
},
{
  id: "ch2",
  num: 2,
  title: "Future Gadget #8",
  subtitle: "The lab · Several days later",
  setting: "The microwave heats more than just bananas",
  bg: "https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEjU0vc2zBGbDJBCh08cuch_ORugm_zdKtYJZ0fFZS5Sdz5fCOTiFF7V1kimMQyutiM6J451FO1uqHCUBAJkd_ZAJKFafXpPNJKbXD_E6EP-JllNDhRe0bJuDcbSh8GxI-2-FUYI3eKz0dkwZH4-LjiQjs2NX5K6i6YCmzsSWUvJHzbhGuONw0KR2P8fUUXv/s1920-rw/steins-gate-wallpapers-3.jpg",
  unlock: { type: "email_to", who: "barrel-titor@2ch.net", count: 1, label: "Send 1 email to Daru" },
  summary: "Daru reverse-engineers an old microwave. Mayuri's banana goes in green and comes out... gel. Through the bars of physics, a message slips back six minutes.",
  scenes: [
    { who: "daru", text: "okarin. okarin. OKARIN. you HAVE to see this. the microwave is doing the thing." },
    { who: "okabe", text: "Daru, I have just returned from a glimpse beyond the veil. Speak slowly, peasant." },
    { who: "daru", text: "ok so. mayuri put a banana in. came out. gel. like, fully translucent, dripping gel. that's not how microwaves work man." },
    { who: "mayuri", text: "Mayushii will name it! Banana-no-Mi! Banana-no-Mi degeshou~", emote: "happy" },
    { who: "okabe", text: "Show me. SHOW me. This is no longer a microwave — this is FUTURE GADGET NUMBER EIGHT." },
    { who: "daru", text: "i was gonna call it the gel-anator but ok" },
    { who: "narrator", text: "It happened that night. Daru typed a message into the prototype — 'lottery numbers test 1' — addressed to himself, three days ago." },
    { who: "narrator", text: "The microwave hummed. The lights browned. The phone chirped." },
    { who: "okabe", text: "Daru. You won the lottery. You won the lottery THREE DAYS AGO. But you didn't, because you DIDN'T BUY THE TICKET, because you NEVER NEEDED TO." },
    { who: "daru", text: "...okarin. did. did we just text the past." },
    { who: "okabe", text: "We have built it, Daru. The world's first... DELORIANTABLE NETWORKING MICROWAVE. THE D-MAIL." },
    { who: "narrator", text: "Reading Steiner whispered. 'You have remembered the version where Daru did not cash the ticket. The other version is now the real one.'" },
    { who: "narrator", text: "Outside, an unmarked black van with the SERN logo on the bumper rolled past, a little too slowly." },
  ],
  reward: {
    type: "gadget",
    label: "PHONEWAVE UNLOCKED — open the right rail",
    email: {
      id: "story_msg_2",
      from: "system@future-gadget-lab.jp",
      fromName: "FG. LAB · SYSTEM",
      subject: "[CHAPTER 2] Phonewave (name subject to change) online",
      preview: "Future Gadget #8 calibrated. 36-character payload. Bananas not included.",
      body: "// LAB SYSTEM //\n\nFuture Gadget #8 — codename PHONEWAVE — calibrated and online.\n\nMax payload: 36 characters via SERN's Large Hadron Collider.\nWarning: each transmission shifts the attractor field. Use sparingly.\n\nThe right-rail D-Mail panel is now armed.\n\n— FG.LAB",
      date: new Date(Date.now() - 86400000 * 9).toISOString(),
      read: false, starred: false, folder: "inbox",
      labels: ["STORY", "Ch.2"],
    },
  },
  achievement: { id: "ach_phonewave", name: "Phonewave online", desc: "Future Gadget #8 calibrated." },
},
{
  id: "ch3",
  num: 3,
  title: "The IBN 5100",
  subtitle: "Yanabayashi Shrine · Akiba",
  setting: "A 1975 IBM clone. The only key to SERN's encrypted core.",
  bg: "https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEg7OpRUPIRkulhDybyZIC-qeLEn7hbrXOk5uWv6T1K3_yuJ0MzyGT4rBtu7RQ9R9cduH5Vnjb4ZQEmJ9m2bWC1bTkong7N4-gaCpahDqOwtnZGFJx1cDTPgLzO410D63ciE4VEjRJt7IRbRvn-RnkpuOqxCm638fsWyBLG-NRAx4PBryy_WFenkuebvRk3F/s1920-rw/steins-gate-wallpapers-5.jpg",
  unlock: { type: "dmail", count: 1, label: "Send 1 D-Mail via Phonewave" },
  summary: "Suzuha vanishes. Faris hosts a Rai-Net tournament. The prize: a vintage IBN 5100 — the impossible key to the SERN database.",
  scenes: [
    { who: "narrator", text: "The Rai-Net Akiba Cup. The grand prize: a vintage IBN 5100, courtesy of one Akiha Rumiho — a.k.a. Faris NyanNyan, daughter of half of Akihabara's land deeds." },
    { who: "faris", text: "Welcome, Master-kun~ Faris will let you have the prize, nyaa~ but you must defeat Faris first.", emote: "playful" },
    { who: "okabe", text: "I am the mad scientist HOUOUIN KYOUMA. Card games are beneath me. ...How do you play this." },
    { who: "daru", text: "okarin you have not even SHUFFLED you have the dad card on top, the mech card middle, the moe card on the bottom, classic n00b" },
    { who: "narrator", text: "He won. Of course he won. Reading Steiner had let him remember three earlier failed runs." },
    { who: "faris", text: "Master-kun is a meanie nyaa~ ... but a deal is a deal. Faris will bring the IBN 5100 to the lab. Take care of it.", emote: "soft" },
    { who: "narrator", text: "That night, the lab was quiet. The IBN 5100, that beige slab, hummed in the corner like an idol." },
    { who: "okabe", text: "With this, we breach SERN. With this, we read what they have done. With this..." },
    { who: "daru", text: "okarin. uh. i decrypted the first archive." },
    { who: "daru", text: "i don't think you should read it." },
    { choice: true, options: [
      { label: "Read it anyway.",       next: 0 },
      { label: "Tell Daru to delete it.", next: 0, flavor: "okabe" },
    ]},
    { who: "okabe", text: "...ECHELON intercept logs. ROUNDER detainments. Subject experiments... 'time-travel survivors'... mortality 73%..." },
    { who: "okabe", text: "Daru. Mayuri must not know. Mayuri must NEVER know about this room." },
    { who: "narrator", text: "Outside, somewhere in the Tokyo grid, a flip-phone rang in a darkened apartment. A voice answered with two letters: 'F.B.'" },
  ],
  reward: {
    type: "email",
    email: {
      id: "story_msg_3",
      from: "suzuha.amane@ibm5100.net",
      fromName: "Suzuha Amane",
      subject: "You found it. Now you must hide it.",
      preview: "The IBN 5100 must never enter SERN's hands. Especially not Moeka's.",
      body: "Okabe.\n\nYou found the IBN 5100. I am proud of you.\nNow you must hide it. SERN's Rounders are already moving. Trust no one whose past you cannot verify.\n\nEspecially not Moeka.\n\n— S.A.",
      date: new Date(Date.now() - 86400000 * 6).toISOString(),
      read: false, starred: true, folder: "inbox",
      labels: ["STORY", "Ch.3", "URGENT"],
    },
  },
  achievement: { id: "ach_ibn", name: "IBN 5100 secured", desc: "Pulled the key from the shrine." },
},
{
  id: "ch4",
  num: 4,
  title: "The Rounder",
  subtitle: "August 13 · 20:14",
  setting: "Mayuri must not die. Mayuri must not die. Mayuri must not die.",
  bg: "https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEjECwdwkLBwboJzfb6IiIijqCp4BQvy1e6rDm9bY7EhyB_8DPX2eqIo1q-RAlJ_CLLQ-3CQOC4fLmQOIZ-Jpv66JN94tq5KB1e4b4WDufxsw3cK-OAy2ekfxy-3H5QiwljrWxIm1rEQfB8RsnnfeSilzztjDorAOPul2vJKcZIgRD96zsWjA7R83DOcu_lx/s1920-rw/steins-gate-wallpapers-32.jpg",
  unlock: { type: "email_to", who: "nyan@future-gadget-lab.jp", count: 1, label: "Send 1 email to Faris" },
  summary: "Moeka's loyalty is to a name and a phone, not a person. A pistol. The lab. A girl in a white sundress.",
  scenes: [
    { who: "narrator", text: "Moeka Kiryuu had been at the lab three weeks. She typed only via her phone. She spoke only when looked at. Nobody saw her bring the IBN 5100 lookup tool." },
    { who: "moeka", text: "FB.", emote: "blank" },
    { who: "narrator", text: "She had texted: 'IBN 5100 confirmed at FG.LAB. Awaiting orders.' FB had replied with the address of a back-alley arms dealer in Kabukichou." },
    { who: "okabe", text: "Mayuri. Stay behind me. Mayuri, do you hear me. STAY behind me." },
    { who: "mayuri", text: "Okarin... why is Moe-chan crying...?", emote: "soft" },
    { who: "moeka", text: "I'm sorry. FB said the IBN 5100 must not stay with you.", emote: "blank" },
    { who: "narrator", text: "The pistol. The crack. The crumple of yellow fabric." },
    { who: "okabe", text: "MAYURI! MAYURI! NO. NO. NO NO NO NO —" },
    { who: "narrator", text: "Reading Steiner shrieked. The world line ripped. Time-leap activated. Five hours to August 13. Five hours to August 13." },
    { who: "narrator", text: "And again." },
    { who: "narrator", text: "And again." },
    { who: "narrator", text: "Every world line ended in a yellow shape on the ground." },
    { who: "narrator", text: "Mayuri's death is an attractor. It pulls all probabilities toward it. It is the convergence." },
    { who: "narrator", text: "...He had to leave the α attractor field entirely. He had to undo every D-Mail he had ever sent. He had to wound himself before he had wounded anyone else." },
  ],
  reward: {
    type: "email",
    email: {
      id: "story_msg_4",
      from: "kurisu.makise@viktor-kondria.org",
      fromName: "Makise Kurisu",
      subject: "I know what you've been doing.",
      preview: "Tell me everything. From the beginning. I will help you escape this loop.",
      body: "Okabe.\n\nTell me everything. From the beginning. I'll help you escape this loop.\n\nDo not lie. Do not protect me from the data.\n\n— Kurisu",
      date: new Date(Date.now() - 86400000 * 3).toISOString(),
      read: false, starred: true, folder: "inbox",
      labels: ["STORY", "Ch.4"],
    },
  },
  achievement: { id: "ach_loop", name: "Trapped in α", desc: "Witnessed Mayuri's convergence." },
},
{
  id: "ch5",
  num: 5,
  title: "Steins Gate",
  subtitle: "August 21 · 20:14 · Final attempt",
  setting: "The choice that breaks both attractor fields. The faked death. The promise.",
  bg: "https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEgWKtaMzG4Duju7IrJpw87_YjisaRibRhnKaAY4TcvWktXMItlzBriEi8xxgDMUQOqIFE8GVNjVAExObJwxX2EDLormwB7AP1vzYgQmSL2cN-5BQYNgWbPkBeD_zCJMyJRD6t-vuMP_vzz-qXgk_wEyzXCX0YnF4K3U2S0z7uXms67BF7jCd9wBKR0TQGMb/s1920-rw/steins-gate-wallpapers-9.jpg",
  unlock: { type: "ai_replies", count: 4, label: "Receive 4 AI replies from any character" },
  summary: "A video from a future Okabe. A staged knife. A goodbye that has to look real. The Steins Gate world line — α and β both betrayed.",
  scenes: [
    { who: "narrator", text: "The video had Okabe's voice but not his face. 'You will fake her death. You will be hated. You will save them both. This is the only way.'" },
    { who: "kurisu", text: "...You knew. From the beginning of this loop, you knew you'd have to do it.", emote: "soft" },
    { who: "okabe", text: "Christina. I — I will not. I cannot. I will find another way. I am Hououin Kyouma. I am the mad sci—" },
    { who: "kurisu", text: "Stop. Just — stop. Don't take the title back. Not now. Not while you're crying.", emote: "soft" },
    { who: "kurisu", text: "I want to live, Okabe. I want it desperately. But if my survival means Mayuri dies in every line forever — I will not pay that. Will not. End of equation." },
    { who: "okabe", text: "...Christina." },
    { who: "kurisu", text: "Just promise me one thing. When you walk out of that storage room with stage blood on your shirt — remember me. Even when nobody else does. Especially then.", emote: "soft" },
    { choice: true, options: [
      { label: "I promise. Always.",        next: 0 },
      { label: "El psy kongroo.",            next: 0, flavor: "okabe" },
      { label: "I will find you. Anywhere.", next: 0 },
    ]},
    { who: "okabe", text: "I will remember. Even in the world line where you remember nothing of me." },
    { who: "narrator", text: "August 21, 20:14. Stage blood. A staged scream. A girl in a white sundress, alive, hidden, breathing, watching the boy she loved walk away from her grave." },
    { who: "narrator", text: "DIVERGENCE READING — 1.048596%" },
    { who: "narrator", text: "Welcome to the Steins Gate world line." },
    { who: "narrator", text: "El psy kongroo." },
  ],
  reward: {
    type: "credits",
    email: {
      id: "story_msg_5",
      from: "system@future-gadget-lab.jp",
      fromName: "FG. LAB · SYSTEM",
      subject: "[FINAL] Steins Gate reached — 1.048596%",
      preview: "Operation Skuld complete. Both convergences denied. Welcome home.",
      body: "// LAB SYSTEM //\n\nDIVERGENCE: 1.048596%\nATTRACTOR: STEINS GATE\nMAYURI: alive.\nKURISU: alive (presumed dead, world-line β concealed).\nOPERATION SKULD: complete.\n\nThe choice has been made. Memory is yours alone now. Carry it.\n\nEl psy kongroo.\n\n— FG.LAB",
      date: new Date().toISOString(),
      read: false, starred: true, folder: "inbox",
      labels: ["STORY", "STEINS GATE", "FINAL"],
    },
  },
  achievement: { id: "ach_steinsgate", name: "STEINS GATE", desc: "Reached 1.048596%. The chosen world line." },
},
];

window.STORY_CHAPTERS = CHAPTERS;
window.STORY_CAST = STORY_CAST;


// ─── Progress evaluator ─────────────────────────────────────────────────────
function evaluateUnlock(unlock, stats) {
  if (!unlock || unlock.type === "free") return { ok: true, progress: 1, of: 1 };
  if (unlock.type === "email_to") {
    const have = stats.emailsSentTo[unlock.who] || 0;
    return { ok: have >= unlock.count, progress: Math.min(have, unlock.count), of: unlock.count };
  }
  if (unlock.type === "dmail") {
    return { ok: stats.dmailsSent >= unlock.count, progress: Math.min(stats.dmailsSent, unlock.count), of: unlock.count };
  }
  if (unlock.type === "ai_replies") {
    return { ok: stats.aiRepliesReceived >= unlock.count, progress: Math.min(stats.aiRepliesReceived, unlock.count), of: unlock.count };
  }
  return { ok: false, progress: 0, of: 1 };
}
window.STORY_evaluateUnlock = evaluateUnlock;


// ─── Visual Novel Scene ─────────────────────────────────────────────────────
function VNScene({ chapter, onClose, onComplete }) {
  const [idx, setIdx] = vnUS(0);
  const [typed, setTyped] = vnUS("");
  const [typing, setTyping] = vnUS(true);
  const [auto, setAuto] = vnUS(false);
  const [skip, setSkip] = vnUS(false);
  const [flashKey, setFlashKey] = vnUS(0);

  const scene = chapter.scenes[idx];
  const isChoice = scene && scene.choice;
  const speaker = scene && scene.who ? STORY_CAST[scene.who] : null;

  // typewriter
  vnUE(() => {
    if (!scene || isChoice) { setTyping(false); setTyped(""); return; }
    setTyping(true); setTyped("");
    const text = scene.text;
    let i = 0;
    const speed = skip ? 4 : 22;
    const id = setInterval(() => {
      i += skip ? 4 : 1;
      setTyped(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(id);
        setTyping(false);
        setTyped(text);
      }
    }, speed);
    return () => clearInterval(id);
  }, [idx, skip]);

  // auto-advance
  vnUE(() => {
    if (!auto || typing || isChoice) return;
    const t = setTimeout(() => advance(), 1600);
    return () => clearTimeout(t);
  }, [auto, typing, isChoice, idx]);

  // background change flash
  vnUE(() => { setFlashKey(k => k + 1); }, [scene && scene.bg]);

  const advance = () => {
    if (typing) { setTyped(scene.text); setTyping(false); return; }
    if (idx >= chapter.scenes.length - 1) {
      onComplete && onComplete(chapter);
      return;
    }
    setIdx(i => i + 1);
  };

  const pickChoice = () => advance();

  if (!scene) return null;

  const bg = scene.bg || chapter.bg;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 800,
      background: "#02060e",
      display: "flex", flexDirection: "column",
      animation: "bodyFadeIn 0.18s ease both",
    }}>
      {/* Background image */}
      <div key={`bg-${flashKey}`} style={{
        position: "absolute", inset: 0,
        backgroundImage: `url(${bg})`, backgroundSize: "cover", backgroundPosition: "center",
        filter: "saturate(0.75) brightness(0.82) contrast(1.05)",
        animation: "vnBgIn 0.25s ease",
      }}/>
      {/* atmospheric gradient */}
      <div style={{
        position: "absolute", inset: 0,
        background: "radial-gradient(ellipse 90% 70% at 50% 35%, rgba(2,6,18,0.0) 0%, rgba(2,6,18,0.25) 60%, rgba(2,6,18,0.65) 100%)",
      }}/>
      {/* color wash from speaker */}
      {speaker && speaker.color && (
        <div style={{
          position: "absolute", inset: 0,
          background: `linear-gradient(135deg, ${speaker.color}1a 0%, transparent 40%, transparent 70%, ${speaker.color}26 100%)`,
          mixBlendMode: "screen", opacity: 0.7,
          transition: "background 0.6s ease",
        }}/>
      )}

      {/* Top chapter bar */}
      <div style={{
        position: "relative", zIndex: 3,
        padding: "14px 28px",
        background: "linear-gradient(180deg, rgba(2,6,18,0.85), transparent)",
        display: "flex", alignItems: "center", gap: 18,
      }}>
        <div style={{
          padding: "3px 10px", border: "1px solid rgba(200,146,10,0.4)",
          fontFamily: "Share Tech Mono,monospace", fontSize: 9, color: "#f0d890",
          letterSpacing: "0.22em", background: "rgba(200,146,10,0.08)",
        }}>CH.{String(chapter.num).padStart(2, "0")}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: '"IM Fell English",serif', fontSize: 18, color: "#f0d890", lineHeight: 1.1 }}>{chapter.title}</div>
          <div style={{ fontFamily: "Share Tech Mono,monospace", fontSize: 9, color: "rgba(200,146,10,0.55)", letterSpacing: "0.15em", marginTop: 1 }}>{chapter.subtitle}</div>
        </div>
        <button onClick={() => setAuto(a => !a)} style={vnTopBtn(auto)}>{auto ? "■ AUTO" : "▶ AUTO"}</button>
        <button onMouseDown={() => setSkip(true)} onMouseUp={() => setSkip(false)} onMouseLeave={() => setSkip(false)} style={vnTopBtn(skip)}>≫ SKIP</button>
        <button onClick={onClose} style={vnTopBtn(false)}>× EXIT</button>
      </div>

      {/* Character portrait area */}
      <div style={{ flex: 1, position: "relative", zIndex: 2 }}>
        {speaker && speaker.img && (
          <div key={`portrait-${idx}`} style={{
            position: "absolute", left: "8%", bottom: 0, top: "8%",
            width: "min(40%, 520px)",
            backgroundImage: `url(${speaker.img})`,
            backgroundSize: "cover",
            backgroundPosition: scene.emote === "wounded" ? "center 35%" : "center 18%",
            filter: `saturate(${scene.emote === "wounded" ? 0.6 : 0.95}) contrast(1.05) drop-shadow(0 0 50px ${speaker.color}55)`,
            maskImage: "linear-gradient(180deg, black 60%, transparent 100%)",
            WebkitMaskImage: "linear-gradient(180deg, black 60%, transparent 100%)",
            animation: "vnPortraitIn 0.45s cubic-bezier(0.2,0.8,0.2,1) both",
            transformOrigin: "bottom center",
          }}/>
        )}
        {/* Decorative glyphs */}
        <div style={{
          position: "absolute", right: 40, top: 30,
          fontFamily: "Share Tech Mono,monospace", fontSize: 9,
          color: "rgba(200,146,10,0.35)", letterSpacing: "0.2em",
          textAlign: "right", lineHeight: 1.7,
        }}>
          <div>WORLD LINE · {chapter.setting.includes("β") ? "β" : "α"}</div>
          <div>SCENE {String(idx + 1).padStart(2, "0")} / {String(chapter.scenes.length).padStart(2, "0")}</div>
          <div style={{ marginTop: 4, color: "rgba(200,146,10,0.2)" }}>READING STEINER · ON</div>
        </div>
      </div>

      {/* Dialogue box */}
      <div style={{
        position: "relative", zIndex: 4,
        margin: "0 5%",
        marginBottom: 24,
        background: "linear-gradient(180deg, rgba(4,10,24,0.95) 0%, rgba(2,6,18,0.96) 100%)",
        border: "1px solid rgba(200,146,10,0.35)",
        borderTop: speaker ? `2px solid ${speaker.color}aa` : "1px solid rgba(200,146,10,0.4)",
        padding: "16px 22px 18px",
        boxShadow: "0 -8px 50px rgba(0,0,0,0.6), inset 0 0 50px rgba(200,146,10,0.04)",
        minHeight: 130,
      }}>
        {/* Name plate */}
        {speaker && (
          <div style={{
            position: "absolute", top: -16, left: 18,
            padding: "4px 12px",
            background: `linear-gradient(180deg, ${speaker.color} 0%, ${speaker.color}cc 100%)`,
            color: "#02060e",
            fontFamily: "Share Tech Mono,monospace", fontSize: 10, letterSpacing: "0.22em",
            fontWeight: "bold",
            boxShadow: `0 0 12px ${speaker.color}77`,
          }}>{speaker.name}</div>
        )}
        {!isChoice ? (
          <>
            <p style={{
              fontFamily: speaker && speaker.name === "READING STEINER" ? "Share Tech Mono,monospace" : '"IM Fell English",serif',
              fontStyle: speaker && speaker.name === "READING STEINER" ? "normal" : "normal",
              fontSize: 16, lineHeight: 1.7,
              color: speaker && speaker.name === "READING STEINER" ? "rgba(160,200,224,0.85)" : "#f3e8c8",
              letterSpacing: speaker && speaker.name === "READING STEINER" ? "0.1em" : "0.01em",
              minHeight: 80,
            }}>{typed}{typing && <span style={{ display: "inline-block", width: 6, height: 18, background: "#c8920a", marginLeft: 4, animation: "pulse 0.8s infinite" }}/>}</p>
            <div onClick={advance} style={{ position: "absolute", inset: 0, cursor: "pointer" }}/>
            <div style={{ position: "absolute", right: 18, bottom: 8, display: "flex", gap: 12, fontFamily: "Share Tech Mono,monospace", fontSize: 9, letterSpacing: "0.18em", color: "rgba(200,146,10,0.5)" }}>
              <span>CLICK / SPACE ▶</span>
              {!typing && <span style={{ color: "#c8920a", animation: "pulse 1s infinite" }}>▼</span>}
            </div>
          </>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontFamily: "Share Tech Mono,monospace", fontSize: 9, color: "rgba(200,146,10,0.55)", letterSpacing: "0.22em", marginBottom: 4 }}>// CHOICE — every option preserves the world line</div>
            {scene.options.map((opt, i) => (
              <button key={i} onClick={pickChoice} style={{
                padding: "10px 18px",
                background: "rgba(200,146,10,0.08)",
                border: "1px solid rgba(200,146,10,0.35)",
                color: "#f0d890",
                fontFamily: '"IM Fell English",serif', fontSize: 14,
                letterSpacing: "0.02em", textAlign: "left", cursor: "pointer",
                transition: "all 0.15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(200,146,10,0.18)"; e.currentTarget.style.borderColor = "rgba(200,146,10,0.7)"; e.currentTarget.style.transform = "translateX(4px)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "rgba(200,146,10,0.08)"; e.currentTarget.style.borderColor = "rgba(200,146,10,0.35)"; e.currentTarget.style.transform = "translateX(0)"; }}>
                <span style={{ color: "#c8920a", marginRight: 10 }}>▶</span>{opt.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* keyboard handler */}
      <VNKeyHandler onAdvance={advance}/>
    </div>
  );
}

function vnTopBtn(active) {
  return {
    padding: "5px 10px",
    background: active ? "rgba(200,146,10,0.25)" : "transparent",
    border: "1px solid rgba(200,146,10,0.3)",
    color: active ? "#f0d890" : "rgba(200,180,130,0.7)",
    fontFamily: "Share Tech Mono,monospace", fontSize: 9, letterSpacing: "0.18em",
    cursor: "pointer",
  };
}

function VNKeyHandler({ onAdvance }) {
  vnUE(() => {
    const k = (e) => {
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); onAdvance(); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onAdvance]);
  return null;
}


// ─── Save / Load system ─────────────────────────────────────────────────────
const SAVE_SLOTS = 3;
const SAVE_KEY = (i) => `sg_save_slot_${i}`;

async function saveGame(slotIdx, completed, stats) {
  let chats = {};
  try { const r = await fetch('/api/chat-export'); chats = await r.json(); } catch {}
  const slot = {
    ts: Date.now(),
    completed,
    stats,
    chats,
    divergence: localStorage.getItem('sg_divergence') || '0.571046%',
  };
  localStorage.setItem(SAVE_KEY(slotIdx), JSON.stringify(slot));
  return slot;
}

async function loadGame(slotIdx, setCompleted, setStats) {
  const raw = localStorage.getItem(SAVE_KEY(slotIdx));
  if (!raw) return false;
  const slot = JSON.parse(raw);
  localStorage.setItem('sg_chapters', JSON.stringify(slot.completed || {}));
  localStorage.setItem('sg_stats', JSON.stringify(slot.stats || {}));
  if (slot.divergence) localStorage.setItem('sg_divergence', slot.divergence);
  try {
    await fetch('/api/chat-import', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(slot.chats || {}),
    });
  } catch {}
  setCompleted(slot.completed || {});
  setStats(slot.stats || { emailsSent:0, dmailsSent:0, aiRepliesReceived:0, emailsSentTo:{} });
  return true;
}

function deleteSave(slotIdx) {
  localStorage.removeItem(SAVE_KEY(slotIdx));
}

function readSlot(i) {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY(i))); } catch { return null; }
}

function SaveSlots({ completed, stats, onLoad }) {
  const [slots, setSlots] = vnUS(() => Array.from({ length: SAVE_SLOTS }, (_, i) => readSlot(i)));
  const [busy, setBusy] = vnUS(null);   // { idx, action }
  const [flash, setFlash] = vnUS(null); // { idx, msg }
  const mono = { fontFamily: 'Share Tech Mono,monospace' };

  const doFlash = (idx, msg) => {
    setFlash({ idx, msg });
    setTimeout(() => setFlash(null), 1800);
  };

  const handleSave = async (i) => {
    setBusy({ idx: i, action: 'save' });
    const slot = await saveGame(i, completed, stats);
    setSlots(prev => { const n = [...prev]; n[i] = slot; return n; });
    setBusy(null);
    doFlash(i, '✓ SAVED');
  };

  const handleLoad = async (i) => {
    if (!slots[i]) return;
    setBusy({ idx: i, action: 'load' });
    await loadGame(i, (c) => {
      // propagate up to App via callback
    }, () => {});
    setBusy(null);
    doFlash(i, '✓ LOADED');
    setTimeout(() => onLoad(slots[i]), 300);
  };

  const handleDelete = (i) => {
    if (!slots[i]) return;
    if (!confirm(`Delete save slot ${i + 1}?`)) return;
    deleteSave(i);
    setSlots(prev => { const n = [...prev]; n[i] = null; return n; });
  };

  return (
    <div style={{ padding: '14px 28px 18px', borderBottom: '1px solid rgba(200,146,10,0.15)', background: 'rgba(0,0,0,0.18)' }}>
      <div style={{ ...mono, fontSize: 8, color: 'rgba(200,146,10,0.45)', letterSpacing: '0.28em', marginBottom: 10 }}>// SAVE · LOAD · GAME STATE</div>
      <div style={{ display: 'flex', gap: 10 }}>
        {slots.map((slot, i) => {
          const isBusy = busy?.idx === i;
          const isFlash = flash?.idx === i;
          const doneChaps = slot ? Object.keys(slot.completed || {}).length : 0;
          const chatCount = slot ? Object.keys(slot.chats || {}).length : 0;
          const tsLabel = slot ? new Date(slot.ts).toLocaleString('de-DE', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' }) : null;
          return (
            <div key={i} style={{
              flex: 1, border: `1px solid ${slot ? 'rgba(200,146,10,0.4)' : 'rgba(200,146,10,0.15)'}`,
              background: slot ? 'rgba(200,146,10,0.05)' : 'rgba(255,255,255,0.02)',
              padding: '10px 12px', position: 'relative', minHeight: 88,
              display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
              transition: 'border-color 0.2s',
            }}>
              {/* slot label */}
              <div style={{ ...mono, fontSize: 8, letterSpacing: '0.22em', color: 'rgba(200,146,10,0.5)', marginBottom: 4 }}>SLOT {i + 1}</div>

              {/* slot info */}
              {slot ? (
                <div>
                  <div style={{ ...mono, fontSize: 9, color: '#f0d890', letterSpacing: '0.06em', marginBottom: 2 }}>
                    {isFlash ? flash.msg : tsLabel}
                  </div>
                  <div style={{ ...mono, fontSize: 7, color: 'rgba(200,180,130,0.45)', letterSpacing: '0.12em' }}>
                    CH {doneChaps}/{CHAPTERS.length} · {chatCount} CHATS · {slot.stats?.emailsSent || 0} MAILS
                  </div>
                </div>
              ) : (
                <div style={{ ...mono, fontSize: 8, color: 'rgba(200,180,130,0.2)', letterSpacing: '0.15em' }}>
                  {isFlash ? flash.msg : '— EMPTY —'}
                </div>
              )}

              {/* action buttons */}
              <div style={{ display: 'flex', gap: 5, marginTop: 8 }}>
                <button onClick={() => handleSave(i)} disabled={isBusy} style={{
                  ...mono, flex: 1, fontSize: 8, letterSpacing: '0.16em', padding: '4px 0', cursor: isBusy ? 'wait' : 'pointer',
                  background: 'rgba(200,146,10,0.14)', border: '1px solid rgba(200,146,10,0.45)',
                  color: '#f0d890', transition: 'all 0.15s',
                }}>{isBusy && busy.action === 'save' ? '…' : '💾 SAVE'}</button>

                <button onClick={() => handleLoad(i)} disabled={isBusy || !slot} style={{
                  ...mono, flex: 1, fontSize: 8, letterSpacing: '0.16em', padding: '4px 0', cursor: (!slot || isBusy) ? 'not-allowed' : 'pointer',
                  background: slot ? 'rgba(100,180,100,0.1)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${slot ? 'rgba(100,200,100,0.35)' : 'rgba(200,146,10,0.1)'}`,
                  color: slot ? 'rgba(160,230,160,0.85)' : 'rgba(200,180,130,0.18)',
                  transition: 'all 0.15s',
                }}>{isBusy && busy.action === 'load' ? '…' : '▶ LOAD'}</button>

                {slot && <button onClick={() => handleDelete(i)} disabled={isBusy} style={{
                  ...mono, fontSize: 8, letterSpacing: '0.1em', padding: '4px 7px', cursor: 'pointer',
                  background: 'transparent', border: '1px solid rgba(180,50,50,0.3)',
                  color: 'rgba(200,80,80,0.6)', transition: 'all 0.15s',
                }}>✕</button>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Story Hub Panel ────────────────────────────────────────────────────────
function StoryHub({ open, onClose, stats, completed, onPlay, onResetProgress, onLoadSave, fontScale = 1, setFontScale, uiScale = 1, setUiScale }) {
  if (!open) return null;
  const total = CHAPTERS.length;
  const doneCount = CHAPTERS.filter(c => completed[c.id]).length;

  // Find next active chapter for the "Continue Operation" hero card
  const nextIdx = CHAPTERS.findIndex(c => !completed[c.id]);
  const heroChapter = nextIdx >= 0 ? CHAPTERS[nextIdx] : null;
  const heroPrevDone = nextIdx <= 0 || !!completed[CHAPTERS[nextIdx - 1]?.id];
  const heroEval = heroChapter ? evaluateUnlock(heroChapter.unlock, stats) : { ok: true, progress: 1, of: 1 };
  const heroUnlocked = heroPrevDone && heroEval.ok;

  const mono = "Share Tech Mono,monospace";
  const serif = '"IM Fell English",serif';

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 700,
      background: "rgba(2,5,15,0.88)", backdropFilter: "blur(10px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      animation: "bodyFadeIn 0.25s ease",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "min(860px, 92vw)", maxHeight: "90vh", overflowY: "auto",
        background: "rgba(6,10,22,0.98)",
        border: "1px solid rgba(232,184,92,0.3)",
        boxShadow: "0 0 60px rgba(200,146,10,0.12), 0 24px 80px rgba(0,0,0,0.7)",
        animation: "headerSlideIn 0.35s cubic-bezier(0.2,0.8,0.2,1)",
        borderRadius: 6, position: "relative",
      }}>

        {/* Header */}
        <div style={{
          padding: "24px 28px 20px",
          borderBottom: "1px solid rgba(232,184,92,0.15)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <div style={{ fontFamily: mono, fontSize: 10, color: "rgba(232,184,92,0.5)", letterSpacing: "0.3em", marginBottom: 8 }}>
              STORY MODE · {doneCount}/{total}
            </div>
            <div style={{ fontFamily: serif, fontSize: 32, color: "#f0d890", lineHeight: 1 }}>
              El Psy <span style={{ color: "#c8920a", fontStyle: "italic" }}>Kongroo</span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: mono, fontSize: 9, color: "rgba(232,184,92,0.4)", letterSpacing: "0.2em" }}>WORLD LINE</div>
              <div style={{ fontFamily: mono, fontSize: 18, color: "#f0d890", letterSpacing: "0.06em" }}>
                {doneCount === total ? "1.048596%" : `α ${(0.4 + doneCount * 0.1).toFixed(6)}%`}
              </div>
            </div>
            <button onClick={onClose} style={{
              background: "transparent", border: "1px solid rgba(232,184,92,0.25)",
              color: "rgba(220,205,170,0.6)", padding: "7px 16px",
              fontFamily: mono, fontSize: 10, letterSpacing: "0.2em",
              cursor: "pointer", borderRadius: 3, transition: "all 0.15s",
            }}
            onMouseEnter={e => { e.currentTarget.style.background="rgba(200,146,10,0.1)"; e.currentTarget.style.borderColor="rgba(232,184,92,0.5)"; e.currentTarget.style.color="#f0d890"; }}
            onMouseLeave={e => { e.currentTarget.style.background="transparent"; e.currentTarget.style.borderColor="rgba(232,184,92,0.25)"; e.currentTarget.style.color="rgba(220,205,170,0.6)"; }}>
              × CLOSE
            </button>
          </div>
        </div>

        {/* Hero card */}
        {heroChapter && heroUnlocked && (
          <div style={{ margin: "20px 24px 0", position: "relative", overflow: "hidden",
            border: "1px solid rgba(232,184,92,0.4)", borderRadius: 4, cursor: "pointer",
            transition: "box-shadow 0.2s",
          }}
          onClick={() => onPlay(heroChapter)}
          onMouseEnter={e => e.currentTarget.style.boxShadow="0 0 36px rgba(200,146,10,0.28)"}
          onMouseLeave={e => e.currentTarget.style.boxShadow="none"}>
            <div style={{ minHeight: 160, backgroundImage: `url(${heroChapter.bg})`,
              backgroundSize: "cover", backgroundPosition: "center",
              filter: "saturate(0.8) brightness(0.55)", padding: "20px 24px", position: "relative",
            }}>
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, rgba(4,8,18,0.9) 0%, rgba(4,8,18,0.4) 100%)" }}/>
              <div style={{ position: "relative", zIndex: 1 }}>
                <div style={{ fontFamily: mono, fontSize: 9, color: "#e8b850", letterSpacing: "0.3em", marginBottom: 8 }}>
                  {doneCount === 0 ? "▶ BEGIN" : "▶ CONTINUE"} · CH.{String(heroChapter.num).padStart(2,"0")}
                </div>
                <div style={{ fontFamily: serif, fontSize: 28, color: "#f0d890", lineHeight: 1.1, marginBottom: 14, textShadow: "0 2px 10px rgba(0,0,0,0.7)" }}>
                  {heroChapter.title}
                </div>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 8,
                  padding: "7px 18px",
                  background: "linear-gradient(180deg, #e8b850 0%, #c8920a 100%)",
                  borderRadius: 3, fontFamily: mono, fontSize: 11, letterSpacing: "0.22em",
                  color: "#1a1208", fontWeight: 700,
                }}>
                  ▶ PLAY
                </div>
              </div>
            </div>
          </div>
        )}

        {doneCount === total && (
          <div style={{ margin: "20px 24px 0", padding: "16px 20px",
            background: "rgba(122,202,168,0.06)", border: "1px solid rgba(122,202,168,0.4)", borderRadius: 4,
          }}>
            <div style={{ fontFamily: serif, fontSize: 20, color: "#a8e2c4" }}>
              ✓ You reached <span style={{ fontStyle: "italic" }}>Steins;Gate</span>.
            </div>
          </div>
        )}

        {/* Chapter list */}
        <div style={{ padding: "20px 24px 24px" }}>
          <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: "0.28em",
            color: "rgba(232,184,92,0.4)", marginBottom: 12 }}>CHAPTERS</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {CHAPTERS.map((ch, i) => {
              const prevDone = i === 0 || completed[CHAPTERS[i-1].id];
              const evalRes = evaluateUnlock(ch.unlock, stats);
              const unlocked = prevDone && evalRes.ok;
              const done = !!completed[ch.id];
              return (
                <ChapterCard key={ch.id} chapter={ch} unlocked={unlocked} done={done}
                  progress={evalRes.progress} of={evalRes.of}
                  blockedReason={!prevDone ? `Complete Chapter ${i} first` : !evalRes.ok ? ch.unlock.label : null}
                  onPlay={() => onPlay(ch)}/>
              );
            })}
          </div>
        </div>

        {/* Settings */}
        {setFontScale && (
          <div style={{ margin: "0 24px 24px", padding: "16px 20px",
            border: "1px solid rgba(200,195,185,0.1)", borderRadius: 4,
          }}>
            <div style={{ fontFamily: mono, fontSize: 9, color: "rgba(200,195,185,0.3)", letterSpacing: "0.25em", marginBottom: 14 }}>
              SETTINGS
            </div>
            <div style={{ display: "flex", gap: 32, flexWrap: "wrap", alignItems: "flex-start" }}>
              {setFontScale && (
                <div>
                  <div style={{ fontFamily: mono, fontSize: 9, color: "rgba(200,195,185,0.4)", letterSpacing: "0.18em", marginBottom: 8 }}>
                    TEXT SIZE · {Math.round(fontScale * 100)}%
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontFamily: mono, fontSize: 9, color: "rgba(200,195,185,0.35)" }}>A</span>
                    <input type="range" min="0.78" max="3.0" step="0.05" value={fontScale}
                      onChange={e => setFontScale(Number(e.target.value))} className="sg-volume"
                      style={{ width: 120, background: `linear-gradient(to right, rgba(200,195,185,0.6) ${((fontScale-0.78)/2.22)*100}%, rgba(200,195,185,0.12) ${((fontScale-0.78)/2.22)*100}%)` }}
                    />
                    <span style={{ fontFamily: mono, fontSize: 12, color: "rgba(200,195,185,0.5)" }}>A</span>
                  </div>
                </div>
              )}
              {setUiScale && (
                <div>
                  <div style={{ fontFamily: mono, fontSize: 9, color: "rgba(200,195,185,0.4)", letterSpacing: "0.18em", marginBottom: 8 }}>
                    UI SIZE · {Math.round(uiScale * 100)}%
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontFamily: mono, fontSize: 9, color: "rgba(200,195,185,0.35)" }}>⊟</span>
                    <input type="range" min="0.75" max="1.35" step="0.05" value={uiScale}
                      onChange={e => setUiScale(Number(e.target.value))} className="sg-volume"
                      style={{ width: 120, background: `linear-gradient(to right, rgba(200,195,185,0.6) ${((uiScale-0.75)/0.6)*100}%, rgba(200,195,185,0.12) ${((uiScale-0.75)/0.6)*100}%)` }}
                    />
                    <span style={{ fontFamily: mono, fontSize: 13, color: "rgba(200,195,185,0.5)" }}>⊞</span>
                  </div>
                </div>
              )}
              <div style={{ marginLeft: "auto" }}>
                <button onClick={onResetProgress} style={{
                  padding: "6px 14px", background: "transparent",
                  border: "1px solid rgba(180,80,80,0.3)", color: "rgba(220,140,140,0.65)",
                  fontFamily: mono, fontSize: 9, letterSpacing: "0.2em",
                  cursor: "pointer", borderRadius: 3, transition: "all 0.15s",
                }}
                onMouseEnter={e => { e.currentTarget.style.background="rgba(180,80,80,0.1)"; e.currentTarget.style.color="rgba(230,160,160,0.9)"; }}
                onMouseLeave={e => { e.currentTarget.style.background="transparent"; e.currentTarget.style.color="rgba(220,140,140,0.65)"; }}>
                  ↺ NEW GAME+
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

function Stat({ label, v, accent }) {
  return (
    <div>
      <div style={{ fontFamily: "Share Tech Mono,monospace", fontSize: 8, color: "rgba(200,146,10,0.4)", letterSpacing: "0.25em" }}>{label}</div>
      <div style={{ fontFamily: "Share Tech Mono,monospace", fontSize: 14, color: accent ? "#f0d890" : "rgba(220,205,170,0.85)", letterSpacing: "0.06em", marginTop: 2, textShadow: accent ? "0 0 10px rgba(240,216,144,0.4)" : "none" }}>{v}</div>
    </div>
  );
}

function ChapterCard({ chapter, unlocked, done, progress, of, blockedReason, onPlay }) {
  const [hover, setHover] = vnUS(false);
  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        display: "flex", gap: 0,
        background: unlocked ? "rgba(200,146,10,0.05)" : "rgba(40,30,20,0.28)",
        border: `1px solid ${done ? "rgba(122,202,168,0.55)" : unlocked ? "rgba(200,146,10,0.4)" : "rgba(200,146,10,0.12)"}`,
        boxShadow: hover && unlocked ? "0 0 26px rgba(200,146,10,0.15), 0 4px 16px rgba(0,0,0,0.4)" : "0 2px 8px rgba(0,0,0,0.3)",
        transition: "all 0.22s",
        opacity: unlocked ? 1 : 0.55,
        position: "relative",
        borderRadius: 4, overflow: "hidden",
        transform: hover && unlocked ? "translateX(2px)" : "translateX(0)",
      }}>
      {/* preview thumb */}
      <div style={{
        width: 180, flexShrink: 0,
        backgroundImage: `url(${chapter.bg})`,
        backgroundSize: "cover", backgroundPosition: "center",
        filter: unlocked ? "saturate(0.7) brightness(0.7)" : "saturate(0) brightness(0.3) blur(2px)",
        position: "relative",
      }}>
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, transparent 60%, rgba(4,10,24,0.85) 100%)" }}/>
        <div style={{ position: "absolute", left: 12, top: 10, fontFamily: "Share Tech Mono,monospace", fontSize: 9, color: done ? "#7acaa8" : "#f0d890", letterSpacing: "0.25em", textShadow: "0 0 8px rgba(0,0,0,0.8)" }}>
          {done ? "✓ COMPLETE" : unlocked ? `CH.${String(chapter.num).padStart(2, "0")}` : "🔒 LOCKED"}
        </div>
      </div>

      {/* content */}
      <div style={{ flex: 1, padding: "14px 18px", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
          <div style={{ fontFamily: '"IM Fell English",serif', fontSize: 19, color: unlocked ? "#f0d890" : "rgba(200,180,130,0.4)", lineHeight: 1.1 }}>{chapter.title}</div>
          <div style={{ fontFamily: "Share Tech Mono,monospace", fontSize: 8, color: "rgba(200,146,10,0.45)", letterSpacing: "0.18em" }}>{chapter.subtitle}</div>
        </div>
        <div style={{ fontFamily: "Share Tech Mono,monospace", fontSize: 9, color: "rgba(200,146,10,0.6)", letterSpacing: "0.12em", marginBottom: 8 }}>{chapter.setting}</div>
        <div style={{ fontFamily: '"IM Fell English",serif', fontStyle: "italic", fontSize: 13, color: "rgba(220,205,170,0.7)", lineHeight: 1.5, marginBottom: 12, flex: 1 }}>
          {chapter.summary}
        </div>

        {/* gate progress */}
        {!unlocked && blockedReason && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontFamily: "Share Tech Mono,monospace", fontSize: 8, color: "rgba(200,146,10,0.55)", letterSpacing: "0.2em", marginBottom: 4 }}>UNLOCK · {blockedReason}</div>
            {chapter.unlock.type !== "free" && of > 0 && (
              <div style={{ height: 3, background: "rgba(200,146,10,0.1)", position: "relative" }}>
                <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${(progress / of) * 100}%`, background: "linear-gradient(90deg, #c8920a, #f0d890)", boxShadow: "0 0 6px #c8920a" }}/>
              </div>
            )}
            <div style={{ fontFamily: "Share Tech Mono,monospace", fontSize: 8, color: "rgba(200,180,130,0.4)", letterSpacing: "0.15em", marginTop: 3 }}>{progress} / {of}</div>
          </div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onPlay} disabled={!unlocked} style={{
            padding: "7px 18px",
            background: unlocked ? (done ? "rgba(122,202,168,0.12)" : "linear-gradient(180deg, #c8920a 0%, #8a6010 100%)") : "rgba(200,146,10,0.04)",
            border: `1px solid ${unlocked ? (done ? "rgba(122,202,168,0.5)" : "rgba(200,146,10,0.6)") : "rgba(200,146,10,0.15)"}`,
            color: unlocked ? (done ? "#7acaa8" : "#02060e") : "rgba(200,180,130,0.3)",
            fontFamily: "Share Tech Mono,monospace", fontSize: 10, letterSpacing: "0.22em",
            cursor: unlocked ? "pointer" : "not-allowed", fontWeight: "bold",
          }}>{done ? "↻ REPLAY" : unlocked ? "▶ PLAY CHAPTER" : "🔒 LOCKED"}</button>
          {chapter.achievement && done && (
            <div style={{ padding: "7px 14px", background: "rgba(122,202,168,0.06)", border: "1px solid rgba(122,202,168,0.25)", fontFamily: "Share Tech Mono,monospace", fontSize: 9, color: "rgba(122,202,168,0.85)", letterSpacing: "0.15em" }}>
              ★ {chapter.achievement.name}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

window.StoryHub = StoryHub;
window.VNScene = VNScene;

// expose save helpers so BootSequence (Widgets.jsx) can call them at runtime
window.sg_saveGame  = saveGame;
window.sg_loadGame  = loadGame;
window.sg_readSlot  = readSlot;
window.sg_deleteSave = deleteSave;
window.sg_SAVE_SLOTS = SAVE_SLOTS;
window.sg_CHAPTERS   = CHAPTERS;


// ─── Chapter Complete cinematic ─────────────────────────────────────────────
const CHAPTER_COMPLETE_DURATION = 5000;

function ChapterComplete({ chapter, onDone }) {
  vnUE(() => {
    const t = setTimeout(onDone, CHAPTER_COMPLETE_DURATION);
    return () => clearTimeout(t);
  }, []);
  if (!chapter) return null;

  const reveal = (delay) => ({
    animation: `chSlideUp 0.55s ${delay}ms cubic-bezier(0.2,0.8,0.2,1) both`,
  });

  return (
    <div onClick={onDone} style={{
      position: "fixed", inset: 0, zIndex: 850,
      background: "#02060e",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      cursor: "pointer",
      animation: "bodyFadeIn 0.5s ease both",
    }}>
      {/* Hard dim — briefly goes near-black before content reveals */}
      <div style={{
        position: "absolute", inset: 0, zIndex: 10, pointerEvents: "none",
        background: "rgba(0,0,0,0.98)",
        animation: "bgDim 1.1s ease forwards",
      }}/>
      {/* Chapter background — dark + blurred for atmosphere only */}
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage: `url(${chapter.bg})`,
        backgroundSize: "cover", backgroundPosition: "center",
        filter: "saturate(0.3) brightness(0.18) blur(14px)",
        transform: "scale(1.08)",
      }}/>
      {/* Center amber glow */}
      <div style={{
        position: "absolute", inset: 0,
        background: "radial-gradient(ellipse 65% 55% at 50% 50%, rgba(200,146,10,0.1) 0%, transparent 70%)",
      }}/>
      {/* Scan lines */}
      <div style={{
        position: "absolute", inset: 0,
        background: "repeating-linear-gradient(0deg, transparent 0 5px, rgba(200,146,10,0.03) 5px 6px)",
        pointerEvents: "none",
      }}/>
      {/* Slow scan sweep */}
      <div style={{
        position: "absolute", left: 0, right: 0, height: 2,
        background: "linear-gradient(90deg, transparent, rgba(200,146,10,0.25), transparent)",
        animation: "shiftScan 4s linear",
        pointerEvents: "none",
      }}/>

      {/* Content */}
      <div style={{
        position: "relative", zIndex: 2,
        textAlign: "center", padding: "0 48px",
        maxWidth: 820, width: "100%",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 0,
      }}>
        {/* Badge */}
        <div style={{
          fontFamily: "Share Tech Mono,monospace", fontSize: 11, fontWeight: 700,
          color: "#c8920a", letterSpacing: "0.5em",
          marginBottom: 18,
          textShadow: "0 0 16px rgba(200,146,10,0.7), 1px 1px 0 rgba(0,0,0,0.9)",
          ...reveal(150),
        }}>
          CHAPTER {String(chapter.num).padStart(2, "0")} · CONVERGED
        </div>

        {/* Title */}
        <div style={{
          fontFamily: '"IM Fell English",serif',
          fontSize: "clamp(38px, 5.5vw, 64px)", fontWeight: 700,
          color: "#f5e8b0",
          textShadow: "0 0 50px rgba(240,216,144,0.6), 0 4px 32px rgba(0,0,0,1), 1px 1px 0 rgba(0,0,0,0.95), -1px -1px 0 rgba(0,0,0,0.7)",
          letterSpacing: "-0.01em", lineHeight: 1.05,
          marginBottom: 22,
          ...reveal(320),
        }}>
          {chapter.title}
        </div>

        {/* Divider */}
        <div style={{
          width: 140, height: 1,
          background: "linear-gradient(90deg, transparent, rgba(200,146,10,0.8), transparent)",
          boxShadow: "0 0 10px rgba(200,146,10,0.5)",
          marginBottom: 22,
          ...reveal(460),
        }}/>

        {/* Summary — with solid backdrop so background can't bleed through */}
        <div style={{
          background: "rgba(2,6,18,0.88)",
          border: "1px solid rgba(200,146,10,0.35)",
          borderRadius: 3,
          padding: "18px 28px",
          marginBottom: 24,
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
          ...reveal(580),
        }}>
          <p style={{
            fontFamily: '"IM Fell English",serif', fontStyle: "italic",
            fontSize: "clamp(14px, 1.5vw, 17px)", fontWeight: 600,
            color: "#f0e4c8",
            lineHeight: 1.7, margin: 0,
            textShadow: "0 1px 8px rgba(0,0,0,1), 0 0 2px rgba(0,0,0,0.9)",
          }}>
            {chapter.summary}
          </p>
        </div>

        {/* Achievement */}
        {chapter.achievement && (
          <div style={{
            padding: "11px 26px",
            background: "rgba(200,146,10,0.14)",
            border: "1px solid rgba(200,146,10,0.65)",
            borderRadius: 3,
            marginBottom: 26,
            boxShadow: "0 0 24px rgba(200,146,10,0.2)",
            ...reveal(720),
          }}>
            <div style={{ fontFamily: "Share Tech Mono,monospace", fontSize: 9, fontWeight: 700, color: "#c8920a", letterSpacing: "0.28em", marginBottom: 5 }}>★ ACHIEVEMENT UNLOCKED</div>
            <div style={{ fontFamily: '"IM Fell English",serif', fontSize: 20, fontWeight: 700, color: "#f5e8b0", textShadow: "0 0 18px rgba(200,146,10,0.5), 1px 1px 0 rgba(0,0,0,0.9)", marginBottom: 3 }}>{chapter.achievement.name}</div>
            <div style={{ fontFamily: '"IM Fell English",serif', fontStyle: "italic", fontSize: 13, fontWeight: 600, color: "#d8caa8" }}>{chapter.achievement.desc}</div>
          </div>
        )}

        {/* El Psy Kongroo */}
        <div style={{
          fontFamily: "Share Tech Mono,monospace", fontSize: 11, fontWeight: 700,
          color: "#c8920a", letterSpacing: "0.5em",
          textShadow: "0 0 14px rgba(200,146,10,0.6)",
          animation: `chGlowPulse 2.8s 1.2s ease-in-out infinite, chSlideUp 0.55s 860ms cubic-bezier(0.2,0.8,0.2,1) both`,
        }}>
          EL PSY KONGROO
        </div>
      </div>

      {/* Progress bar — auto-advance timer */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, height: 2,
        background: "rgba(200,146,10,0.12)",
      }}>
        <div style={{
          height: "100%",
          background: "linear-gradient(90deg, #c8920a, #f0d890)",
          boxShadow: "0 0 6px rgba(200,146,10,0.6)",
          animation: `chBarFill ${CHAPTER_COMPLETE_DURATION}ms linear both`,
          animationDelay: "0ms",
        }}/>
      </div>

      {/* Skip hint */}
      <div style={{
        position: "absolute", bottom: 12, right: 20,
        fontFamily: "Share Tech Mono,monospace", fontSize: 8,
        color: "rgba(200,146,10,0.3)", letterSpacing: "0.2em",
        animation: "chSlideUp 0.4s 1.4s both",
      }}>
        CLICK TO CONTINUE ▶
      </div>
    </div>
  );
}
window.ChapterComplete = ChapterComplete;
