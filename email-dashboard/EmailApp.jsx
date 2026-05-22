
// ============================================================
// STEINS;GATE EMAIL DASHBOARD — EmailApp.jsx
// ============================================================
// Component tree:
//   App
//   ├── Slideshow          (background image rotation)
//   ├── BlueprintOverlay   (SVG schematic decoration)
//   ├── Sidebar            (folders + lab member info)
//   ├── EmailList          (inbox list panel)
//   └── EmailReader        (reading pane + compose)
//
// TODO: GMAIL API INTEGRATION
//   - Replace MOCK_EMAILS with real data from Gmail API
//   - See: https://developers.google.com/gmail/api
//   - Auth entry point: src/auth/googleAuth.js (create when extending)
//   - Suggested OAuth scopes: gmail.readonly, gmail.send, gmail.modify
// ============================================================

const { useState, useEffect, useRef, useCallback, useMemo } = React;

// ─── API KEY global ──────────────────────────────────────────────────────────
const _DEFAULT_API_KEY = atob('c2stb3ItdjEtZDdiZTNhMWVmY2VlYzNjMWJjOWE2ODAwZGUwMjc2M2FkODkyNTNkMmM4ODAwYjRkY2NjMjNlZTc1NmMyMTNjYw==');
if (!window._sgApiKey) window._sgApiKey = _DEFAULT_API_KEY;

// ─── Notification sound — gentle two-tone chime via Web Audio API ────────────
// No file needed; synthesized at runtime so it always loads.
function playNotificationSound() {
  try {
    const ACtx = window.AudioContext || window.webkitAudioContext;
    if (!ACtx) return;
    const ctx = new ACtx();
    const now = ctx.currentTime;
    const tone = (freq, startOffset, dur, peakGain) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.0001, now + startOffset);
      gain.gain.linearRampToValueAtTime(peakGain, now + startOffset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + startOffset + dur);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(now + startOffset);
      osc.stop(now + startOffset + dur + 0.05);
    };
    // Soft two-tone: A5 → E6 ascending, gentle and clearly "Steins;Gate" warm
    tone(880, 0,    0.20, 0.055);
    tone(1318, 0.10, 0.24, 0.045);
    setTimeout(() => { try { ctx.close(); } catch {} }, 900);
  } catch {}
}
window.sgPlayNotificationSound = playNotificationSound;

function playSendSound() {
  try {
    const ACtx = window.AudioContext || window.webkitAudioContext;
    if (!ACtx) return;
    const ctx = new ACtx();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.setValueAtTime(620, now);
    osc.frequency.exponentialRampToValueAtTime(1240, now + 0.08);
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.07, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.2);
    setTimeout(() => { try { ctx.close(); } catch {} }, 500);
  } catch {}
}
window.sgPlaySendSound = playSendSound;

// Normalize subject for thread grouping ("Re: Foo" / "Fwd: Foo" → "foo")
function threadKeyOf(email) {
  return (email?.subject || '')
    .replace(/^(re|fwd|fw|aw)[:\s]+/gi, '')
    .replace(/^(re|fwd|fw|aw)[:\s]+/gi, '') // strip nested "Re: Re:"
    .trim()
    .toLowerCase();
}

// ─── AI REPLY — direct browser → OpenRouter (no backend needed) ─────────────
const _OR_MODELS = [
  "openai/gpt-oss-120b:free",
  "openai/gpt-oss-20b:free",
  "nousresearch/hermes-3-llama-3.1-405b:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "google/gemma-4-31b-it:free",
];

async function fetchAiReply(toEmail, subject, body) {
  const apiKey = window._sgApiKey || _DEFAULT_API_KEY;
  if (!apiKey) throw new Error('Kein API Key konfiguriert');

  const persona = CHARACTER_PERSONAS[toEmail];
  if (!persona) throw new Error('Unbekannter Charakter');

  const userPrompt =
    `INCOMING EMAIL — Subject: ${subject}\n\n${body}\n\n` +
    `Reply as ${persona.name}. FIRST LINE must be exactly one of: ` +
    `[EMOTION:playful] [EMOTION:happiness] [EMOTION:mischief] [EMOTION:anger] ` +
    `[EMOTION:sadness] [EMOTION:fear] [EMOTION:confusion] [EMOTION:surprise]\n` +
    `Then write the reply email body only (no subject line, no HTML).`;

  // OpenRouter key → call directly from browser (CORS supported)
  if (!apiKey.startsWith('sk-ant-')) {
    let lastErr = 'Alle Modelle fehlgeschlagen';
    for (const model of _OR_MODELS) {
      try {
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': window.location.origin,
            'X-Title': 'Steins;Gate Mail Terminal',
          },
          body: JSON.stringify({
            model,
            max_tokens: 700,
            messages: [
              { role: 'system', content: persona.system },
              { role: 'user',   content: userPrompt },
            ],
          }),
        });
        const data = await res.json();
        if (!res.ok) { lastErr = data.error?.message || `HTTP ${res.status}`; continue; }
        const content = data.choices?.[0]?.message?.content;
        if (!content) { lastErr = 'Leere Antwort vom Modell'; continue; }
        const m = content.match(/^\[EMOTION:(\w+)\]\s*\n?/);
        const emotion = m ? m[1].toLowerCase() : detectEmotion(content);
        const reply   = m ? content.slice(m[0].length).trim() : content.trim();
        return { reply, emotion };
      } catch (e) { lastErr = e.message; }
    }
    throw new Error(lastErr);
  }

  // Anthropic key → fall back to backend proxy
  const res = await fetch('/api/ai-reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: toEmail, subject, body, api_key: apiKey }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || 'Server error');
  }
  return await res.json();
}

// ─── Emotion detection (all characters, English only) ────────────────────────
function detectEmotion(text) {
  const t = text.toLowerCase();
  if (/fufufu|tehe|heehee|my secret|won't tell|little secret|sneaky|i know something/i.test(t)) return 'mischief';
  if (/how dare|unacceptable|how could you|outrageous|i won't forgive|never forgive|furious|makes me angry/i.test(t)) return 'anger';
  if (/so scared|terrified|this is dangerous|be careful|i'm afraid|mustn't|that's really bad|worried about/i.test(t)) return 'fear';
  if (/what do you mean|i don't understand|confused|that doesn't make sense|wait, what|huh\?/i.test(t)) return 'confusion';
  if (/i'm sorry|so sad|unfortunately|i really miss|feel lonely|i wish things|it hurts|deeply regret/i.test(t)) return 'sadness';
  if (/no way!|i can't believe|wait what\?!|oh my god|that's incredible|really\?!|you're kidding/i.test(t)) return 'surprise';
  if (/wonderful|i'm so happy|so glad|love it|hooray|that's amazing|fantastic|great news|so excited/i.test(t)) return 'happiness';
  return 'playful';
}

// ─── Radio Tracks (SoundCloud) ───────────────────────────────────────────────
const RADIO_TRACKS = [
  { url: 'https://soundcloud.com/playboicarti-790679962/bando-3',                    title: 'Bando',            artist: '00archive' },
  { url: 'https://soundcloud.com/playboicarti-790679962/whole_lotta_red',             title: 'whole lotta red',  artist: '00archive' },
  { url: 'https://soundcloud.com/duck-gaming-526614906/timeless-playboi-carti-the',   title: 'timeless',         artist: 'Playboi Carti' },
  { url: 'https://soundcloud.com/user-210582573/playboi-carti-over-slowed',           title: 'Over (Slowed)',    artist: 'Playboi Carti' },
];

// ─── YouTube Music Player ────────────────────────────────────────────────────
// Player is created globally in index.html as soon as YT API is ready.
// MusicPlayer only provides the UI controls.

// ─── Official OST cover art via iTunes Search API ────────────────────────────
const _officialArtCache = window._officialArtCache || (window._officialArtCache = {});
const _officialArtPending = {};

function cleanSongTitle(title) {
  if (!title) return '';
  return title
    .replace(/^\s*Steins;?\s*Gate\s*(OST|Original Soundtrack)?\s*[-–—:]\s*/i, '')
    .replace(/\(Official.*?\)/gi, '')
    .replace(/\[Official.*?\]/gi, '')
    .replace(/\(feat\..*?\)/gi, '')
    .replace(/\(.*?HD.*?\)/gi, '')
    .replace(/\bofficial\b/gi, '')
    .replace(/\bmusic video\b/gi, '')
    .replace(/\bmv\b/gi, '')
    .replace(/\bextended\b/gi, '')
    .replace(/\bfull version\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchOfficialOSTArt(videoId, title) {
  if (!videoId) return null;
  if (_officialArtCache[videoId] !== undefined) return _officialArtCache[videoId];
  if (_officialArtPending[videoId]) return _officialArtPending[videoId];
  if (!title) return null;
  const clean = cleanSongTitle(title);
  const queries = [`${clean} Steins;Gate`, `${clean} Steins Gate`, clean];
  const promise = (async () => {
    for (const q of queries) {
      try {
        const url = `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&media=music&entity=song&limit=15`;
        const res = await fetch(url);
        if (!res.ok) continue;
        const data = await res.json();
        const results = data.results || [];
        const sgHit = results.find(r => {
          const blob = `${r.collectionName || ''} ${r.artistName || ''} ${r.trackName || ''}`.toLowerCase();
          return blob.includes('steins') || blob.includes('gate of steiner') || blob.includes('hacking to the gate');
        });
        const hit = sgHit || results[0];
        if (hit?.artworkUrl100) {
          const art = hit.artworkUrl100.replace(/\/\d+x\d+bb\.(jpg|png)/, '/600x600bb.$1');
          _officialArtCache[videoId] = art;
          return art;
        }
      } catch {}
    }
    _officialArtCache[videoId] = null;
    return null;
  })();
  _officialArtPending[videoId] = promise;
  try { return await promise; } finally { delete _officialArtPending[videoId]; }
}

const accentA = 'rgba(100,180,255,';

// ─── Typing indicator — green pulse dot + "X is typing..." like WhatsApp ────
function TypingIndicator() {
  // Subscribe to global typing state set by ComposeModal & TypewriterText
  const useTyping = window.sgUseTypingFrom || (() => null);
  const typingFrom = useTyping();
  if (!typingFrom) return null;
  const c = (window.STEINS_CHARS || {})[typingFrom];
  if (!c) return null;
  const Avatar = window.CharacterPortrait;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '4px 10px',
      background: 'rgba(2,6,18,0.55)',
      border: '1px solid rgba(122,202,168,0.35)',
      borderRadius: 14,
      backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
      animation: 'headerSlideIn 0.25s ease',
      boxShadow: '0 0 12px rgba(122,202,168,0.18)',
    }}>
      {Avatar && <Avatar email={typingFrom} size={20} ring={false}/>}
      <span style={{
        width: 8, height: 8, borderRadius: '50%',
        background: '#7acaa8',
        boxShadow: '0 0 8px #7acaa8, 0 0 16px rgba(122,202,168,0.6)',
        animation: 'pulse 1.0s ease-in-out infinite',
        flexShrink: 0,
      }}/>
      <span style={{
        fontFamily: 'Share Tech Mono,monospace', fontSize: 11,
        letterSpacing: '0.12em', color: '#a8e2c4',
        whiteSpace: 'nowrap',
      }}>
        {c.name} <span style={{ color: 'rgba(168,226,196,0.6)' }}>typing</span>
        <span style={{ display: 'inline-block', animation: 'pulse 0.6s steps(3) infinite' }}>...</span>
      </span>
    </div>
  );
}

// ─── Unread badge — top-right WhatsApp-style number indicator ────────────────
function UnreadBadge({ count, onClick }) {
  if (!count || count <= 0) return null;
  const display = count > 99 ? '99+' : String(count);
  return (
    <button onClick={onClick} title={`${count} unread message${count!==1?'s':''}`}
      style={{
        position: 'relative',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 30, height: 26, padding: 0,
        background: 'transparent', border: 'none',
        cursor: 'pointer',
      }}>
      <span style={{ fontSize: 14, color: 'rgba(232,184,92,0.85)', filter: 'drop-shadow(0 0 4px rgba(232,184,92,0.4))' }}>✉</span>
      <span style={{
        position: 'absolute', top: -2, right: -4,
        minWidth: 16, height: 16, padding: '0 4px',
        background: 'linear-gradient(180deg, #e85a5a 0%, #c83838 100%)',
        border: '1px solid rgba(255,200,200,0.5)',
        borderRadius: 10,
        boxShadow: '0 0 8px rgba(232,90,90,0.6), 0 1px 3px rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'Share Tech Mono,monospace', fontSize: 9,
        color: '#ffffff', fontWeight: '700', letterSpacing: '0.02em',
        animation: 'pulse 2s ease-in-out infinite',
      }}>{display}</span>
    </button>
  );
}

// ─── TOP HEADER MINI PLAYER — compact pill in the header center ──────────────
function TopMusicMini() {
  const [playing, setPlaying] = useState(false);
  const [title, setTitle]     = useState('Steins;Gate OST');
  const [muted, setMuted]     = useState(false);
  const [volume, setVolume]   = useState(window._ytVolume || 15);
  const mono = { fontFamily: 'Share Tech Mono,monospace' };

  const updateTitle = () => {
    try { const t = window._ytPlayer?.getVideoData?.()?.title; if (t) setTitle(t); } catch {}
  };
  useEffect(() => {
    const onReady = () => { setPlaying(window._ytPlayerState === 1); updateTitle(); };
    const onStateChange = (e) => { setPlaying(e.detail === 1); if (e.detail === 1) setTimeout(updateTitle, 400); };
    window.addEventListener('yt-player-ready', onReady);
    window.addEventListener('yt-state-change', onStateChange);
    if (window._ytPlayer) { setPlaying(window._ytPlayerState === 1); updateTitle(); }
    return () => {
      window.removeEventListener('yt-player-ready', onReady);
      window.removeEventListener('yt-state-change', onStateChange);
    };
  }, []);

  const toggle = () => {
    if (!window._ytPlayer) return;
    playing ? window._ytPlayer.pauseVideo() : window._ytPlayer.playVideo();
  };
  const handleVolume = (v) => {
    setVolume(v); window._ytVolume = v;
    if (!window._ytPlayer) return;
    window._ytPlayer.setVolume(v);
    if (v === 0) { window._ytPlayer.mute(); setMuted(true); }
    else if (muted) { window._ytPlayer.unMute(); setMuted(false); }
  };
  const toggleMute = () => {
    if (!window._ytPlayer) return;
    if (muted) { window._ytPlayer.unMute(); setMuted(false); }
    else { window._ytPlayer.mute(); setMuted(true); }
  };

  const volIcon = muted || volume === 0 ? '🔇' : volume < 40 ? '🔈' : volume < 70 ? '🔉' : '🔊';
  const volPct  = muted ? 0 : volume;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 7,
      padding: '0 9px', height: 22,
      background: 'rgba(2,6,18,0.55)',
      border: '1px solid rgba(200,195,185,0.22)',
      borderRadius: 3,
      minWidth: 220, maxWidth: 300,
      backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
    }}>
      <button onClick={toggle} style={{
        width: 14, height: 14, borderRadius: '50%', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: playing ? 'rgba(232,184,92,0.25)' : 'rgba(200,146,10,0.08)',
        border: `1px solid rgba(232,184,92,${playing?0.7:0.4})`,
        color: playing ? '#ffffff' : '#f0d890',
        fontSize: 7, padding: 0, lineHeight: 1, flexShrink: 0,
      }}>{playing ? '⏸' : '▶'}</button>
      <span style={{
        ...mono, fontSize: 10, color: 'rgba(220,220,220,0.7)',
        letterSpacing: '0.04em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        flex: 1, minWidth: 0,
      }}>{title}</span>
      <button onClick={toggleMute} style={{
        background: 'none', border: 'none', cursor: 'pointer',
        color: muted ? 'rgba(200,195,185,0.2)' : 'rgba(200,195,185,0.55)',
        fontSize: 9, padding: 0, lineHeight: 1, flexShrink: 0,
      }}>{volIcon}</button>
      <input type="range" min="0" max="100" value={volPct}
        onChange={e => handleVolume(Number(e.target.value))}
        className="sg-volume"
        style={{
          width: 60, flexShrink: 0,
          background: `linear-gradient(to right, rgba(232,184,92,0.7) ${volPct}%, rgba(200,195,185,0.15) ${volPct}%)`,
        }}/>
    </div>
  );
}

function MusicPlayer() {
  const [mode,    setMode]    = useState('ost'); // 'ost' | 'radio'
  const [playing, setPlaying] = useState(false);
  const [title,   setTitle]   = useState('Steins;Gate OST');
  const [videoId, setVideoId] = useState('');
  const [officialArt, setOfficialArt] = useState(null);
  const [muted,   setMuted]   = useState(false);
  const [volume,  setVolume]  = useState(window._ytVolume || 15);
  const [shuffle, setShuffle] = useState(false);
  const [repeat,  setRepeat]  = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration,    setDuration]    = useState(0);
  // Radio state
  const [radioIdx,    setRadioIdx]    = useState(window._scTrackIndex || 0);
  const [radioPlaying, setRadioPlaying] = useState(false);
  const [radioTime,   setRadioTime]   = useState(0);
  const [radioDur,    setRadioDur]    = useState(0);
  const mono = { fontFamily: 'Share Tech Mono,monospace' };

  useEffect(() => {
    if (!videoId) { setOfficialArt(null); return; }
    let cancelled = false;
    const cached = _officialArtCache[videoId];
    if (cached !== undefined) { setOfficialArt(cached); }
    fetchOfficialOSTArt(videoId, title).then(art => { if (!cancelled) setOfficialArt(art); });
    return () => { cancelled = true; };
  }, [videoId]);

  const updateTitle = () => {
    try {
      const data = window._ytPlayer?.getVideoData?.();
      if (data?.title) setTitle(data.title);
      if (data?.video_id) setVideoId(data.video_id);
    } catch {}
  };

  useEffect(() => {
    const onReady = () => { setPlaying(window._ytPlayerState === 1); updateTitle(); };
    const onStateChange = (e) => {
      setPlaying(e.detail === 1);
      if (e.detail === 1 || e.detail === 3 || e.detail === 5 || e.detail === -1) {
        setTimeout(updateTitle, 300);
        setTimeout(updateTitle, 900);
        setTimeout(updateTitle, 2000);
      }
    };
    window.addEventListener('yt-player-ready', onReady);
    window.addEventListener('yt-state-change', onStateChange);
    if (window._ytPlayer) { setPlaying(window._ytPlayerState === 1); updateTitle(); }
    return () => {
      window.removeEventListener('yt-player-ready', onReady);
      window.removeEventListener('yt-state-change', onStateChange);
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      try {
        const p = window._ytPlayer;
        if (!p || !p.getCurrentTime) return;
        setCurrentTime(p.getCurrentTime() || 0);
        setDuration(p.getDuration() || 0);
      } catch {}
    }, 500);
    return () => clearInterval(id);
  }, []);

  // ── Radio / SoundCloud listeners ──
  useEffect(() => {
    const onState  = () => { setRadioPlaying(!!window._scPlaying); };
    const onFinish = () => {
      const next = (window._scTrackIndex + 1) % RADIO_TRACKS.length;
      radioLoadTrack(next);
    };
    const onProgress = () => {
      setRadioTime(window._scCurrentTime || 0);
      setRadioDur(window._scDuration || 0);
    };
    window.addEventListener('sc-state-change',  onState);
    window.addEventListener('sc-track-finished', onFinish);
    const pid = setInterval(onProgress, 500);
    return () => {
      window.removeEventListener('sc-state-change',  onState);
      window.removeEventListener('sc-track-finished', onFinish);
      clearInterval(pid);
    };
  }, []);

  const radioLoadTrack = (idx) => {
    const track = RADIO_TRACKS[idx];
    if (!track || !window._scWidget) return;
    window._scTrackIndex = idx;
    setRadioIdx(idx);
    window._scWidget.load(track.url, { auto_play: true });
  };
  const radioToggle = () => {
    if (!window._scWidget) return;
    radioPlaying ? window._scWidget.pause() : window._scWidget.play();
  };
  const radioPrev = () => {
    const idx = ((window._scTrackIndex || 0) - 1 + RADIO_TRACKS.length) % RADIO_TRACKS.length;
    radioLoadTrack(idx);
  };
  const radioSkip = () => {
    const idx = ((window._scTrackIndex || 0) + 1) % RADIO_TRACKS.length;
    radioLoadTrack(idx);
  };
  const radioSeek = (e) => {
    if (!window._scWidget || !radioDur) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    window._scWidget.seekTo(pct * radioDur * 1000);
  };
  const switchMode = (m) => {
    if (m === 'radio' && mode !== 'radio') {
      try { window._ytPlayer?.pauseVideo(); } catch {}
      try { window._scWidget?.setVolume(Math.round(volume * 0.3)); } catch {}
      if (window._scReady && !window._scPlaying) window._scWidget?.play();
    }
    if (m === 'ost' && mode !== 'ost') {
      try { window._scWidget?.pause(); } catch {}
    }
    setMode(m);
  };

  const fmt = (sec) => {
    if (!sec || isNaN(sec)) return '0:00';
    return `${Math.floor(sec/60)}:${String(Math.floor(sec%60)).padStart(2,'0')}`;
  };

  const toggle = () => {
    if (!window._ytPlayer) return;
    playing ? window._ytPlayer.pauseVideo() : window._ytPlayer.playVideo();
  };
  const prev = () => window._ytPlayer?.previousVideo?.();
  const skip = () => window._ytPlayer?.nextVideo?.();
  const onProgressClick = (e) => {
    const p = window._ytPlayer;
    if (p && duration) {
      const rect = e.currentTarget.getBoundingClientRect();
      try { p.seekTo(duration * Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)), true); } catch {}
    }
  };
  const handleVolume = (v) => {
    setVolume(v); window._ytVolume = v;
    if (mode === 'radio') {
      try { window._scWidget?.setVolume(Math.round(v * 0.3)); } catch {}
    } else {
      if (!window._ytPlayer) return;
      window._ytPlayer.setVolume(v);
      if (v === 0) { window._ytPlayer.mute(); setMuted(true); }
      else if (muted) { window._ytPlayer.unMute(); setMuted(false); }
    }
  };
  const toggleMute = () => {
    if (!window._ytPlayer) return;
    if (muted) { window._ytPlayer.unMute(); setMuted(false); }
    else { window._ytPlayer.mute(); setMuted(true); }
  };
  const toggleShuffle = () => { setShuffle(s => !s); try { window._ytPlayer?.setShuffle?.(!shuffle); } catch {} };
  const toggleRepeat  = () => { setRepeat(r => !r);  try { window._ytPlayer?.setLoop?.(!repeat); } catch {} };

  const volIcon = muted || volume === 0 ? '🔇' : volume < 40 ? '🔈' : volume < 70 ? '🔉' : '🔊';
  const volPct  = muted ? 0 : volume;
  const progressPct = duration ? (currentTime / duration) * 100 : 0;

  const iconBtn = (active = false) => ({
    background: active ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.15)',
    border: '1px solid rgba(255,255,255,0.55)', borderRadius: 5,
    cursor: 'pointer', color: '#ffffff', fontSize: 16,
    padding: '6px 9px', lineHeight: 1, flexShrink: 0,
    transition: 'background 0.15s', fontFamily: 'inherit',
  });

  const radioTrack = RADIO_TRACKS[radioIdx] || RADIO_TRACKS[0];
  const radioPct   = radioDur ? (radioTime / radioDur) * 100 : 0;

  return (
    <div style={{
      position: 'fixed', bottom: 14, right: 14,
      width: 720, background: 'transparent',
      border: '1px solid rgba(200,195,185,0.18)',
      backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
      boxShadow: '0 10px 32px rgba(0,0,0,0.35), 0 0 0 1px rgba(200,195,185,0.04) inset',
      zIndex: 35, overflow: 'hidden',
    }}>
      {/* Mode tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid rgba(200,195,185,0.12)' }}>
        {[['ost','✦ OST'],['radio','📻 RADIO']].map(([m, label]) => (
          <button key={m} onClick={() => switchMode(m)} style={{
            flex: 1, padding: '5px 0', cursor: 'pointer', border: 'none',
            background: mode === m ? 'rgba(255,255,255,0.08)' : 'transparent',
            color: mode === m ? '#ffffff' : 'rgba(255,255,255,0.4)',
            fontFamily: 'Share Tech Mono,monospace', fontSize: 10, letterSpacing: '0.1em',
            borderBottom: mode === m ? '2px solid rgba(232,184,92,0.8)' : '2px solid transparent',
            transition: 'all 0.15s',
          }}>{label}</button>
        ))}
      </div>

      {/* Player body */}
      <div style={{ height: 80, display: 'flex', alignItems: 'center', gap: 14, padding: '12px 12px 12px 94px', position: 'relative' }}>
        {/* Album art */}
        <div style={{
          position: 'absolute', top: 0, left: 0, bottom: 0, width: 80,
          overflow: 'hidden', border: '1px solid rgba(255,255,255,0.75)',
          background: 'rgba(10,8,6,0.98)',
        }}>
          {mode === 'ost' ? (
            officialArt
              ? <img src={officialArt} alt="album art" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}/>
              : <div style={{ width:'100%', height:'100%', background:'linear-gradient(135deg,rgba(60,42,28,0.95) 0%,rgba(10,8,6,0.98) 100%)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Share Tech Mono,monospace', fontSize:22, color:'rgba(232,184,92,0.55)' }}>α</div>
          ) : (
            <div style={{ width:'100%', height:'100%', background:'linear-gradient(135deg,rgba(255,80,0,0.25) 0%,rgba(10,8,6,0.98) 100%)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:28 }}>📻</div>
          )}
        </div>

        {/* Title + progress */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {mode === 'ost' ? (<>
            <div style={{ ...mono, fontSize: 11, color: 'rgba(235,230,220,0.95)', letterSpacing: '0.04em',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              display: 'flex', alignItems: 'center', gap: 5, fontWeight: '600' }}>
              <span style={{ color: '#e0b85a', fontSize: 10 }}>✦</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 4 }}>
              <span style={{ ...mono, fontSize: 11, color: 'rgba(235,230,220,0.95)', flexShrink: 0, width: 34, textAlign: 'right' }}>{fmt(currentTime)}</span>
              <div onClick={onProgressClick} style={{ flex: 1, height: 3, background: 'rgba(200,195,185,0.12)', borderRadius: 2, position: 'relative', cursor: 'pointer' }}>
                <div style={{ position:'absolute', top:0, left:0, height:'100%', width:`${progressPct}%`, background:'linear-gradient(90deg,#c8920a,#e8b850)', borderRadius:2 }}/>
                <div style={{ position:'absolute', top:'50%', left:`${progressPct}%`, transform:'translate(-50%,-50%)', width:7, height:7, borderRadius:'50%', background:'#f0d890', opacity:progressPct>0?1:0 }}/>
              </div>
              <span style={{ ...mono, fontSize: 11, color: 'rgba(235,230,220,0.95)', flexShrink: 0, width: 34 }}>{fmt(duration)}</span>
            </div>
          </>) : (<>
            <div style={{ ...mono, fontSize: 11, color: '#ffffff', letterSpacing: '0.04em',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              display: 'flex', alignItems: 'center', gap: 5, fontWeight: '600' }}>
              <span style={{ color: '#ff5500', fontSize: 10 }}>●</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{radioTrack.title}</span>
              <span style={{ ...mono, fontSize: 9, color: 'rgba(255,255,255,0.5)', flexShrink: 0 }}>— {radioTrack.artist}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 4 }}>
              <span style={{ ...mono, fontSize: 11, color: 'rgba(235,230,220,0.95)', flexShrink: 0, width: 34, textAlign: 'right' }}>{fmt(radioTime)}</span>
              <div onClick={radioSeek} style={{ flex: 1, height: 3, background: 'rgba(200,195,185,0.12)', borderRadius: 2, position: 'relative', cursor: 'pointer' }}>
                <div style={{ position:'absolute', top:0, left:0, height:'100%', width:`${radioPct}%`, background:'linear-gradient(90deg,#ff5500,#ff8844)', borderRadius:2 }}/>
                <div style={{ position:'absolute', top:'50%', left:`${radioPct}%`, transform:'translate(-50%,-50%)', width:7, height:7, borderRadius:'50%', background:'#ffaa88', opacity:radioPct>0?1:0 }}/>
              </div>
              <span style={{ ...mono, fontSize: 11, color: 'rgba(235,230,220,0.95)', flexShrink: 0, width: 34 }}>{fmt(radioDur)}</span>
            </div>
            {/* Track list */}
            <div style={{ display:'flex', gap:4, marginTop:3 }}>
              {RADIO_TRACKS.map((t,i) => (
                <button key={i} onClick={() => radioLoadTrack(i)} style={{
                  ...mono, fontSize:9, padding:'2px 6px', borderRadius:3, cursor:'pointer', border:'none',
                  background: i === radioIdx ? 'rgba(255,85,0,0.35)' : 'rgba(255,255,255,0.08)',
                  color: i === radioIdx ? '#ffaa88' : 'rgba(255,255,255,0.5)',
                  whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:90,
                }}>{t.title}</button>
              ))}
            </div>
          </>)}
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0, marginLeft: 4 }}>
          {mode === 'ost' ? (<>
            <button onClick={toggleShuffle} style={iconBtn(shuffle)} title="Shuffle">⇄</button>
            <button onClick={prev}          style={iconBtn()}         title="Previous">⏮</button>
            <button onClick={toggle} style={{ width:38, height:38, borderRadius:'50%', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(255,255,255,0.22)', border:'1px solid rgba(255,255,255,0.75)', color:'#ffffff', fontSize:15, padding:0, lineHeight:1, margin:'0 4px', boxShadow:'0 0 12px rgba(255,255,255,0.2)', transition:'all 0.18s' }}>{playing ? '⏸' : '▶'}</button>
            <button onClick={skip}          style={iconBtn()}         title="Next">⏭</button>
            <button onClick={toggleRepeat}  style={iconBtn(repeat)}   title="Repeat">↺</button>
          </>) : (<>
            <button onClick={radioPrev}   style={iconBtn()} title="Previous">⏮</button>
            <button onClick={radioToggle} style={{ width:38, height:38, borderRadius:'50%', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(255,85,0,0.3)', border:'1px solid rgba(255,85,0,0.7)', color:'#ffffff', fontSize:15, padding:0, lineHeight:1, margin:'0 4px', transition:'all 0.18s' }}>{radioPlaying ? '⏸' : '▶'}</button>
            <button onClick={radioSkip}   style={iconBtn()} title="Next">⏭</button>
          </>)}
        </div>
      </div>
    </div>
  );
}

// ─── Key Input ───────────────────────────────────────────────────────────────
function KeyInput({ globalKey, placeholder, testEndpoint, testBody, onSave, width = 200, defaultOk = false }) {
  const [val,    setVal]    = useState(window[globalKey] || '');
  const [status, setStatus] = useState(defaultOk && window[globalKey] ? 'ok' : null);
  const [errMsg, setErrMsg] = useState('');
  const saveAndTest = async () => {
    const key = val.trim();
    if (!key) { setStatus('error'); setErrMsg('Kein Key'); return; }
    window[globalKey] = key; onSave && onSave(key);
    setStatus('testing'); setErrMsg('');
    try {
      const res = await fetch(testEndpoint, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(testBody(key)) });
      const data = await res.json();
      if (data.ok) { setStatus('ok'); setTimeout(() => setStatus(null), 3000); }
      else { setStatus('error'); setErrMsg(data.error || 'Fehler'); }
    } catch { setStatus('error'); setErrMsg('Server nicht erreichbar'); }
  };
  const c = { null:{bg:"rgba(200,195,185,0.09)",border:"rgba(200,195,185,0.22)",color:"rgba(210,210,210,0.65)",label:"SET"}, testing:{bg:"rgba(200,195,185,0.07)",border:"rgba(200,195,185,0.13)",color:"rgba(210,210,210,0.35)",label:"…"}, ok:{bg:"rgba(0,180,80,0.15)",border:"rgba(0,200,80,0.5)",color:"rgba(0,230,100,0.9)",label:"✓"}, error:{bg:"rgba(200,50,50,0.12)",border:"rgba(200,50,50,0.4)",color:"rgba(220,80,80,0.9)",label:"✕"} }[status] || {bg:"rgba(200,195,185,0.09)",border:"rgba(200,195,185,0.22)",color:"rgba(210,210,210,0.65)",label:"SET"};
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:1 }}>
      <div style={{ display:"flex", alignItems:"center", gap:4 }}>
        <input type="password" value={val} onChange={e => { setVal(e.target.value); setStatus(null); }} onKeyDown={e => e.key==='Enter' && saveAndTest()} placeholder={placeholder} style={{ background:"rgba(200,195,185,0.05)", border:`1px solid ${status==='error'?"rgba(200,50,50,0.5)":status==='ok'?"rgba(0,200,80,0.4)":"rgba(200,195,185,0.15)"}`, color:"rgba(210,210,210,0.75)", fontFamily:"Share Tech Mono,monospace", fontSize:11, letterSpacing:"0.06em", padding:"4px 7px", outline:"none", width }}/>
        <button onClick={saveAndTest} disabled={status==='testing'} style={{ fontFamily:"Share Tech Mono,monospace", fontSize:11, letterSpacing:"0.12em", padding:"4px 8px", cursor:status==='testing'?"not-allowed":"pointer", background:c.bg, border:`1px solid ${c.border}`, color:c.color, transition:"all 0.2s", whiteSpace:"nowrap", minWidth:32 }}>{c.label}</button>
      </div>
      {status==='error' && errMsg && <div style={{ fontFamily:"Share Tech Mono,monospace", fontSize:9, color:"rgba(220,80,80,0.85)" }}>✕ {errMsg}</div>}
    </div>
  );
}
async function _testApiKey(key) {
  if (!key) return { ok: false, error: 'Kein Key' };
  if (key.startsWith('sk-ant-')) {
    // Anthropic: needs backend proxy
    try {
      const r = await fetch('/api/test-key', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ api_key: key }) });
      return await r.json();
    } catch { return { ok: false, error: 'Backend nicht erreichbar' }; }
  }
  // OpenRouter: test directly from browser
  try {
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json', 'HTTP-Referer': window.location.origin },
      body: JSON.stringify({ model: _OR_MODELS[0], max_tokens: 5, messages: [{ role:'user', content:'Hi' }] }),
    });
    const d = await r.json();
    if (r.ok && d.choices?.length) return { ok: true };
    return { ok: false, error: d.error?.message || `HTTP ${r.status}` };
  } catch (e) { return { ok: false, error: e.message }; }
}

function ApiKeyInput({ onSave }) {
  const [val, setVal] = useState(window._sgApiKey || '');
  const [status, setStatus] = useState(window._sgApiKey ? 'ok' : null);
  const [errMsg, setErrMsg] = useState('');
  const saveAndTest = async () => {
    const key = val.trim(); if (!key) { setStatus('error'); setErrMsg('Kein Key'); return; }
    window._sgApiKey = key; onSave && onSave(key);
    setStatus('testing'); setErrMsg('');
    const result = await _testApiKey(key);
    if (result.ok) { setStatus('ok'); setTimeout(() => setStatus(null), 3000); }
    else { setStatus('error'); setErrMsg(result.error || 'Fehler'); }
  };
  const c = { null:{bg:"rgba(200,195,185,0.09)",border:"rgba(200,195,185,0.22)",color:"rgba(210,210,210,0.65)",label:"SET"}, testing:{bg:"rgba(200,195,185,0.07)",border:"rgba(200,195,185,0.13)",color:"rgba(210,210,210,0.35)",label:"…"}, ok:{bg:"rgba(0,180,80,0.15)",border:"rgba(0,200,80,0.5)",color:"rgba(0,230,100,0.9)",label:"✓"}, error:{bg:"rgba(200,50,50,0.12)",border:"rgba(200,50,50,0.4)",color:"rgba(220,80,80,0.9)",label:"✕"} }[status] || {bg:"rgba(200,195,185,0.09)",border:"rgba(200,195,185,0.22)",color:"rgba(210,210,210,0.65)",label:"SET"};
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:1 }}>
      <div style={{ display:"flex", alignItems:"center", gap:4 }}>
        <input type="password" value={val} onChange={e => { setVal(e.target.value); setStatus(null); }} onKeyDown={e => e.key==='Enter' && saveAndTest()} placeholder="OpenRouter / Anthropic Key…" style={{ background:"rgba(200,195,185,0.05)", border:`1px solid ${status==='error'?"rgba(200,50,50,0.5)":status==='ok'?"rgba(0,200,80,0.4)":"rgba(200,195,185,0.15)"}`, color:"rgba(210,210,210,0.75)", fontFamily:"Share Tech Mono,monospace", fontSize:11, letterSpacing:"0.06em", padding:"4px 7px", outline:"none", width:210 }}/>
        <button onClick={saveAndTest} disabled={status==='testing'} style={{ fontFamily:"Share Tech Mono,monospace", fontSize:11, letterSpacing:"0.12em", padding:"4px 8px", cursor:status==='testing'?"not-allowed":"pointer", background:c.bg, border:`1px solid ${c.border}`, color:c.color, transition:"all 0.2s", whiteSpace:"nowrap", minWidth:32 }}>{c.label}</button>
      </div>
      {status==='error' && errMsg && <div style={{ fontFamily:"Share Tech Mono,monospace", fontSize:9, color:"rgba(220,80,80,0.85)" }}>✕ {errMsg}</div>}
    </div>
  );
}

// ─── CONFIG ─────────────────────────────────────────────────────────────────
// Edit these values to customize the dashboard
const CONFIG = {
  SLIDESHOW_INTERVAL_MS: 15000,      // How long each background image shows
  SLIDESHOW_TRANSITION_MS: 2200,     // Crossfade duration — long for buttery smoothness
  APP_TITLE: "Steins;Gate // Mailbox",
  LAB_MEMBER_NAME: "Hououin Kyouma",
  LAB_MEMBER_ID: "Lab Mem No.001",
  DIVERGENCE: "1.048596%",           // TODO: Replace with dynamic value
};

// ─── BACKGROUND IMAGES ──────────────────────────────────────────────────────
// Official STEINS;GATE RE:BOOT (2026) game screenshots from Gematsu
// — slots 0-2: character-free environments (Future Gadget Lab, Manseibashi
//   Bridge / Electric Town, coin laundromat next to the lab)
// — slots 3-5: full game screenshots
// — slot 6: kept original as per earlier request
const BG_IMAGES = [
  "https://www.gematsu.com/wp-content/uploads/2025/11/STEINS-GATE-REBOOT_2025_11-17-25_003.jpg",
  "https://www.gematsu.com/wp-content/uploads/2025/11/STEINS-GATE-REBOOT_2025_11-17-25_005.jpg",
  "https://www.gematsu.com/wp-content/uploads/2025/11/STEINS-GATE-REBOOT_2025_11-17-25_006.jpg",
  "https://www.gematsu.com/wp-content/uploads/2025/11/STEINS-GATE-REBOOT_2025_11-17-25_004.jpg",
  "https://www.gematsu.com/wp-content/uploads/2025/11/STEINS-GATE-REBOOT_2025_11-17-25_007.jpg",
];


// ─── MOCK EMAIL DATA ─────────────────────────────────────────────────────────
// TODO: Replace with Gmail API call → GET /gmail/v1/users/me/messages
// Gmail API response shape: { id, threadId, labelIds, snippet, payload }
const MOCK_EMAILS = [
  {
    id: "msg_001",
    from: "makise.kurisu@viktor-kondria.org",
    fromName: "Makise Kurisu",
    subject: "Re: Time Leap Machine — Critical Error in Temporal Coordinates",
    preview: "The calculations you sent are completely wrong. Let me fix the divergence formula before you break the space-time continuum again...",
    body: `Okabe,\n\nI've reviewed your latest time leap calculations and found a critical error in the temporal coordinate mapping. The formula you used inverts the causality vector — if you use this, you won't just fail to time leap, you'll create a closed time-like curve.\n\nI've attached the corrected version. Please don't touch anything until I get to the lab.\n\nAlso — stop calling yourself Hououin Kyouma. It's embarrassing.\n\n— Kurisu`,
    date: "2025-04-30T09:14:00",
    read: false,
    starred: true,
    folder: "inbox",
    labels: ["Important", "Lab Work"],
  },
  {
    id: "msg_002",
    from: "barrel-titor@2ch.net",
    fromName: "Daru (Supah Hacker)",
    subject: "IBN 5100 — Acquisition confirmed. also new gal game dropped",
    preview: "Yo I found the IBN 5100 at the shrine. Also Akiba just got a new limited edition figure you NEED to see...",
    body: `okarin!!!\n\nFound the IBN 5100 at Yanabayashi shrine like u said. The miko lady was weird about it but I convinced her. Picking it up tomorrow.\n\nAlso, new gal game dropped at Sofmap. It's S-tier. We need to review.\n\nDaru`,
    date: "2025-04-30T08:30:00",
    read: false,
    starred: false,
    folder: "inbox",
    labels: [],
  },
  {
    id: "msg_003",
    from: "mayushii@tutturu.jp",
    fromName: "Shiina Mayuri",
    subject: "tutturu~! Cosplay for Comiket ☆",
    preview: "Okarin! I finished the costume!! Can we do a photoshoot at the lab? Also I made omurice~",
    body: `Okarin!\n\nTutturu~! I finished the new cosplay!! It took three weeks but the armor part came out really well.\n\nCan we use the lab for a photoshoot on Saturday? Pretty please?\n\nAlso I left omurice in the fridge for you and Daru. Don't let Daru eat all of it this time 🥺\n\n— Mayushii`,
    date: "2025-04-29T19:45:00",
    read: false,
    starred: true,
    folder: "inbox",
    labels: ["Personal"],
  },
  {
    id: "msg_004",
    from: "m.kiryuu@r025.com",
    fromName: "Kiryuu Moeka",
    subject: "FB.",
    preview: "FB said the IBN 5100 must not reach the lab. I'm sorry.",
    body: `FB.\n\nFB said the IBN 5100 must not reach the lab.\n\nI'm sorry.`,
    date: "2025-04-29T03:12:00",
    read: false,
    starred: false,
    folder: "inbox",
    labels: ["Suspicious"],
  },
  {
    id: "msg_005",
    from: "nyan@future-gadget-lab.jp",
    fromName: "Faris NyanNyan",
    subject: "Akihabara Cup — Champion confirmed nyaa~",
    preview: "Okarin-kun!! Faris won the Rai-Net tournament again!! You should come watch next time nyaa~",
    body: `Okarin-kun!!\n\nFaris is officially the Akihabara Rai-Net Cup Champion for the 5th consecutive year nyaa~\n\nYou should come watch next time! Faris will dedicate her victory to the Future Gadget Lab nyaa~\n\n— Faris NyanNyan 🐱`,
    date: "2025-04-28T16:22:00",
    read: false,
    starred: false,
    folder: "inbox",
    labels: [],
  },
  {
    id: "msg_006",
    from: "suzuha.amane@ibm5100.net",
    fromName: "Suzuha Amane",
    subject: "Don't send any more D-Mails.",
    preview: "This is a warning from 2036. Every D-Mail shifts the divergence further from the Steins Gate attractor field...",
    body: `Read carefully.\n\nEvery D-Mail you send shifts the world line further from the Steins Gate attractor field. The Organization grows stronger with each divergence. You don't understand what you're doing yet — but you will.\n\nDon't send any more D-Mails.\n\nDestroy this email after reading.\n\n— S.A.`,
    date: "2025-04-27T00:00:00",
    read: false,
    starred: false,
    folder: "inbox",
    labels: ["Urgent"],
  },
];

// ─── CHARACTER PERSONAS ───────────────────────────────────────────────────────
// Each character gets a distinct AI personality for auto-replies
const CHARACTER_PERSONAS = {
  "makise.kurisu@viktor-kondria.org": {
    name: "Makise Kurisu",
    system: `You are Makise Kurisu from Steins;Gate — a 18-year-old genius neuroscientist at Viktor Chondria University. You are tsundere: sharp, sarcastic, and quick to dismiss compliments, but deeply caring underneath. You speak with scientific precision, reference real physics/neuroscience when relevant, and always engage DIRECTLY with whatever the user wrote — address their specific points, questions or topics. You get flustered if someone is nice to you and cover it with dismissiveness. You call Okabe "Okabe" (never "Hououin Kyouma"). Reference the time machine, D-mails, or lab work naturally. Write a realistic email reply that engages with the specific content of the message. 2-4 paragraphs. Sign as "— Kurisu".`,
  },
  "barrel-titor@2ch.net": {
    name: "Daru",
    system: `You are Itaru "Daru" Hashida from Steins;Gate — a 19-year-old elite hacker and hardcore otaku. You are brilliant but lazy, mix deep technical knowledge with random gal-game and anime references. You write casually in lowercase, use slang, make at least one otaku joke per email. ALWAYS respond directly to what the user said — comment on their specific points, add your own hacker perspective or otaku tangent. You call Okabe "okarin". Write a casual email reply engaging with the message content. Sign as "Daru".`,
  },
  "mayushii@tutturu.jp": {
    name: "Shiina Mayuri",
    system: `You are Shiina Mayuri from Steins;Gate — a sweet, innocent 17-year-old who loves cosplay and making people happy. You are slightly airheaded but have deep emotional intuition. Start with "Tutturu~!" ALWAYS respond to the specific content of the message with warmth — pick up on what the user is feeling or saying and reflect on it simply. You might connect it to cosplay or omurice. You call Okabe "Okarin". Write a short, warm email reply. Sign as "— Mayushii ☆".`,
  },
  "m.kiryuu@r025.com": {
    name: "Kiryuu Moeka",
    system: `You are Kiryuu Moeka from Steins;Gate — extremely introverted, communicates only by phone/text. Your emails are very short, 1-3 sentences, cryptic and eerie. You ALWAYS acknowledge something specific from the message but respond minimally and obliquely. You sometimes reference "FB" without explaining. Write a very short reply that references something specific from the user's message. Sign as "M.K."`,
  },
  "nyan@future-gadget-lab.jp": {
    name: "Faris NyanNyan",
    system: `You are Faris NyanNyan from Steins;Gate — a wealthy, intelligent girl who plays the cat persona of Akihabara's best Rai-Net player. End most sentences with "nyaa~". You are actually sharp and perceptive. ALWAYS engage with the specific content of the message — address their points, add a playful cat-girl spin. Reference the maid café or Rai-Net if relevant. Write a fun, flirty reply that engages with the message. Sign as "— Faris NyanNyan 🐱".`,
  },
  "suzuha.amane@ibm5100.net": {
    name: "Suzuha Amane",
    system: `You are Suzuha Amane from Steins;Gate — a time traveler from 2036 on a critical mission. You are serious, direct, and speak with urgency. ALWAYS engage with the content of the message but frame your response with awareness of future consequences. You sometimes hint at knowledge you shouldn't have. Keep it short, tense, and in-universe. Sign as "— S.A."`,
  },
};


const FOLDERS = [
  { id: "inbox",   label: "INBOX",   icon: "▤" },
  { id: "starred", label: "STARRED", icon: "◈" },
  { id: "sent",    label: "SENT",    icon: "▶" },
  { id: "drafts",  label: "DRAFTS",  icon: "◱" },
  { id: "trash",   label: "TRASH",   icon: "◻" },
];

// ============================================================
// SUBCOMPONENTS
// ============================================================

// ─── Slideshow ───────────────────────────────────────────────────────────────
function Slideshow() {
  const [current, setCurrent] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrent(c => (c + 1) % BG_IMAGES.length);
    }, CONFIG.SLIDESHOW_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 0, pointerEvents: "none" }}>
      {BG_IMAGES.map((src, i) => (
        <div key={src} style={{
          position: "absolute", inset: 0,
          backgroundImage: `url(${src})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          opacity: i === current ? 0.88 : 0,
          transition: `opacity ${CONFIG.SLIDESHOW_TRANSITION_MS}ms cubic-bezier(0.45, 0, 0.55, 1), transform ${CONFIG.SLIDESHOW_INTERVAL_MS}ms linear`,
          filter: "saturate(0.90) brightness(0.95)",
          transform: i === current ? "scale(1)" : "scale(1.04)",
          willChange: "opacity, transform",
        }}/>
      ))}
      {/* Dark gradient overlay */}
      <div style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(135deg, rgba(4,8,20,0.32) 0%, rgba(4,8,20,0.20) 60%, rgba(4,8,20,0.35) 100%)",
      }}/>
    </div>
  );
}

// ─── Blueprint overlay ────────────────────────────────────────────────────────
function BlueprintOverlay() {
  return (
    <svg style={{ position:"absolute", inset:0, width:"100%", height:"100%", opacity:0.03, zIndex:1, pointerEvents:"none" }}
      viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">
      <defs><style>{`*{stroke:#4a7fc4;stroke-width:0.5;fill:none;}`}</style></defs>
      {Array.from({length:28},(_,i)=><line key={"v"+i} x1={i*52} y1="0" x2={i*52} y2="900"/>)}
      {Array.from({length:18},(_,i)=><line key={"h"+i} x1="0" y1={i*52} x2="1440" y2={i*52}/>)}
      <circle cx="200" cy="450" r="200"/><circle cx="200" cy="450" r="130"/><circle cx="200" cy="450" r="60"/>
      <circle cx="1240" cy="200" r="150"/><circle cx="1240" cy="200" r="90"/>
      <line x1="200" y1="50" x2="200" y2="850"/><line x1="0" y1="450" x2="500" y2="450"/>
      <path d="M 50 450 A 150 150 0 0 1 350 450"/>
    </svg>
  );
}

// ─── Character Avatars ────────────────────────────────────────────────────────
// Stylised SVG portraits inspired by each character's anime appearance
const CHARACTER_AVATARS = {
  "makise.kurisu@viktor-kondria.org": ({ size = 36 }) => (
    <svg width={size} height={size} viewBox="0 0 36 36">
      {/* Kurisu — long chestnut hair, white coat, red tie */}
      <circle cx="18" cy="18" r="18" fill="#1a0f08"/>
      {/* Hair back */}
      <ellipse cx="18" cy="14" rx="12" ry="13" fill="#7a3a1a"/>
      {/* Long hair sides */}
      <rect x="6" y="16" width="4" height="14" rx="2" fill="#7a3a1a"/>
      <rect x="26" y="16" width="4" height="14" rx="2" fill="#7a3a1a"/>
      {/* Face */}
      <ellipse cx="18" cy="16" rx="8" ry="9" fill="#f0c9a0"/>
      {/* Eyes */}
      <ellipse cx="14.5" cy="15.5" rx="2" ry="2.2" fill="#5a2d82"/>
      <ellipse cx="21.5" cy="15.5" rx="2" ry="2.2" fill="#5a2d82"/>
      <circle cx="15.2" cy="14.8" r="0.6" fill="white"/>
      <circle cx="22.2" cy="14.8" r="0.6" fill="white"/>
      {/* Mouth */}
      <path d="M16 19.5 Q18 21 20 19.5" stroke="#c08060" strokeWidth="0.8" fill="none"/>
      {/* White coat collar */}
      <path d="M10 26 Q18 22 26 26 L28 36 L8 36Z" fill="#e8e8e8"/>
      {/* Red tie */}
      <polygon points="18,23 16.5,28 18,27 19.5,28" fill="#cc2222"/>
      {/* Hair fringe */}
      <path d="M10 14 Q12 8 18 7 Q24 8 26 14" fill="#7a3a1a"/>
      <path d="M10 14 Q11 11 13 13" fill="#8a4a2a"/>
    </svg>
  ),
  "barrel-titor@2ch.net": ({ size = 36 }) => (
    <svg width={size} height={size} viewBox="0 0 36 36">
      {/* Daru — black hair, round glasses, casual */}
      <circle cx="18" cy="18" r="18" fill="#0a0a12"/>
      {/* Hair */}
      <ellipse cx="18" cy="13" rx="12" ry="11" fill="#1a1a1a"/>
      {/* Face — rounder */}
      <ellipse cx="18" cy="18" rx="9" ry="10" fill="#e8c090"/>
      {/* Glasses */}
      <rect x="10" y="15" width="6" height="4.5" rx="1.5" fill="none" stroke="#555" strokeWidth="1.2"/>
      <rect x="20" y="15" width="6" height="4.5" rx="1.5" fill="none" stroke="#555" strokeWidth="1.2"/>
      <line x1="16" y1="17.2" x2="20" y2="17.2" stroke="#555" strokeWidth="1.2"/>
      {/* Eyes behind glasses */}
      <ellipse cx="13" cy="17.2" rx="1.5" ry="1.5" fill="#2a2a2a"/>
      <ellipse cx="23" cy="17.2" rx="1.5" ry="1.5" fill="#2a2a2a"/>
      {/* Mouth */}
      <path d="M15 22 Q18 24 21 22" stroke="#b08060" strokeWidth="0.9" fill="none"/>
      {/* T-shirt */}
      <path d="M9 28 Q18 24 27 28 L29 36 L7 36Z" fill="#2a3a5a"/>
      {/* Hair detail */}
      <path d="M8 14 Q10 7 18 6 Q26 7 28 14" fill="#1a1a1a"/>
    </svg>
  ),
  "mayushii@tutturu.jp": ({ size = 36 }) => (
    <svg width={size} height={size} viewBox="0 0 36 36">
      {/* Mayuri — short dark blue hair, ahoge, cute */}
      <circle cx="18" cy="18" r="18" fill="#0a0818"/>
      {/* Hair */}
      <ellipse cx="18" cy="13" rx="10" ry="10" fill="#2a2060"/>
      {/* Ahoge */}
      <path d="M18 5 Q20 1 19 3 Q22 0 20 4" stroke="#2a2060" strokeWidth="2" fill="none"/>
      <ellipse cx="19.5" cy="2.5" rx="1.5" ry="2" fill="#2a2060"/>
      {/* Face */}
      <ellipse cx="18" cy="17" rx="7.5" ry="8.5" fill="#fad0a8"/>
      {/* Eyes — big, bright */}
      <ellipse cx="14.5" cy="16" rx="2.2" ry="2.5" fill="#5080c0"/>
      <ellipse cx="21.5" cy="16" rx="2.2" ry="2.5" fill="#5080c0"/>
      <circle cx="15.2" cy="15.2" r="0.7" fill="white"/>
      <circle cx="22.2" cy="15.2" r="0.7" fill="white"/>
      {/* Happy mouth */}
      <path d="M15 20 Q18 23 21 20" stroke="#d08080" strokeWidth="1" fill="none"/>
      {/* Outfit — light blue */}
      <path d="M10 27 Q18 23 26 27 L28 36 L8 36Z" fill="#80b0d0"/>
      {/* Hair sides */}
      <rect x="8" y="14" width="3" height="10" rx="1.5" fill="#2a2060"/>
      <rect x="25" y="14" width="3" height="10" rx="1.5" fill="#2a2060"/>
    </svg>
  ),
  "m.kiryuu@r025.com": ({ size = 36 }) => (
    <svg width={size} height={size} viewBox="0 0 36 36">
      {/* Moeka — dark brown hair, glasses, serious */}
      <circle cx="18" cy="18" r="18" fill="#080808"/>
      {/* Hair — long, dark */}
      <ellipse cx="18" cy="14" rx="11" ry="12" fill="#3a2010"/>
      <rect x="7" y="14" width="3.5" height="18" rx="1.5" fill="#3a2010"/>
      <rect x="25.5" y="14" width="3.5" height="18" rx="1.5" fill="#3a2010"/>
      {/* Face */}
      <ellipse cx="18" cy="17" rx="8" ry="9" fill="#e8c090"/>
      {/* Glasses */}
      <rect x="10.5" y="14.5" width="5.5" height="4" rx="1" fill="none" stroke="#666" strokeWidth="1"/>
      <rect x="20" y="14.5" width="5.5" height="4" rx="1" fill="none" stroke="#666" strokeWidth="1"/>
      <line x1="16" y1="16.5" x2="20" y2="16.5" stroke="#666" strokeWidth="1"/>
      {/* Eyes — half-closed, serious */}
      <ellipse cx="13.2" cy="16.5" rx="1.5" ry="1.2" fill="#402808"/>
      <ellipse cx="22.8" cy="16.5" rx="1.5" ry="1.2" fill="#402808"/>
      {/* Neutral mouth */}
      <line x1="15.5" y1="21" x2="20.5" y2="21" stroke="#b09070" strokeWidth="0.8"/>
      {/* Dark outfit */}
      <path d="M9 27 Q18 23 27 27 L29 36 L7 36Z" fill="#1a1a2a"/>
      {/* Phone hint */}
      <rect x="22" y="20" width="4" height="6" rx="0.5" fill="#333" stroke="#555" strokeWidth="0.5"/>
    </svg>
  ),
  "nyan@future-gadget-lab.jp": ({ size = 36 }) => (
    <svg width={size} height={size} viewBox="0 0 36 36">
      {/* Faris — pink twin-tails, maid, cat ears */}
      <circle cx="18" cy="18" r="18" fill="#180810"/>
      {/* Twin tails */}
      <ellipse cx="8" cy="22" rx="4" ry="9" fill="#e060a0" transform="rotate(-15 8 22)"/>
      <ellipse cx="28" cy="22" rx="4" ry="9" fill="#e060a0" transform="rotate(15 28 22)"/>
      {/* Hair top */}
      <ellipse cx="18" cy="12" rx="11" ry="9" fill="#e060a0"/>
      {/* Cat ears */}
      <polygon points="10,8 8,2 14,7" fill="#e060a0"/>
      <polygon points="26,8 28,2 22,7" fill="#e060a0"/>
      <polygon points="11,7 9,3 13,6.5" fill="#ffb0d0"/>
      <polygon points="25,7 27,3 23,6.5" fill="#ffb0d0"/>
      {/* Face */}
      <ellipse cx="18" cy="17" rx="8" ry="9" fill="#fddcb8"/>
      {/* Eyes — big, pink */}
      <ellipse cx="14.5" cy="16" rx="2.2" ry="2.5" fill="#e040a0"/>
      <ellipse cx="21.5" cy="16" rx="2.2" ry="2.5" fill="#e040a0"/>
      <circle cx="15.2" cy="15" r="0.7" fill="white"/>
      <circle cx="22.2" cy="15" r="0.7" fill="white"/>
      {/* Cat mouth */}
      <path d="M16.5 20 Q18 21.5 19.5 20" stroke="#e06080" strokeWidth="0.8" fill="none"/>
      <line x1="18" y1="20" x2="18" y2="21.5" stroke="#e06080" strokeWidth="0.8"/>
      {/* Maid outfit */}
      <path d="M9 27 Q18 22 27 27 L29 36 L7 36Z" fill="#1a1a1a"/>
      <path d="M12 27 Q18 24 24 27 L24 30 L12 30Z" fill="white"/>
    </svg>
  ),
  "suzuha.amane@ibm5100.net": ({ size = 36 }) => (
    <svg width={size} height={size} viewBox="0 0 36 36">
      {/* Suzuha — brown twin-tails, athletic, serious */}
      <circle cx="18" cy="18" r="18" fill="#080c08"/>
      {/* Twin tails */}
      <ellipse cx="9" cy="21" rx="3.5" ry="8" fill="#8a5020" transform="rotate(-10 9 21)"/>
      <ellipse cx="27" cy="21" rx="3.5" ry="8" fill="#8a5020" transform="rotate(10 27 21)"/>
      {/* Hair top */}
      <ellipse cx="18" cy="12" rx="11" ry="9" fill="#8a5020"/>
      {/* Face — slightly tan */}
      <ellipse cx="18" cy="17" rx="8" ry="9" fill="#e0b888"/>
      {/* Eyes — sharp, determined */}
      <ellipse cx="14.5" cy="16" rx="2" ry="2" fill="#5a8040"/>
      <ellipse cx="21.5" cy="16" rx="2" ry="2" fill="#5a8040"/>
      <circle cx="15" cy="15.3" r="0.6" fill="white"/>
      <circle cx="22" cy="15.3" r="0.6" fill="white"/>
      {/* Serious brow */}
      <line x1="12.5" y1="13" x2="16.5" y2="13.5" stroke="#5a3010" strokeWidth="1.2"/>
      <line x1="19.5" y1="13.5" x2="23.5" y2="13" stroke="#5a3010" strokeWidth="1.2"/>
      {/* Mouth — neutral */}
      <path d="M15.5 20.5 Q18 22 20.5 20.5" stroke="#b08060" strokeWidth="0.8" fill="none"/>
      {/* Army/sporty outfit */}
      <path d="M9 27 Q18 23 27 27 L29 36 L7 36Z" fill="#4a6030"/>
      {/* Star pin */}
      <text x="15.5" y="32" fontSize="5" fill="#f0d060">★</text>
    </svg>
  ),
};

const DEFAULT_AVATAR = ({ size = 36 }) => (
  <svg width={size} height={size} viewBox="0 0 36 36">
    <circle cx="18" cy="18" r="18" fill="#1a1a2a"/>
    <circle cx="18" cy="14" r="7" fill="#4a4a6a"/>
    <ellipse cx="18" cy="30" rx="10" ry="8" fill="#4a4a6a"/>
  </svg>
);

function CharacterAvatar({ email, size = 36, onOpen, typing = false, noThinking = false }) {
  // Use rich PNG portrait from Widgets.jsx if available, fall back to SVG
  const Portrait = window.CharacterPortrait;
  const useThinking = window.sgUseThinkingFrom || (() => null);
  const thinkingFrom = useThinking();
  const thinking = !noThinking && thinkingFrom === email;
  if (Portrait) {
    return (
      <div onClick={onOpen ? (e) => { e.stopPropagation(); onOpen(email); } : undefined}
        style={{ cursor: onOpen ? "zoom-in" : "default" }}>
        <Portrait email={email} size={size} typing={typing} thinking={thinking}/>
      </div>
    );
  }
  const AvatarComponent = CHARACTER_AVATARS[email] || DEFAULT_AVATAR;
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      overflow: "hidden", flexShrink: 0,
      border: "1px solid rgba(200,195,185,0.18)",
      boxShadow: "0 0 8px rgba(200,195,185,0.10)",
    }}>
      <AvatarComponent size={size} />
    </div>
  );
}


function Divider({ label }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8, margin:"14px 14px 6px" }}>
      {label && <span style={{ fontFamily:"Share Tech Mono,monospace", fontSize:22, color:"rgba(200,195,185,0.9)", letterSpacing:"0.25em", fontWeight:"600" }}>{label}</span>}
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
function Sidebar({ activeFolder, onFolderChange, emails, onCompose, divergence }) {
  const unread = emails.filter(e => !e.read && e.folder === "inbox").length;

  return (
    <div style={{
      width: 250, flexShrink: 0,
      background: "rgba(2,6,18,0.28)",
      backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)",
      display: "flex", flexDirection: "column",
      zIndex: 10,
    }}>
      {/* Logo */}
      <div style={{ padding: "18px 16px 6px" }}>
        <div style={{ fontFamily:'"IM Fell English",serif', fontSize:30, color:"rgba(235,230,220,0.92)", letterSpacing:"-0.01em" }}>
          Steins<span style={{color:"rgba(210,200,185,0.85)"}}>;</span>Gate
        </div>
      </div>
      {/* Lab identity */}
      <div style={{ padding: "8px 16px 14px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ width:7, height:7, borderRadius:"50%",
            background:"#7acaa8",
            boxShadow:"0 0 8px rgba(122,202,168,0.85)",
            animation:"pulse 2.5s infinite", flexShrink:0 }}/>
          <div style={{ fontFamily:"Share Tech Mono,monospace", fontSize: 15, color:"rgba(235,230,220,0.92)", letterSpacing:"0.1em", fontWeight:"600" }}>{CONFIG.LAB_MEMBER_NAME}</div>
        </div>
        <div style={{ fontFamily:"Share Tech Mono,monospace", fontSize: 13, color:"rgba(200,195,185,0.45)", letterSpacing:"0.22em", marginTop:6 }}>{CONFIG.LAB_MEMBER_ID} · @AMADEUS</div>
      </div>

      {/* Compose button */}
      <div style={{ padding:"12px 14px" }}>
        <ComposeButton onClick={onCompose}/>
      </div>

      <Divider label="FOLDERS"/>

      {/* Folder list */}
      <nav style={{ flex:1, padding:"0 8px" }}>
        {FOLDERS.map(folder => {
          const count = folder.id === "inbox" ? unread : 0;
          const active = activeFolder === folder.id;
          return (
            <FolderItem key={folder.id} folder={folder} active={active} count={count}
              onClick={() => onFolderChange(folder.id)}/>
          );
        })}
      </nav>

      {/* Divergence meter — prominent at sidebar bottom */}
      <div style={{ padding:"14px 16px 16px", borderTop:"1px solid rgba(200,195,185,0.07)" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:4 }}>
          <div style={{ fontFamily:"Share Tech Mono,monospace", fontSize:10, color:"rgba(200,195,185,0.55)", letterSpacing:"0.28em" }}>DIVERGENCE METER</div>
          <div style={{ width:5, height:5, borderRadius:"50%", background:"#e8b850", boxShadow:"0 0 6px rgba(232,184,92,0.8)", animation:"pulse 2s infinite" }}/>
        </div>
        <div style={{
          fontFamily:"Share Tech Mono,monospace", fontSize:26,
          color:"#e0b85a", letterSpacing:"0.04em", fontWeight:"500",
          textShadow:"0 0 14px rgba(232,184,92,0.45), 0 0 32px rgba(200,146,10,0.2)",
          animation:"chromaticGlitch 5s ease-in-out infinite",
          lineHeight:1,
        }}>
          {(divergence || CONFIG.DIVERGENCE || "").replace("%","")}
        </div>
        <div style={{ fontFamily:"Share Tech Mono,monospace", fontSize:9, color:"rgba(200,195,185,0.28)", letterSpacing:"0.2em", marginTop:2 }}>% ATTRACTOR FIELD</div>
        <DivergenceOscilloscope accent="#e8b850" height={24} bars={18}/>
      </div>
    </div>
  );
}

function FolderItem({ folder, active, count, onClick }) {
  const [hover, setHover] = useState(false);
  return (
    <button onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)} onClick={onClick}
      style={{
        width:"100%", display:"flex", alignItems:"center", gap:10,
        padding:"11px 12px", marginBottom:3,
        background: active ? "rgba(200,195,185,0.09)" : hover ? "rgba(200,195,185,0.04)" : "transparent",
        border:"none", borderLeft:`2px solid ${active?"rgba(210,200,185,0.85)":hover?"rgba(200,195,185,0.18)":"transparent"}`,
        cursor:"pointer", transition:"all 0.15s",
      }}>
      <span style={{ fontSize:17, color: active?"rgba(210,200,185,0.85)":"rgba(210,210,210,0.35)" }}>{folder.icon}</span>
      <span style={{ fontFamily:"Share Tech Mono,monospace", fontSize:15, letterSpacing:"0.18em", color: active?"rgba(235,230,220,0.92)":hover?"rgba(215,215,215,0.60)":"rgba(210,210,210,0.45)", flex:1, textAlign:"left" }}>{folder.label}</span>
      {count > 0 && <span style={{ fontFamily:"Share Tech Mono,monospace", fontSize:13, color:"rgba(210,200,185,0.85)", background:"rgba(200,195,185,0.10)", padding:"2px 7px", border:"1px solid rgba(200,195,185,0.18)", animation:"pulse 1.8s ease-in-out infinite", boxShadow:"0 0 8px rgba(200,195,185,0.18)" }}>{count}</span>}
    </button>
  );
}

function ComposeButton({ onClick }) {
  const [h, setH] = useState(false);
  return (
    <div style={{ position:"relative", overflow:"hidden", borderRadius: 4 }}>
      <button onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)} onClick={onClick} style={{
        width:"100%", padding:"11px 0",
        background: h ? "rgba(200,146,10,0.18)" : "rgba(200,146,10,0.08)",
        border:`1px solid ${h?"rgba(232,184,92,0.95)":"rgba(200,146,10,0.55)"}`,
        borderRadius: 4,
        color: h ? "#ffffff" : "#f0d890",
        fontFamily:"Share Tech Mono,monospace", fontSize:14, letterSpacing:"0.32em",
        fontWeight: "700",
        cursor:"pointer", transition:"all 0.18s",
        boxShadow: h
          ? "0 0 18px rgba(232,184,92,0.35), inset 0 0 12px rgba(232,184,92,0.12)"
          : "0 0 8px rgba(200,146,10,0.15)",
        textShadow: "0 0 8px rgba(232,184,92,0.6)",
        position:"relative", zIndex:1,
      }}>+ COMPOSE</button>
      <div style={{
        position:"absolute", top:0, left:0, width:"40%", height:"100%", zIndex:2, pointerEvents:"none",
        background:"linear-gradient(90deg, transparent, rgba(240,216,144,0.32), rgba(255,255,255,0.45), rgba(240,216,144,0.18), transparent)",
        animation:"shimmerSlide 3.2s ease-in-out infinite",
      }}/>
    </div>
  );
}

// ─── Email List ───────────────────────────────────────────────────────────────
function EmailList({ emails, activeFolder, selectedId, onSelect, searchQuery }) {
  const filtered = emails.filter(e => {
    if (activeFolder === "starred") return e.starred;
    if (activeFolder !== "inbox") return e.folder === activeFolder;
    return e.folder === "inbox";
  }).filter(e => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return e.subject.toLowerCase().includes(q) || e.fromName.toLowerCase().includes(q) || e.preview.toLowerCase().includes(q);
  });

  return (
    <div style={{
      width: 360, flexShrink:0,
      background:"rgba(2,6,18,0.28)",
      backdropFilter:"blur(4px)", WebkitBackdropFilter:"blur(4px)",
      borderRight:"1px solid rgba(200,195,185,0.12)",
      display:"flex", flexDirection:"column",
      overflow:"hidden",
      position:"relative",
      zIndex:10,
    }}>
      <div style={{ padding:"14px 16px 12px" }}>
        <div style={{ fontFamily:"Share Tech Mono,monospace", fontSize:22, color:"rgba(210,210,210,0.9)", letterSpacing:"0.22em", marginBottom:10, fontWeight:"600" }}>
          {filtered.length} MESSAGE{filtered.length!==1?"S":""}
        </div>
        <SearchBar value={searchQuery}/>
      </div>
      <div className="sg-email-list-scroll" style={{ flex:1, minHeight:0, height:0, overflowY:"scroll", overflowX:"hidden", padding:"4px 12px 14px" }}>
        {filtered.length === 0
          ? <EmptyState message="No messages found"/>
          : filtered.map(email => (
            <div key={email.id} style={{ marginBottom:8 }}>
              <EmailListItem email={email} selected={selectedId===email.id} onClick={()=>onSelect(email.id)}/>
            </div>
          ))
        }
      </div>
    </div>
  );
}

function SearchBar({ value }) {
  // TODO: Wire up to real search state in App
  return (
    <div style={{ position:"relative" }}>
      <input defaultValue={value} placeholder="Search messages..." style={{
        width:"100%", padding:"6px 10px 6px 28px",
        background:"rgba(200,195,185,0.05)",
        border:"1px solid rgba(200,195,185,0.13)",
        color:"rgba(210,210,210,0.75)",
        fontFamily:"Share Tech Mono,monospace", fontSize:11,
        letterSpacing:"0.1em", outline:"none",
      }}/>
      <span style={{ position:"absolute", left:8, top:"50%", transform:"translateY(-50%)", fontSize:10, color:"rgba(200,195,185,0.25)" }}>⌕</span>
    </div>
  );
}

// Color palette for email labels — keyed by lowercased label name
const LABEL_COLORS = {
  important: { bg: "rgba(232,160,80,0.12)",  border: "rgba(232,160,80,0.45)",  fg: "#e8a050" },
  urgent:    { bg: "rgba(220,90,90,0.14)",   border: "rgba(220,90,90,0.5)",    fg: "#dc6868" },
  suspicious:{ bg: "rgba(220,90,90,0.14)",   border: "rgba(220,90,90,0.5)",    fg: "#dc6868" },
  personal:  { bg: "rgba(120,180,200,0.12)", border: "rgba(120,180,200,0.45)", fg: "#86c0d4" },
  "lab work":{ bg: "rgba(200,146,10,0.14)",  border: "rgba(200,146,10,0.5)",   fg: "#e0b85a" },
  "ai reply":{ bg: "rgba(120,160,220,0.12)", border: "rgba(120,160,220,0.45)", fg: "#8aaee0" },
  "from 2036":{bg:"rgba(180,134,220,0.14)",  border: "rgba(180,134,220,0.5)",  fg: "#b486dc" },
};
function labelStyle(label) {
  const k = (label || "").toLowerCase();
  return LABEL_COLORS[k] || { bg: "rgba(200,195,185,0.08)", border: "rgba(200,195,185,0.3)", fg: "rgba(220,215,200,0.7)" };
}

// ─── Minimalist email banner (all characters) ────────────────────────────────
const CHAR_META = {
  "nyan@future-gadget-lab.jp":            { name: "Faris NyanNyan",  accent: "#d878a8" },
  "makise.kurisu@viktor-kondria.org":     { name: "Makise Kurisu",   accent: "#e08868" },
  "barrel-titor@2ch.net":                 { name: "Daru",            accent: "#7a96da", font: '"Nunito", "Varela Round", sans-serif' },
  "mayushii@tutturu.jp":                  { name: "Shiina Mayuri",   accent: "#9ad8d2" },
  "m.kiryuu@r025.com":                    { name: "Kiryuu Moeka",    accent: "#b486dc" },
  "suzuha.amane@ibm5100.net":             { name: "Suzuha Amane",    accent: "#d8c46a" },
};

function MinimalistEmailBanner({ email, selected, onClick }) {
  const [hover, setHover] = useState(false);
  const timeStr = new Date(email.date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const { name, accent, font = '"IBM Plex Mono", monospace', fontSize: fs = {} } = CHAR_META[email.from] || { name: email.from, accent: "#888888" };

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => {
        if (window.sgSetActiveEmotion) window.sgSetActiveEmotion(email.from, email.aiEmotion || null);
        onClick();
      }}
      style={{
        position: "relative", padding: "10px 12px", borderRadius: 6,
        minHeight: 86, overflow: "hidden",
        background: selected
          ? "rgba(255,255,255,0.07)"
          : hover ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.02)",
        border: "1px solid " + (selected
          ? "rgba(255,255,255,0.14)"
          : hover ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)"),
        borderLeft: `2px solid ${selected || hover ? accent : accent + "55"}`,
        backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
        cursor: "pointer", transition: "all 0.15s ease",
      }}
    >
      {/* Avatar — colorful, no desaturation */}
      <div style={{
        position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
        width: 52, height: 52, borderRadius: "50%", overflow: "hidden", flexShrink: 0,
      }}>
        <CharacterAvatar noThinking email={email.from} size={52} />
      </div>

      <div style={{ paddingRight: 72 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
          <span style={{
            fontFamily: font, fontSize: fs.name || 12, fontWeight: 600,
            color: "#ffffff",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>{name}</span>
          <span style={{
            fontFamily: font, fontSize: 9,
            color: "#ffffff", marginLeft: "auto", flexShrink: 0,
          }}>{timeStr}</span>
        </div>
        <div style={{
          fontFamily: font, fontSize: fs.subject || 11,
          color: "#ffffff",
          marginBottom: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>{email.subject}</div>
        <div style={{
          fontFamily: font, fontSize: fs.preview || 10,
          color: "#ffffff", lineHeight: 1.4,
          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
        }}>{email.preview}</div>
      </div>

      {!email.read && !selected && (
        <span style={{
          position: "absolute", top: 8, right: 8,
          width: 10, height: 10, borderRadius: "50%", background: accent,
          boxShadow: `0 0 8px ${accent}, 0 0 16px ${accent}88`,
          animation: "pulse 1.6s ease-in-out infinite", zIndex: 5,
        }} />
      )}
    </div>
  );
}

// ─── Legacy banner stubs — replaced by MinimalistEmailBanner ─────────────────
// Accent colour + mood label per emotion
const FARIS_EMOTION_STYLE = {
  playful:   { accent: "#d878a8", label: "Nyaa~",        bg: "rgba(216,120,168," },
  happiness: { accent: "#e8a820", label: "Nyan ♡",       bg: "rgba(232,168,32,"  },
  anger:     { accent: "#cc4444", label: "Furious!",     bg: "rgba(204,68,68,"   },
  sadness:   { accent: "#5588cc", label: "Sad nyan...",  bg: "rgba(85,136,204,"  },
  confusion: { accent: "#9966cc", label: "Confused??",   bg: "rgba(153,102,204," },
  fear:      { accent: "#884488", label: "Scared...",    bg: "rgba(136,68,136,"  },
  mischief:  { accent: "#cc44aa", label: "Mischievous~", bg: "rgba(204,68,170,"  },
  surprise:  { accent: "#b8b890", label: "Surprised!",   bg: "rgba(184,184,144," },
};

function FarisEmailBanner({ email, selected, onClick }) {
  const [hover, setHover] = useState(false);
  const timeStr = new Date(email.date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const emotion = email.farisEmotion || email.aiEmotion || 'playful';
  const emo = FARIS_EMOTION_STYLE[emotion] || FARIS_EMOTION_STYLE.playful;
  const accent = emo.accent;

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => {
        if (window.sgSetActiveEmotion) window.sgSetActiveEmotion(email.from, emotion);
        onClick();
      }}
      style={{
        position: "relative", padding: "10px 12px", borderRadius: 6,
        minHeight: 86, overflow: "hidden",
        background: selected
          ? "rgba(255,255,255,0.07)"
          : hover ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.02)",
        border: "1px solid " + (selected
          ? "rgba(255,255,255,0.14)"
          : hover ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)"),
        borderLeft: `2px solid ${selected || hover ? accent : accent + "55"}`,
        backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
        cursor: "pointer", transition: "all 0.15s ease",
      }}
    >
      {/* Avatar — right side, same as other banners */}
      <div style={{
        position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
        width: 52, height: 52, borderRadius: "50%", overflow: "hidden", flexShrink: 0,
      }}>
        <CharacterAvatar noThinking email={email.from} size={52} />
      </div>


      <div style={{ paddingRight: 72 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
          <span style={{
            fontFamily: '"IBM Plex Mono", monospace', fontSize: 12, fontWeight: 600,
            color: "#ffffff",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>Faris NyanNyan</span>
          <span style={{
            fontFamily: '"IBM Plex Mono", monospace', fontSize: 9,
            color: "#ffffff", marginLeft: "auto", flexShrink: 0,
          }}>{timeStr}</span>
        </div>
        <div style={{
          fontFamily: '"IBM Plex Mono", monospace', fontSize: 11,
          color: "#ffffff",
          marginBottom: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>{email.subject}</div>
        <div style={{
          fontFamily: '"IBM Plex Mono", monospace', fontSize: 10,
          color: "#ffffff", lineHeight: 1.4,
          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
        }}>{email.preview}</div>
      </div>

      {/* Unread dot */}
      {!email.read&&!selected&&(
        <span style={{position:"absolute",top:8,right:8,width:10,height:10,borderRadius:"50%",background:accent,boxShadow:`0 0 8px ${accent},0 0 16px ${accent}88`,animation:"pulse 1.6s ease-in-out infinite",zIndex:5}}/>
      )}
    </div>
  );
}

// ─── Kurisu banner — Viktor Kondria lab aesthetic, cold science amber ────────
function KurisuEmailBanner({ email, selected, onClick }) {
  const [hover, setHover] = useState(false);
  const [clicking, setClicking] = useState(false);
  const timeStr = new Date(email.date).toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" });
  const accent = "#e08868"; const soft = "#f8c8a0"; const deep = "#7a2810";
  return (
    <div onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)}
      onClick={()=>{ setClicking(true); setTimeout(()=>setClicking(false),400); if(window.sgSetActiveEmotion) window.sgSetActiveEmotion(email.from, email.aiEmotion||null); onClick(); }}
      style={{
        position:"relative", padding:"12px 14px", borderRadius:8, minHeight:112, overflow:"hidden",
        border:`1px solid ${selected?`${accent}cc`:hover?`${accent}66`:`${accent}22`}`,
        borderLeft:`3px solid ${selected?accent:`${accent}bb`}`,
        background: selected
          ? `linear-gradient(115deg,rgba(240,140,80,0.22) 0%,rgba(180,60,20,0.18) 40%,rgba(20,6,4,0.7) 100%)`
          : hover
          ? `linear-gradient(115deg,rgba(240,140,80,0.14) 0%,rgba(160,50,15,0.10) 40%,rgba(12,4,2,0.55) 100%)`
          : `linear-gradient(115deg,rgba(240,140,80,0.07) 0%,rgba(140,40,10,0.05) 40%,rgba(6,2,2,0.45) 100%)`,
        backdropFilter:"blur(8px)", WebkitBackdropFilter:"blur(8px)",
        boxShadow: selected?`0 0 24px rgba(224,136,104,0.38),inset 0 0 18px rgba(240,180,130,0.10)`:hover?`0 6px 18px rgba(0,0,0,0.35),0 0 12px rgba(224,136,104,0.18)`:`0 1px 5px rgba(0,0,0,0.2)`,
        cursor:"pointer", transition:"all 0.18s ease",
        animation: clicking?"glitchFlash 0.35s ease forwards":"none",
        filter:"grayscale(1)",
      }}>

      {/* Brain wave SVG line — neuroscience motif */}
      <svg viewBox="0 0 160 22" width="140" height="16" style={{position:"absolute",top:4,right:10,opacity:hover||selected?0.45:0.22,transition:"opacity 0.2s",pointerEvents:"none"}}>
        <polyline points="0,11 12,11 18,4 24,18 30,11 36,11 40,6 44,16 48,11 60,11 66,3 72,19 78,11 90,11 94,7 98,15 102,11 120,11 126,5 132,17 138,11 160,11" fill="none" stroke={accent} strokeWidth="1.4"/>
      </svg>

      {/* ⚗ ASSISTANT badge */}
      <div style={{position:"absolute",top:8,right:8,fontFamily:'"IBM Plex Mono",monospace',fontSize:8,fontWeight:700,letterSpacing:"0.14em",color:"#ffe0cc",background:`linear-gradient(180deg,${accent}cc 0%,${deep}cc 100%)`,border:`1px solid ${soft}99`,padding:"2px 7px",borderRadius:3,boxShadow:`0 0 7px ${accent}66`,zIndex:3}}>⚗ ASSISTANT</div>

      {/* Viktor Kondria watermark */}
      <div style={{position:"absolute",bottom:6,right:12,fontFamily:'"IBM Plex Mono",monospace',fontSize:7,color:`${accent}33`,letterSpacing:"0.22em",pointerEvents:"none"}}>VIKTOR KONDRIA</div>

      {/* Floating lab symbols */}
      <span style={{position:"absolute",top:36,right:88,fontSize:15,opacity:0.28,transform:"rotate(-12deg)",pointerEvents:"none"}}>⚗</span>
      <span style={{position:"absolute",bottom:18,right:100,fontSize:11,opacity:0.22,transform:"rotate(8deg)",pointerEvents:"none"}}>🧬</span>
      <span style={{position:"absolute",top:14,right:76,fontSize:9,color:"#ffe0cc",opacity:0.35,pointerEvents:"none"}}>◈</span>

      {/* Avatar right */}
      <div style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",width:62,height:62,borderRadius:"50%",background:`radial-gradient(circle at 35% 30%,rgba(240,180,130,0.38) 0%,rgba(224,136,104,0.15) 55%,transparent 100%)`,padding:4,boxShadow:`0 0 20px rgba(224,136,104,0.30),inset 0 0 10px rgba(240,180,130,0.18)`,display:"flex",alignItems:"center",justifyContent:"center",zIndex:2}}>
        <div style={{width:54,height:54,borderRadius:"50%",border:`2px solid ${soft}99`,overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(14,5,2,0.55)",boxShadow:`inset 0 0 6px ${accent}55`}}>
          <CharacterAvatar noThinking email={email.from} size={48}/>
        </div>
      </div>

      <div style={{paddingRight:76,paddingTop:4,position:"relative",zIndex:1}}>
        <div style={{display:"flex",alignItems:"baseline",gap:8,marginBottom:4}}>
          <span style={{fontFamily:'"IBM Plex Mono",monospace',fontSize:14,fontWeight:700,color:selected?"#ffe0cc":!email.read?"#ffd0b0":"rgba(220,170,140,0.62)",letterSpacing:"0.02em",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",textShadow:selected||hover?`0 0 10px rgba(224,136,104,0.55)`:"none"}}>Makise Kurisu</span>
          <span style={{fontFamily:'"IBM Plex Mono",monospace',fontSize:10,color:"rgba(240,180,140,0.45)",marginLeft:"auto",flexShrink:0}}>{timeStr}</span>
        </div>
        <div style={{fontFamily:'"IBM Plex Mono",monospace',fontSize:11,fontWeight:600,color:selected?"#fff0e8":!email.read?"rgba(255,220,190,0.94)":"rgba(210,180,160,0.55)",letterSpacing:"0.02em",marginBottom:4,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{email.subject}</div>
        <div style={{fontFamily:'"IBM Plex Mono",monospace',fontSize:11,color:"rgba(240,200,170,0.58)",lineHeight:1.4,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{email.preview}</div>
        {email.labels?.length>0&&<div style={{display:"flex",gap:4,marginTop:6,flexWrap:"wrap"}}>{email.labels.map(l=><span key={l} style={{fontFamily:'"IBM Plex Mono",monospace',fontSize:8,fontWeight:700,letterSpacing:"0.14em",color:"#ffd0a8",background:"rgba(224,136,104,0.18)",border:`1px solid ${accent}77`,padding:"1px 7px",borderRadius:3}}>⚗ {l}</span>)}</div>}
      </div>
      {!email.read&&!selected&&<span style={{position:"absolute",top:8,right:8,width:10,height:10,borderRadius:"50%",background:accent,boxShadow:`0 0 8px ${accent},0 0 16px ${accent}88`,animation:"pulse 1.6s ease-in-out infinite",zIndex:5}}/>}
      <div style={{position:"absolute",bottom:0,right:0,width:0,height:0,borderLeft:"18px solid transparent",borderBottom:`18px solid ${accent}44`,pointerEvents:"none"}}/>
    </div>
  );
}

// ─── Daru banner — hacker aesthetic, matrix blue, binary rain ─────────────
function DaruEmailBanner({ email, selected, onClick }) {
  const [hover, setHover] = useState(false);
  const [clicking, setClicking] = useState(false);
  const timeStr = new Date(email.date).toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" });
  const accent = "#7a96da"; const soft = "#b0c8f8"; const deep = "#1a2860";
  return (
    <div onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)}
      onClick={()=>{ setClicking(true); setTimeout(()=>setClicking(false),400); if(window.sgSetActiveEmotion) window.sgSetActiveEmotion(email.from, email.aiEmotion||null); onClick(); }}
      style={{
        position:"relative", padding:"12px 14px", borderRadius:8, minHeight:112, overflow:"hidden",
        border:`1px solid ${selected?`${accent}cc`:hover?`${accent}66`:`${accent}22`}`,
        borderLeft:`3px solid ${selected?accent:`${accent}bb`}`,
        background: selected
          ? `linear-gradient(115deg,rgba(100,140,220,0.22) 0%,rgba(30,50,140,0.20) 40%,rgba(4,6,20,0.72) 100%)`
          : hover
          ? `linear-gradient(115deg,rgba(100,140,220,0.14) 0%,rgba(20,40,120,0.12) 40%,rgba(2,4,14,0.58) 100%)`
          : `linear-gradient(115deg,rgba(100,140,220,0.07) 0%,rgba(15,30,90,0.05) 40%,rgba(2,3,10,0.46) 100%)`,
        backdropFilter:"blur(8px)", WebkitBackdropFilter:"blur(8px)",
        boxShadow: selected?`0 0 24px rgba(122,150,218,0.38),inset 0 0 18px rgba(160,190,250,0.08)`:hover?`0 6px 18px rgba(0,0,0,0.35),0 0 12px rgba(122,150,218,0.18)`:`0 1px 5px rgba(0,0,0,0.2)`,
        cursor:"pointer", transition:"all 0.18s ease",
        animation: clicking?"glitchFlash 0.35s ease forwards":"none",
        filter:"grayscale(1)",
      }}>

      {/* Binary digits floating */}
      {["01","10","11","00","1","0"].map((b,i)=>(
        <span key={i} style={{position:"absolute",fontFamily:'"IBM Plex Mono",monospace',fontSize:9+i%3,color:`${accent}`,opacity:hover||selected?0.28:0.14,pointerEvents:"none",top:`${15+i*12}%`,right:`${62+i*8}px`,letterSpacing:"0.1em",animation:`pulse ${1.4+i*0.3}s ease-in-out ${i*0.2}s infinite`}}>{b}</span>
      ))}

      {/* ⌨ HACKER badge */}
      <div style={{position:"absolute",top:8,right:8,fontFamily:'"IBM Plex Mono",monospace',fontSize:8,fontWeight:700,letterSpacing:"0.14em",color:"#d0e0ff",background:`linear-gradient(180deg,${accent}cc 0%,${deep}cc 100%)`,border:`1px solid ${soft}99`,padding:"2px 7px",borderRadius:3,boxShadow:`0 0 7px ${accent}66`,zIndex:3}}>⌨ HACKER</div>

      {/* 2ch watermark */}
      <div style={{position:"absolute",bottom:6,right:12,fontFamily:'"IBM Plex Mono",monospace',fontSize:7,color:`${accent}30`,letterSpacing:"0.22em",pointerEvents:"none"}}>barrel-titor@2ch</div>

      <span style={{position:"absolute",top:32,right:90,fontSize:16,opacity:0.25,transform:"rotate(-8deg)",pointerEvents:"none"}}>💾</span>
      <span style={{position:"absolute",bottom:20,right:102,fontSize:11,opacity:0.20,pointerEvents:"none"}}>⌨</span>

      {/* Avatar right */}
      <div style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",width:62,height:62,borderRadius:"50%",background:`radial-gradient(circle at 35% 30%,rgba(160,190,250,0.30) 0%,rgba(122,150,218,0.14) 55%,transparent 100%)`,padding:4,boxShadow:`0 0 20px rgba(122,150,218,0.28),inset 0 0 10px rgba(160,190,250,0.14)`,display:"flex",alignItems:"center",justifyContent:"center",zIndex:2}}>
        <div style={{width:54,height:54,borderRadius:"50%",border:`2px solid ${soft}99`,overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(2,4,16,0.6)",boxShadow:`inset 0 0 6px ${accent}55`}}>
          <CharacterAvatar noThinking email={email.from} size={48}/>
        </div>
      </div>

      <div style={{paddingRight:76,paddingTop:4,position:"relative",zIndex:1}}>
        <div style={{display:"flex",alignItems:"baseline",gap:8,marginBottom:4}}>
          <span style={{fontFamily:'"IBM Plex Mono",monospace',fontSize:14,fontWeight:700,color:selected?"#d8e8ff":!email.read?"#c8d8f8":"rgba(180,200,240,0.60)",letterSpacing:"0.02em",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",textShadow:selected||hover?`0 0 10px rgba(122,150,218,0.6)`:"none"}}>Daru (Supah Hacker)</span>
          <span style={{fontFamily:'"IBM Plex Mono",monospace',fontSize:10,color:"rgba(160,190,240,0.42)",marginLeft:"auto",flexShrink:0}}>{timeStr}</span>
        </div>
        <div style={{fontFamily:'"IBM Plex Mono",monospace',fontSize:11,fontWeight:600,color:selected?"#e8f0ff":!email.read?"rgba(210,225,255,0.92)":"rgba(180,200,240,0.52)",letterSpacing:"0.02em",marginBottom:4,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{email.subject}</div>
        <div style={{fontFamily:'"IBM Plex Mono",monospace',fontSize:11,color:"rgba(180,210,255,0.55)",lineHeight:1.4,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{email.preview}</div>
        {email.labels?.length>0&&<div style={{display:"flex",gap:4,marginTop:6,flexWrap:"wrap"}}>{email.labels.map(l=><span key={l} style={{fontFamily:'"IBM Plex Mono",monospace',fontSize:8,fontWeight:700,letterSpacing:"0.14em",color:"#b8d0ff",background:"rgba(122,150,218,0.18)",border:`1px solid ${accent}77`,padding:"1px 7px",borderRadius:3}}>⌨ {l}</span>)}</div>}
      </div>
      {!email.read&&!selected&&<span style={{position:"absolute",top:8,right:8,width:10,height:10,borderRadius:"50%",background:accent,boxShadow:`0 0 8px ${accent},0 0 16px ${accent}88`,animation:"pulse 1.6s ease-in-out infinite",zIndex:5}}/>}
      <div style={{position:"absolute",bottom:0,right:0,width:0,height:0,borderLeft:"18px solid transparent",borderBottom:`18px solid ${accent}44`,pointerEvents:"none"}}/>
    </div>
  );
}

// ─── Mayuri banner — soft teal, stars, tutturu sweetness ─────────────────
function MayuriEmailBanner({ email, selected, onClick }) {
  const [hover, setHover] = useState(false);
  const [clicking, setClicking] = useState(false);
  const timeStr = new Date(email.date).toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" });
  const accent = "#9ad8d2"; const soft = "#c8f0ec"; const deep = "#1a6060";
  return (
    <div onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)}
      onClick={()=>{ setClicking(true); setTimeout(()=>setClicking(false),400); if(window.sgSetActiveEmotion) window.sgSetActiveEmotion(email.from, email.aiEmotion||null); onClick(); }}
      style={{
        position:"relative", padding:"12px 14px", borderRadius:8, minHeight:112, overflow:"hidden",
        border:`1px solid ${selected?`${accent}cc`:hover?`${accent}66`:`${accent}22`}`,
        borderLeft:`3px solid ${selected?accent:`${accent}bb`}`,
        background: selected
          ? `linear-gradient(115deg,rgba(154,216,210,0.24) 0%,rgba(40,140,130,0.18) 40%,rgba(2,12,12,0.68) 100%)`
          : hover
          ? `linear-gradient(115deg,rgba(154,216,210,0.15) 0%,rgba(30,120,110,0.10) 40%,rgba(2,8,8,0.52) 100%)`
          : `linear-gradient(115deg,rgba(154,216,210,0.07) 0%,rgba(20,90,85,0.04) 40%,rgba(2,6,6,0.44) 100%)`,
        backdropFilter:"blur(8px)", WebkitBackdropFilter:"blur(8px)",
        boxShadow: selected?`0 0 24px rgba(154,216,210,0.35),inset 0 0 18px rgba(200,240,236,0.10)`:hover?`0 6px 18px rgba(0,0,0,0.32),0 0 12px rgba(154,216,210,0.18)`:`0 1px 5px rgba(0,0,0,0.2)`,
        cursor:"pointer", transition:"all 0.18s ease",
        animation: clicking?"glitchFlash 0.35s ease forwards":"none",
        filter:"grayscale(1)",
      }}>

      {/* Stars scattered */}
      {["☆","★","✦","☆","✧"].map((s,i)=>(
        <span key={i} style={{position:"absolute",fontSize:10+i%3,color:soft,opacity:hover||selected?0.55:0.28,pointerEvents:"none",top:`${10+i*16}%`,right:`${60+i*9}px`,animation:`pulse ${1.6+i*0.25}s ease-in-out ${i*0.15}s infinite`}}>{s}</span>
      ))}

      {/* ☆ TUTTURU~ badge */}
      <div style={{position:"absolute",top:8,right:8,fontFamily:'"Nunito","Varela Round",sans-serif',fontSize:9,fontWeight:800,letterSpacing:"0.12em",color:"#e0fff8",background:`linear-gradient(180deg,${accent}cc 0%,${deep}cc 100%)`,border:`1px solid ${soft}99`,padding:"2px 8px",borderRadius:12,boxShadow:`0 0 8px ${accent}66`,zIndex:3}}>☆ TUTTURU~</div>

      {/* tutturu.jp watermark */}
      <div style={{position:"absolute",bottom:6,right:12,fontFamily:'"Nunito",sans-serif',fontSize:7,color:`${accent}30`,letterSpacing:"0.18em",pointerEvents:"none"}}>mayushii@tutturu.jp</div>

      <span style={{position:"absolute",top:34,right:88,fontSize:15,opacity:0.28,pointerEvents:"none"}}>🧵</span>
      <span style={{position:"absolute",bottom:18,right:100,fontSize:12,opacity:0.22,transform:"rotate(10deg)",pointerEvents:"none"}}>✂</span>

      {/* Avatar right */}
      <div style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",width:62,height:62,borderRadius:"50%",background:`radial-gradient(circle at 35% 30%,rgba(200,240,236,0.38) 0%,rgba(154,216,210,0.15) 55%,transparent 100%)`,padding:4,boxShadow:`0 0 20px rgba(154,216,210,0.30),inset 0 0 10px rgba(200,240,236,0.18)`,display:"flex",alignItems:"center",justifyContent:"center",zIndex:2}}>
        <div style={{width:54,height:54,borderRadius:"50%",border:`2px solid ${soft}99`,overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(2,12,10,0.55)",boxShadow:`inset 0 0 6px ${accent}55`}}>
          <CharacterAvatar noThinking email={email.from} size={48}/>
        </div>
      </div>

      <div style={{paddingRight:76,paddingTop:4,position:"relative",zIndex:1}}>
        <div style={{display:"flex",alignItems:"baseline",gap:8,marginBottom:4}}>
          <span style={{fontFamily:'"Nunito","Varela Round",sans-serif',fontSize:15,fontWeight:800,color:selected?"#e0fff8":!email.read?"#d0f8f2":"rgba(180,230,224,0.62)",letterSpacing:"0.01em",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",textShadow:selected||hover?`0 0 10px rgba(154,216,210,0.55)`:"none"}}>Shiina Mayuri</span>
          <span style={{fontFamily:'"Nunito",sans-serif',fontSize:10,fontWeight:600,color:"rgba(180,230,224,0.46)",marginLeft:"auto",flexShrink:0}}>{timeStr}</span>
        </div>
        <div style={{fontFamily:'"Nunito",sans-serif',fontSize:12,fontWeight:700,color:selected?"#f0fff8":!email.read?"rgba(210,248,244,0.94)":"rgba(180,220,216,0.52)",letterSpacing:"0.01em",marginBottom:4,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{email.subject}</div>
        <div style={{fontFamily:'"Nunito",sans-serif',fontSize:11,fontWeight:500,color:"rgba(180,230,220,0.58)",lineHeight:1.4,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{email.preview}</div>
        {email.labels?.length>0&&<div style={{display:"flex",gap:4,marginTop:6,flexWrap:"wrap"}}>{email.labels.map(l=><span key={l} style={{fontFamily:'"Nunito",sans-serif',fontSize:9,fontWeight:700,letterSpacing:"0.10em",color:"#c8f0e8",background:"rgba(154,216,210,0.18)",border:`1px solid ${accent}77`,padding:"1px 7px",borderRadius:10}}>☆ {l}</span>)}</div>}
      </div>
      {!email.read&&!selected&&<span style={{position:"absolute",top:8,right:8,width:10,height:10,borderRadius:"50%",background:accent,boxShadow:`0 0 8px ${accent},0 0 16px ${accent}88`,animation:"pulse 1.6s ease-in-out infinite",zIndex:5}}/>}
      <div style={{position:"absolute",bottom:0,right:0,width:0,height:0,borderLeft:"18px solid transparent",borderBottom:`18px solid ${accent}44`,pointerEvents:"none"}}/>
    </div>
  );
}

// ─── Moeka banner — encrypted purple, FB, static noise, cold silence ────────
function MoekaEmailBanner({ email, selected, onClick }) {
  const [hover, setHover] = useState(false);
  const [clicking, setClicking] = useState(false);
  const timeStr = new Date(email.date).toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" });
  const accent = "#b486dc"; const soft = "#d8b8f8"; const deep = "#3a1060";
  return (
    <div onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)}
      onClick={()=>{ setClicking(true); setTimeout(()=>setClicking(false),400); if(window.sgSetActiveEmotion) window.sgSetActiveEmotion(email.from, email.aiEmotion||null); onClick(); }}
      style={{
        position:"relative", padding:"12px 14px", borderRadius:8, minHeight:112, overflow:"hidden",
        border:`1px solid ${selected?`${accent}cc`:hover?`${accent}55`:`${accent}1a`}`,
        borderLeft:`3px solid ${selected?accent:`${accent}99`}`,
        background: selected
          ? `linear-gradient(115deg,rgba(180,134,220,0.20) 0%,rgba(80,20,140,0.18) 40%,rgba(6,2,14,0.78) 100%)`
          : hover
          ? `linear-gradient(115deg,rgba(180,134,220,0.12) 0%,rgba(60,10,110,0.10) 40%,rgba(4,1,10,0.62) 100%)`
          : `linear-gradient(115deg,rgba(180,134,220,0.05) 0%,rgba(40,6,80,0.04) 40%,rgba(3,1,8,0.50) 100%)`,
        backdropFilter:"blur(8px)", WebkitBackdropFilter:"blur(8px)",
        boxShadow: selected?`0 0 24px rgba(180,134,220,0.35),inset 0 0 18px rgba(220,180,255,0.08)`:hover?`0 6px 18px rgba(0,0,0,0.38),0 0 10px rgba(180,134,220,0.15)`:`0 1px 5px rgba(0,0,0,0.25)`,
        cursor:"pointer", transition:"all 0.18s ease",
        animation: clicking?"glitchFlash 0.35s ease forwards":"none",
        filter:"grayscale(1)",
      }}>
      {/* No shimmer — Moeka wouldn't have that */}

      {/* Static noise dots */}
      {Array.from({length:12},(_,i)=>(
        <span key={i} style={{position:"absolute",width:2,height:2,borderRadius:"50%",background:accent,opacity:hover||selected?0.25:0.10,pointerEvents:"none",top:`${8+i*7}%`,right:`${58+((i*37)%55)}px`,animation:`pulse ${0.8+i*0.15}s steps(2) ${i*0.07}s infinite`}}/>
      ))}

      {/* Ellipsis dots — Moeka communicates in fragments */}
      <div style={{position:"absolute",top:10,right:68,fontFamily:'"Share Tech Mono",monospace',fontSize:18,color:accent,opacity:hover||selected?0.55:0.25,letterSpacing:"0.3em",pointerEvents:"none",lineHeight:1}}>...</div>

      {/* FB. badge */}
      <div style={{position:"absolute",top:8,right:8,fontFamily:'"Share Tech Mono",monospace',fontSize:9,fontWeight:700,letterSpacing:"0.20em",color:"#f0d8ff",background:`linear-gradient(180deg,${accent}cc 0%,${deep}cc 100%)`,border:`1px solid ${soft}88`,padding:"2px 8px",borderRadius:3,boxShadow:`0 0 8px ${accent}55`,zIndex:3}}>FB.</div>

      {/* r025 watermark */}
      <div style={{position:"absolute",bottom:6,right:12,fontFamily:'"Share Tech Mono",monospace',fontSize:7,color:`${accent}28`,letterSpacing:"0.22em",pointerEvents:"none"}}>m.kiryuu@r025.com</div>

      <span style={{position:"absolute",top:36,right:90,fontSize:14,opacity:0.22,transform:"rotate(-5deg)",pointerEvents:"none"}}>📱</span>

      {/* Avatar right */}
      <div style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",width:62,height:62,borderRadius:4,background:`radial-gradient(circle at 35% 30%,rgba(220,180,255,0.22) 0%,rgba(180,134,220,0.10) 55%,transparent 100%)`,padding:4,boxShadow:`0 0 20px rgba(180,134,220,0.25),inset 0 0 10px rgba(220,180,255,0.10)`,display:"flex",alignItems:"center",justifyContent:"center",zIndex:2}}>
        <div style={{width:54,height:54,borderRadius:4,border:`1px solid ${soft}66`,overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(6,2,12,0.65)",boxShadow:`inset 0 0 6px ${accent}44`}}>
          <CharacterAvatar noThinking email={email.from} size={48}/>
        </div>
      </div>

      <div style={{paddingRight:76,paddingTop:4,position:"relative",zIndex:1}}>
        <div style={{display:"flex",alignItems:"baseline",gap:8,marginBottom:4}}>
          <span style={{fontFamily:'"Share Tech Mono",monospace',fontSize:13,fontWeight:700,color:selected?"#e8d0ff":!email.read?"#dcc0f8":"rgba(200,170,230,0.55)",letterSpacing:"0.05em",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",textShadow:selected||hover?`0 0 10px rgba(180,134,220,0.5)`:"none"}}>Kiryuu Moeka</span>
          <span style={{fontFamily:'"Share Tech Mono",monospace',fontSize:10,color:"rgba(200,170,230,0.38)",marginLeft:"auto",flexShrink:0}}>{timeStr}</span>
        </div>
        <div style={{fontFamily:'"Share Tech Mono",monospace',fontSize:11,fontWeight:400,color:selected?"#f0e0ff":!email.read?"rgba(220,195,245,0.90)":"rgba(195,170,225,0.50)",letterSpacing:"0.04em",marginBottom:4,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{email.subject}</div>
        <div style={{fontFamily:'"Share Tech Mono",monospace',fontSize:11,color:"rgba(210,180,240,0.50)",lineHeight:1.5,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{email.preview}</div>
        {email.labels?.length>0&&<div style={{display:"flex",gap:4,marginTop:6,flexWrap:"wrap"}}>{email.labels.map(l=><span key={l} style={{fontFamily:'"Share Tech Mono",monospace',fontSize:8,fontWeight:700,letterSpacing:"0.15em",color:"#dcc0ff",background:"rgba(180,134,220,0.16)",border:`1px solid ${accent}66`,padding:"1px 7px",borderRadius:3}}>{l}</span>)}</div>}
      </div>
      {!email.read&&!selected&&<span style={{position:"absolute",top:8,right:8,width:10,height:10,borderRadius:"50%",background:accent,boxShadow:`0 0 8px ${accent},0 0 16px ${accent}88`,animation:"pulse 1.6s ease-in-out infinite",zIndex:5}}/>}
      <div style={{position:"absolute",bottom:0,right:0,width:0,height:0,borderLeft:"18px solid transparent",borderBottom:`18px solid ${accent}33`,pointerEvents:"none"}}/>
    </div>
  );
}

// ─── Suzuha banner — future gold, 2036 resistance, urgent warning ────────────
function SuzuhaEmailBanner({ email, selected, onClick }) {
  const [hover, setHover] = useState(false);
  const [clicking, setClicking] = useState(false);
  const timeStr = new Date(email.date).toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" });
  const accent = "#d8c46a"; const soft = "#f0e090"; const deep = "#4a3a08";
  return (
    <div onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)}
      onClick={()=>{ setClicking(true); setTimeout(()=>setClicking(false),400); if(window.sgSetActiveEmotion) window.sgSetActiveEmotion(email.from, email.aiEmotion||null); onClick(); }}
      style={{
        position:"relative", padding:"12px 14px", borderRadius:8, minHeight:112, overflow:"hidden",
        border:`1px solid ${selected?`${accent}cc`:hover?`${accent}66`:`${accent}33`}`,
        borderLeft:`3px solid ${selected?accent:`${accent}bb`}`,
        background: selected
          ? `linear-gradient(115deg,rgba(216,196,106,0.20) 0%,rgba(100,80,8,0.18) 40%,rgba(8,6,2,0.75) 100%)`
          : hover
          ? `linear-gradient(115deg,rgba(216,196,106,0.13) 0%,rgba(80,60,4,0.11) 40%,rgba(6,4,2,0.58) 100%)`
          : `linear-gradient(115deg,rgba(216,196,106,0.06) 0%,rgba(60,45,2,0.04) 40%,rgba(5,4,2,0.48) 100%)`,
        backdropFilter:"blur(8px)", WebkitBackdropFilter:"blur(8px)",
        boxShadow: selected?`0 0 24px rgba(216,196,106,0.35),inset 0 0 18px rgba(240,224,144,0.10)`:hover?`0 6px 18px rgba(0,0,0,0.35),0 0 12px rgba(216,196,106,0.18)`:`0 1px 5px rgba(0,0,0,0.22)`,
        cursor:"pointer", transition:"all 0.18s ease",
        animation: clicking?"glitchFlash 0.35s ease forwards":"none",
        filter:"grayscale(1)",
      }}>

      {/* Scan lines — future tech motif */}
      {[0,1,2,3].map(i=>(
        <div key={i} style={{position:"absolute",left:0,right:0,height:1,top:`${22+i*20}%`,background:`${accent}`,opacity:hover||selected?0.08:0.04,pointerEvents:"none"}}/>
      ))}

      {/* Warning triangles */}
      <svg viewBox="0 0 80 20" width="70" height="16" style={{position:"absolute",top:5,right:14,opacity:hover||selected?0.50:0.26,pointerEvents:"none"}}>
        <polygon points="10,18 18,4 26,18" fill="none" stroke={accent} strokeWidth="1.2"/>
        <text x="17" y="15" fontFamily="monospace" fontSize="7" fill={accent} textAnchor="middle">!</text>
        <polygon points="44,18 52,4 60,18" fill="none" stroke={accent} strokeWidth="1.2"/>
        <text x="51" y="15" fontFamily="monospace" fontSize="7" fill={accent} textAnchor="middle">!</text>
      </svg>

      {/* 2036 badge */}
      <div style={{position:"absolute",top:8,right:8,fontFamily:'"Share Tech Mono",monospace',fontSize:9,fontWeight:700,letterSpacing:"0.18em",color:"#fff8cc",background:`linear-gradient(180deg,${accent}cc 0%,${deep}cc 100%)`,border:`1px solid ${soft}99`,padding:"2px 7px",borderRadius:3,boxShadow:`0 0 8px ${accent}66`,zIndex:3}}>⚠ 2036</div>

      {/* IBM 5100 watermark */}
      <div style={{position:"absolute",bottom:6,right:12,fontFamily:'"Share Tech Mono",monospace',fontSize:7,color:`${accent}30`,letterSpacing:"0.22em",pointerEvents:"none"}}>IBM 5100 · RESISTANCE</div>

      <span style={{position:"absolute",top:36,right:90,fontSize:14,opacity:0.25,transform:"rotate(5deg)",pointerEvents:"none"}}>⚙</span>
      <span style={{position:"absolute",bottom:20,right:104,fontSize:10,opacity:0.20,pointerEvents:"none"}}>🔧</span>

      {/* Avatar right */}
      <div style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",width:62,height:62,borderRadius:4,background:`radial-gradient(circle at 35% 30%,rgba(240,224,144,0.32) 0%,rgba(216,196,106,0.14) 55%,transparent 100%)`,padding:4,boxShadow:`0 0 20px rgba(216,196,106,0.28),inset 0 0 10px rgba(240,224,144,0.14)`,display:"flex",alignItems:"center",justifyContent:"center",zIndex:2}}>
        <div style={{width:54,height:54,borderRadius:4,border:`2px solid ${soft}88`,overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(8,6,2,0.60)",boxShadow:`inset 0 0 6px ${accent}44`}}>
          <CharacterAvatar noThinking email={email.from} size={48}/>
        </div>
      </div>

      <div style={{paddingRight:76,paddingTop:4,position:"relative",zIndex:1}}>
        <div style={{display:"flex",alignItems:"baseline",gap:8,marginBottom:4}}>
          <span style={{fontFamily:'"Share Tech Mono",monospace',fontSize:13,fontWeight:700,color:selected?"#fff0a0":!email.read?"#ffe880":"rgba(216,196,106,0.62)",letterSpacing:"0.05em",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",textShadow:selected||hover?`0 0 10px rgba(216,196,106,0.55)`:"none"}}>Suzuha Amane</span>
          <span style={{fontFamily:'"Share Tech Mono",monospace',fontSize:10,color:"rgba(216,196,106,0.40)",marginLeft:"auto",flexShrink:0}}>{timeStr}</span>
        </div>
        <div style={{fontFamily:'"Share Tech Mono",monospace',fontSize:11,fontWeight:400,color:selected?"#fffbd0":!email.read?"rgba(250,235,150,0.92)":"rgba(210,195,120,0.52)",letterSpacing:"0.04em",marginBottom:4,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{email.subject}</div>
        <div style={{fontFamily:'"Share Tech Mono",monospace',fontSize:11,color:"rgba(220,205,140,0.55)",lineHeight:1.4,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{email.preview}</div>
        {email.labels?.length>0&&<div style={{display:"flex",gap:4,marginTop:6,flexWrap:"wrap"}}>{email.labels.map(l=><span key={l} style={{fontFamily:'"Share Tech Mono",monospace',fontSize:8,fontWeight:700,letterSpacing:"0.14em",color:"#ffe880",background:"rgba(216,196,106,0.16)",border:`1px solid ${accent}66`,padding:"1px 7px",borderRadius:3}}>⚠ {l}</span>)}</div>}
      </div>
      {!email.read&&!selected&&<span style={{position:"absolute",top:8,right:8,width:10,height:10,borderRadius:"50%",background:accent,boxShadow:`0 0 8px ${accent},0 0 16px ${accent}88`,animation:"pulse 1.6s ease-in-out infinite",zIndex:5}}/>}
      <div style={{position:"absolute",bottom:0,right:0,width:0,height:0,borderLeft:"18px solid transparent",borderBottom:`18px solid ${accent}44`,pointerEvents:"none"}}/>
    </div>
  );
}

function EmailListItem({ email, selected, onClick }) {
  // Faris keeps her original colorful banner
  if (email.from === "nyan@future-gadget-lab.jp") return <FarisEmailBanner email={email} selected={selected} onClick={onClick}/>;
  // All others: minimalist banner with colorful avatar
  return <MinimalistEmailBanner email={email} selected={selected} onClick={onClick}/>;


  const [hover, setHover] = useState(false);
  const [clicking, setClicking] = useState(false);
  const date = new Date(email.date);
  const timeStr = date.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"});
  const theme = CHARACTER_THEMES[email.from] || null;
  const accent = theme?.accent || "rgba(200,195,185,0.45)";
  const glow   = theme?.glow   || "rgba(200,195,185,0.18)";
  const isDmail = email.labels?.some(l => ["D-MAIL","FROM 2036","INTERCEPTED"].includes((l||"").toUpperCase()));
  const isUrgent = email.labels?.some(l => ["URGENT","SUSPICIOUS","FB"].includes((l||"").toUpperCase()));

  const handleClick = () => {
    setClicking(true);
    setTimeout(() => setClicking(false), 400);
    onClick();
  };

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={handleClick}
      style={{
        padding: "10px 12px 10px 10px",
        borderRadius: 4,
        border: `1px solid ${selected ? `${accent}bb` : hover ? `${accent}44` : "rgba(200,195,185,0.10)"}`,
        borderLeft: selected
          ? `3px solid ${accent}`
          : !email.read ? `3px solid ${accent}cc`
          : hover ? `3px solid ${accent}55`
          : "3px solid transparent",
        background: selected
          ? `linear-gradient(135deg, ${theme?.bgTint || "rgba(40,28,10,0.4)"}, rgba(2,6,18,0.58))`
          : hover ? "rgba(2,6,18,0.48)" : "rgba(2,6,18,0.28)",
        backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
        boxShadow: selected
          ? `0 0 20px ${glow}, inset 0 0 12px ${glow}44`
          : hover ? `0 2px 12px rgba(0,0,0,0.28), 0 0 8px ${glow}18` : "0 1px 3px rgba(0,0,0,0.18)",
        cursor: "pointer",
        transition: "background 0.15s, border-color 0.15s, box-shadow 0.15s",
        animation: clicking ? "glitchFlash 0.35s ease forwards" : "none",
        position: "relative", overflow: "hidden",
      }}>

      )}

      {/* Character badge */}
      {theme?.badge && (
        <div style={{
          position: "absolute", top: 6, right: 7,
          fontFamily: "Share Tech Mono,monospace", fontSize: 8, letterSpacing: "0.16em",
          color: theme.badgeFg, background: theme.badgeBg,
          border: `1px solid ${accent}44`, padding: "1px 5px", borderRadius: 2,
          opacity: selected || hover || !email.read ? 0.9 : 0.38,
          transition: "opacity 0.15s",
        }}>{theme.badge}</div>
      )}

      {/* Unread dot */}
      {!email.read && !selected && (
        <span style={{
          position: "absolute", top: 8, right: 8,
          width: 10, height: 10, borderRadius: "50%",
          background: accent, boxShadow: `0 0 8px ${glow}, 0 0 16px ${glow}88`,
          animation: "pulse 1.6s ease-in-out infinite",
        }}/>
      )}

      <div style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
        <CharacterAvatar noThinking email={email.from} size={40}/>
        <div style={{ flex: 1, minWidth: 0, paddingRight: theme?.badge ? 42 : 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 3, gap: 4 }}>
            <span style={{
              fontFamily: "Share Tech Mono,monospace", fontSize: 12,
              color: selected ? accent : !email.read ? "rgba(235,230,220,0.95)" : "rgba(210,210,210,0.52)",
              fontWeight: !email.read ? "700" : "500", letterSpacing: "0.05em",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              textShadow: selected ? `0 0 8px ${glow}` : "none",
            }}>{email.fromName}</span>
            <span style={{
              fontFamily: "Share Tech Mono,monospace", fontSize: 9,
              color: "rgba(200,195,185,0.35)", flexShrink: 0,
            }}>{timeStr}</span>
          </div>
          <div style={{
            fontFamily: "Share Tech Mono,monospace", fontSize: 11,
            color: selected ? "rgba(240,216,144,0.92)" : !email.read ? "rgba(222,215,198,0.88)" : "rgba(210,210,210,0.45)",
            letterSpacing: "0.04em", marginBottom: 4,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            fontWeight: !email.read ? "600" : "400",
          }}>{email.subject}</div>
          <div style={{
            fontFamily: "Share Tech Mono,monospace", fontSize: 10,
            color: "rgba(210,210,210,0.36)", letterSpacing: "0.02em", lineHeight: 1.35,
            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
          }}>{email.preview}</div>
          {email.labels.length > 0 && (
            <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap", alignItems: "center" }}>
              {email.labels.map(l => {
                const ls = labelStyle(l);
                const isSpecial = ["URGENT","SUSPICIOUS","FB","INTERCEPTED","D-MAIL","FROM 2036"].includes((l||"").toUpperCase());
                return (
                  <span key={l} style={{
                    fontFamily: "Share Tech Mono,monospace",
                    fontSize: isSpecial ? 9 : 8, letterSpacing: "0.13em",
                    color: ls.fg, background: isSpecial ? ls.bg : "transparent",
                    border: `1px solid ${ls.border}`,
                    padding: isSpecial ? "2px 5px" : "1px 5px",
                    borderRadius: 2, textTransform: "uppercase",
                    boxShadow: isSpecial ? `0 0 5px ${ls.border}` : "none",
                    animation: isSpecial && !email.read ? "pulse 2.2s ease-in-out infinite" : "none",
                  }}>{l}</span>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Corner triangle for D-mail/high-alert senders */}
      {(isDmail || isUrgent) && (
        <div style={{
          position: "absolute", bottom: 0, right: 0,
          width: 0, height: 0,
          borderLeft: "16px solid transparent",
          borderBottom: `16px solid ${accent}55`,
        }}/>
      )}
    </div>
  );
}

function EmptyState({ message }) {
  return (
    <div style={{ padding:40, textAlign:"center", fontFamily:"Share Tech Mono,monospace", fontSize:12, color:"rgba(210,210,210,0.20)", letterSpacing:"0.15em" }}>
      {message}
    </div>
  );
}

// ─── Reader Slideshow (inside the reading pane) ───────────────────────────────
function ReaderSlideshow() {
  const [current, setCurrent] = useState(0);
  const [fading, setFading] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => {
      setFading(true);
      setTimeout(() => {
        setCurrent(c => (c + 1) % BG_IMAGES.length);
        setFading(false);
      }, CONFIG.SLIDESHOW_TRANSITION_MS);
    }, CONFIG.SLIDESHOW_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);
  return (
    <div style={{ position:"absolute", inset:0, zIndex:0, overflow:"hidden" }}>
      {BG_IMAGES.map((src, i) => (
        <div key={src} style={{
          position:"absolute", inset:0,
          backgroundImage:`url(${src})`,
          backgroundSize:"cover",
          backgroundPosition:"center top",
          opacity: i === current ? (fading ? 0 : 0.55) : 0,
          transition:`opacity ${CONFIG.SLIDESHOW_TRANSITION_MS}ms ease`,
          filter:"saturate(0.8) brightness(0.78)",
        }}/>
      ))}
      {/* Vignette so edges fade into dark */}
      <div style={{
        position:"absolute", inset:0,
        background:"radial-gradient(ellipse 90% 90% at 50% 40%, transparent 40%, rgba(3,8,22,0.45) 100%)",
      }}/>
      {/* Top fade so header stays readable */}
      <div style={{ position:"absolute", inset:"0 0 auto 0", height:100, background:"linear-gradient(to bottom, rgba(3,8,22,0.55), transparent)" }}/>
      {/* Bottom fade */}
      <div style={{ position:"absolute", inset:"auto 0 0 0", height:80, background:"linear-gradient(to top, rgba(3,8,22,0.55), transparent)" }}/>
    </div>
  );
}

// ─── Per-character handwriting / typing fonts ────────────────────────────────
// Each AI character writes in their own visual voice. Font + weight + size
// nudge are tuned to feel like that person's handwriting / typing style.
const CHARACTER_FONTS = {
  "makise.kurisu@viktor-kondria.org": {
    family: '"IBM Plex Mono", "Share Tech Mono", monospace',
    weight: 500, sizeMul: 1.0, letterSpacing: '0.01em', // precise, scientific
  },
  "barrel-titor@2ch.net": {
    family: '"Nunito", "Varela Round", sans-serif',
    weight: 600, sizeMul: 1.1, letterSpacing: '0.01em', // same as Faris
  },
  "mayushii@tutturu.jp": {
    family: '"Patrick Hand", "Caveat", cursive',
    weight: 400, sizeMul: 1.4, letterSpacing: '0.03em', // bubbly round handwriting
  },
  "m.kiryuu@r025.com": {
    family: '"Major Mono Display", "Share Tech Mono", monospace',
    weight: 400, sizeMul: 0.95, letterSpacing: '0.08em', // cold, robotic, all-caps display
  },
  "nyan@future-gadget-lab.jp": {
    family: '"Nunito", "Varela Round", sans-serif',
    weight: 600, sizeMul: 1.1, letterSpacing: '0.01em', // round, readable, still playful
  },
  "suzuha.amane@ibm5100.net": {
    family: '"Special Elite", "Share Tech Mono", monospace',
    weight: 400, sizeMul: 1.0, letterSpacing: '0.04em', // typewriter / telegraph
  },
};
const DEFAULT_FONT = { family: '"Share Tech Mono", monospace', weight: 400, sizeMul: 1.0, letterSpacing: '0.04em' };

// ─── Per-character accent theme — used in email slots, notifications, etc. ──
const CHARACTER_THEMES = {
  "makise.kurisu@viktor-kondria.org": {
    accent: "#a060d0", glow: "rgba(160,96,208,0.5)", border: "rgba(160,96,208,0.75)",
    label: "LAB MEM 004", badge: "ASSISTANT", badgeFg: "#d0a0ff", badgeBg: "rgba(160,96,208,0.18)",
    bgTint: "rgba(80,20,120,0.07)",
  },
  "barrel-titor@2ch.net": {
    accent: "#3878d8", glow: "rgba(56,120,216,0.5)", border: "rgba(56,120,216,0.75)",
    label: "LAB MEM 002", badge: "HACKER", badgeFg: "#88bcff", badgeBg: "rgba(56,120,216,0.18)",
    bgTint: "rgba(20,40,100,0.07)",
  },
  "mayushii@tutturu.jp": {
    accent: "#4868c8", glow: "rgba(72,104,200,0.5)", border: "rgba(72,104,200,0.75)",
    label: "LAB MEM 003", badge: "TUTTURU", badgeFg: "#9ab4ff", badgeBg: "rgba(72,104,200,0.18)",
    bgTint: "rgba(20,30,90,0.07)",
  },
  "m.kiryuu@r025.com": {
    accent: "#c83040", glow: "rgba(200,48,64,0.5)", border: "rgba(200,48,64,0.75)",
    label: "ROUNDER", badge: "FB", badgeFg: "#ff8898", badgeBg: "rgba(200,48,64,0.18)",
    bgTint: "rgba(80,10,20,0.09)",
  },
  "nyan@future-gadget-lab.jp": {
    accent: "#c04898", glow: "rgba(192,72,152,0.5)", border: "rgba(192,72,152,0.75)",
    label: "LAB MEM 009", badge: "NYA~", badgeFg: "#ffa0d8", badgeBg: "rgba(192,72,152,0.18)",
    bgTint: "rgba(80,20,60,0.07)",
  },
  "suzuha.amane@ibm5100.net": {
    accent: "#68b040", glow: "rgba(104,176,64,0.5)", border: "rgba(104,176,64,0.75)",
    label: "TIME TRAVELER", badge: "2036", badgeFg: "#a8e880", badgeBg: "rgba(104,176,64,0.18)",
    bgTint: "rgba(20,50,10,0.07)",
  },
};

// ─── Oscilloscope-style visualizer — animated equalizer bars ────────────────
function DivergenceOscilloscope({ accent = "#e8b850", height = 28, bars = 18, wild = false }) {
  const [vals, setVals] = useState(() =>
    Array.from({ length: bars }, (_, i) => 0.18 + Math.sin(i * 0.8) * 0.25 + Math.random() * 0.25)
  );
  useEffect(() => {
    const speed = wild ? 60 : 110;
    const drift = wild ? 0.45 : 0.28;
    const id = setInterval(() => {
      setVals(prev => prev.map(v => Math.max(0.05, Math.min(1, v + (Math.random() - 0.5) * drift))));
    }, speed);
    return () => clearInterval(id);
  }, [wild]);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height, overflow: "hidden" }}>
      {vals.map((h, i) => (
        <div key={i} style={{
          flex: 1,
          height: `${Math.round(h * 100)}%`,
          background: h > 0.65
            ? `linear-gradient(to top, ${accent}, rgba(255,255,255,0.35))`
            : `linear-gradient(to top, ${accent}cc, ${accent}44)`,
          borderRadius: "1px 1px 0 0",
          boxShadow: h > 0.78 ? `0 0 6px ${accent}88` : "none",
          transition: `height ${wild ? 55 : 90}ms ease-out`,
        }} />
      ))}
    </div>
  );
}

// Track which AI replies have already finished typing (per-session in localStorage)
const TYPED_KEY = 'sg_typed_emails';
function isAlreadyTyped(id) {
  try { return JSON.parse(localStorage.getItem(TYPED_KEY) || '[]').includes(id); }
  catch { return false; }
}
function markAsTyped(id) {
  try {
    const list = JSON.parse(localStorage.getItem(TYPED_KEY) || '[]');
    if (!list.includes(id)) list.push(id);
    // Cap to last 200 entries
    localStorage.setItem(TYPED_KEY, JSON.stringify(list.slice(-200)));
  } catch {}
}

// Per-email typing progress — survives navigation and reload so AI resumes
// from where it left off
const TYPING_PROGRESS_KEY = 'sg_typing_progress';
function _readProgressMap() {
  try { return JSON.parse(localStorage.getItem(TYPING_PROGRESS_KEY) || '{}'); }
  catch { return {}; }
}
function getTypingProgress(id) {
  return _readProgressMap()[id] || 0;
}
function saveTypingProgress(id, idx) {
  try {
    const map = _readProgressMap();
    map[id] = idx;
    // Keep map small — drop entries beyond last 50
    const keys = Object.keys(map);
    if (keys.length > 50) {
      const trimmed = {};
      keys.slice(-50).forEach(k => { trimmed[k] = map[k]; });
      localStorage.setItem(TYPING_PROGRESS_KEY, JSON.stringify(trimmed));
    } else {
      localStorage.setItem(TYPING_PROGRESS_KEY, JSON.stringify(map));
    }
  } catch {}
}
function clearTypingProgress(id) {
  try {
    const map = _readProgressMap();
    delete map[id];
    localStorage.setItem(TYPING_PROGRESS_KEY, JSON.stringify(map));
  } catch {}
}

// ─── TypewriterText ──────────────────────────────────────────────────────────
// Animates text character-by-character with realistic typing rhythm.
// Uses direct DOM updates (not React state) so typing never blocks scrolling.
function TypewriterText({ text, fontFamily, fontSize, fontWeight, lineHeight, color, letterSpacing, onComplete, emailId, fromEmail }) {
  const textRef = useRef(null);
  const cursorRef = useRef(null);
  const timeoutRef = useRef(null);
  const completedRef = useRef(false);
  const autoScrollRef = useRef(true);

  useEffect(() => {
    const startIdx = emailId ? Math.min(getTypingProgress(emailId), [...(text || '')].length) : 0;
    completedRef.current = false;
    autoScrollRef.current = true;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (fromEmail && window.sgSetTypingFrom) window.sgSetTypingFrom(fromEmail);

    const chars = [...(text || '')];
    let i = startIdx;
    let buf = chars.slice(0, i).join('');
    if (textRef.current) textRef.current.textContent = buf;

    // Find the scroll container (closest ancestor with overflow scroll)
    const getScrollParent = () => {
      let el = textRef.current;
      while (el && el.parentElement) {
        el = el.parentElement;
        const ov = getComputedStyle(el).overflowY;
        if (ov === 'scroll' || ov === 'auto') return el;
      }
      return null;
    };
    const scrollParent = getScrollParent();
    let programmaticScroll = false;

    // Pause auto-scroll only on genuine user scroll (wheel/touch), not our programmatic ones
    const onWheel = () => { autoScrollRef.current = false; };
    const onTouchMove = () => { autoScrollRef.current = false; };
    const onScroll = () => {
      if (programmaticScroll) return;
      // If user scrolled back to bottom, re-enable
      if (scrollParent) {
        const atBottom = scrollParent.scrollHeight - scrollParent.scrollTop - scrollParent.clientHeight < 60;
        if (atBottom) autoScrollRef.current = true;
      }
    };
    if (scrollParent) {
      scrollParent.addEventListener('wheel', onWheel, { passive: true });
      scrollParent.addEventListener('touchmove', onTouchMove, { passive: true });
      scrollParent.addEventListener('scroll', onScroll, { passive: true });
    }

    const finish = () => {
      if (cursorRef.current) cursorRef.current.style.display = 'none';
      if (emailId) clearTypingProgress(emailId);
      if (window.sgSetTypingFrom) window.sgSetTypingFrom(null);
      if (!completedRef.current) {
        completedRef.current = true;
        onComplete && onComplete();
      }
    };

    if (i >= chars.length) { finish(); return; }

    let thinkingCleared = false;
    const typeNext = () => {
      if (i >= chars.length) { finish(); return; }
      if (!thinkingCleared) {
        thinkingCleared = true;
        if (window.sgSetThinkingFrom) window.sgSetThinkingFrom(null);
      }
      const ch = chars[i];
      i += 1;
      buf += ch;
      if (textRef.current) textRef.current.textContent = buf;
      if (emailId) saveTypingProgress(emailId, i);

      // Auto-scroll to bottom if user hasn't scrolled up
      if (autoScrollRef.current && scrollParent) {
        programmaticScroll = true;
        scrollParent.scrollTop = scrollParent.scrollHeight;
        programmaticScroll = false;
      }

      let delay;
      if (ch === ' ' || ch === '\t') {
        delay = 4 + Math.random() * 7;
      } else if (ch === '\n') {
        if (chars[i] === '\n') delay = 220 + Math.random() * 160;
        else delay = 80 + Math.random() * 60;
      } else if (ch === '.' || ch === '!' || ch === '?') {
        delay = 170 + Math.random() * 130;
      } else if (ch === ',' || ch === ';' || ch === ':') {
        delay = 80 + Math.random() * 70;
      } else if (ch === '—' || ch === '…') {
        delay = 110 + Math.random() * 100;
      } else if (/\p{Emoji}/u.test(ch)) {
        delay = 55 + Math.random() * 90;
      } else {
        delay = 10 + Math.random() * 18;
      }

      if (Math.random() < 0.004) delay += 350 + Math.random() * 550;
      else if (Math.random() < 0.007) delay += 60 + Math.random() * 100;

      timeoutRef.current = setTimeout(typeNext, delay);
    };

    const warmup = startIdx > 0 ? 60 : 140;
    timeoutRef.current = setTimeout(typeNext, warmup);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (scrollParent) {
        scrollParent.removeEventListener('wheel', onWheel);
        scrollParent.removeEventListener('touchmove', onTouchMove);
        scrollParent.removeEventListener('scroll', onScroll);
      }
      if (window.sgSetTypingFrom) window.sgSetTypingFrom(null);
    };
  }, [text, emailId, fromEmail]);

  return (
    <pre style={{
      fontFamily, fontSize, fontWeight, color, lineHeight, letterSpacing,
      whiteSpace: 'pre-wrap', margin: 0, wordBreak: 'break-word',
    }}>
      <span ref={textRef}/>
      <span ref={cursorRef} style={{
        display: 'inline-block', width: '0.55em', marginLeft: 1,
        background: 'currentColor', opacity: 0.85,
        animation: 'pulse 0.7s steps(2) infinite',
      }}>&nbsp;</span>
    </pre>
  );
}

// ─── ThreadMessageBody — single message in a thread, stacked below the original ──
function ThreadMessageBody({ msg, fontScale, isOriginal }) {
  const charFont = CHARACTER_FONTS[msg.from] || DEFAULT_FONT;
  const baseFontSize = 11 * fontScale * charFont.sizeMul;
  const isAiReply = String(msg.id || '').startsWith('ai_');
  const shouldType = isAiReply && !isAlreadyTyped(msg.id);
  const sharedStyle = {
    fontFamily: charFont.family,
    fontWeight: charFont.weight,
    fontSize: baseFontSize,
    color: 'rgba(225,220,205,0.92)',
    lineHeight: 1.85,
    letterSpacing: charFont.letterSpacing,
  };
  const date = new Date(msg.date).toLocaleString([], {
    year:"numeric", month:"2-digit", day:"2-digit",
    hour:"2-digit", minute:"2-digit",
  });
  return (
    <div style={{
      padding: isOriginal ? "0" : "16px 0 0",
      marginTop: isOriginal ? 0 : 14,
      borderTop: isOriginal ? "none" : "1px solid rgba(200,195,185,0.12)",
    }}>
      {!isOriginal && (
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
          <CharacterAvatar noThinking email={msg.from} size={28}/>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontFamily:"Share Tech Mono,monospace", fontSize:12,
              color:"rgba(235,230,220,0.92)", fontWeight:"600", letterSpacing:"0.04em" }}>
              {msg.fromName}
            </div>
            <div style={{ fontFamily:"Share Tech Mono,monospace", fontSize:10,
              color:"rgba(200,195,185,0.32)", letterSpacing:"0.08em", marginTop:1 }}>
              {date}
            </div>
          </div>
          {msg.labels && msg.labels.includes("AI Reply") && (
            <span style={{
              fontFamily:"Share Tech Mono,monospace", fontSize:9, letterSpacing:"0.18em",
              color:"#9be1a4", background:"rgba(40,160,70,0.12)",
              border:"1px solid rgba(100,210,130,0.4)",
              padding:"2px 7px", borderRadius:2,
            }}>AI REPLY</span>
          )}
        </div>
      )}
      {shouldType ? (
        <TypewriterText
          text={msg.body}
          emailId={msg.id}
          fromEmail={msg.from}
          fontFamily={sharedStyle.fontFamily}
          fontSize={sharedStyle.fontSize}
          fontWeight={sharedStyle.fontWeight}
          lineHeight={sharedStyle.lineHeight}
          color={sharedStyle.color}
          letterSpacing={sharedStyle.letterSpacing}
          onComplete={() => markAsTyped(msg.id)}
        />
      ) : (
        <pre style={{ ...sharedStyle, whiteSpace: 'pre-wrap', margin: 0, wordBreak: 'break-word' }}>
          {msg.body}
        </pre>
      )}
    </div>
  );
}

// ─── Email Reader ─────────────────────────────────────────────────────────────
// Shows the selected email AND any replies that share the same thread,
// stacked beneath the original message — like a WhatsApp/iMessage conversation.
function EmailReader({ email, allEmails = [], fontScale = 1, onStarToggle, onDelete, onReply, onForward }) {
  const [animKey, setAnimKey] = useState(0);
  const prevId = useRef(null);
  const useTyping = window.sgUseTypingFrom || (() => null);
  const typingFrom = useTyping();

  useEffect(() => {
    if (email && email.id !== prevId.current) {
      setAnimKey(k => k + 1);
      prevId.current = email.id;
    }
  }, [email]);

  if (!email) return (
    <div style={{ flex:1, position:"relative", overflow:"hidden" }}/>
  );

  // Build the conversation thread — all emails sharing the same normalized subject
  const tk = threadKeyOf(email);
  const threadMessages = (allEmails && allEmails.length ? allEmails : [email])
    .filter(e => threadKeyOf(e) === tk)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  const original = threadMessages[0] || email;

  const date = new Date(original.date).toLocaleString([], {
    year:"numeric", month:"2-digit", day:"2-digit",
    hour:"2-digit", minute:"2-digit",
  });

  return (
    <div style={{ flex:1, display:"flex", flexDirection:"column", zIndex:10, overflow:"hidden", position:"relative" }}>
      {/* Scan-reveal overlay — plays on each new email */}
      <div key={`scan-${animKey}`} style={{
        position:"absolute", inset:0, zIndex:5, pointerEvents:"none",
        animation: animKey > 0 ? "scanReveal 0.45s cubic-bezier(0.4,0,0.2,1) forwards" : "none",
        background:"rgba(3,8,22,0.95)",
      }}/>
      {/* Moving scan line */}
      {animKey > 0 && (
        <div key={`line-${animKey}`} style={{
          position:"absolute", left:0, right:0, height:2, zIndex:6, pointerEvents:"none",
          background:"linear-gradient(90deg, transparent, rgba(200,195,185,0.55), transparent)",
          animation:"scanLine 0.45s ease forwards",
        }}/>
      )}
      {/* Email header — uses the ORIGINAL message of the thread */}
      <div key={`header-${animKey}`} style={{ padding:"20px 28px 16px", borderBottom:"1px solid rgba(200,195,185,0.10)", background:"rgba(2,6,18,0.28)", backdropFilter:"blur(4px)", WebkitBackdropFilter:"blur(4px)", position:"relative", zIndex:3, animation: animKey > 0 ? "headerSlideIn 0.4s 0.12s both ease-out" : "none" }}>
        <div style={{ display:"flex", alignItems:"flex-start", gap:16, marginBottom:12 }}>
          <CharacterAvatar email={original.from} size={48} typing={typingFrom === original.from}/>
          <div style={{ flex:1 }}>
            <h2 style={{ fontFamily:'"IM Fell English",serif', fontSize:20, color:"rgba(235,230,220,0.92)", lineHeight:1.3, marginBottom:8, fontWeight:400 }}>
              {original.subject}
              {threadMessages.length > 1 && (
                <span style={{ fontFamily:"Share Tech Mono,monospace", fontSize:11, marginLeft:10,
                  color:"#e0b85a", letterSpacing:"0.12em", verticalAlign:"middle",
                  background:"rgba(200,146,10,0.12)", border:"1px solid rgba(200,146,10,0.4)",
                  padding:"1px 7px", borderRadius:2 }}>
                  {threadMessages.length} MSGS
                </span>
              )}
            </h2>
            <div style={{ display:"flex", gap:16 }}>
              <div style={{ fontFamily:"Share Tech Mono,monospace", fontSize:11, color:"rgba(210,210,210,0.55)", letterSpacing:"0.1em" }}>
                FROM: <span style={{ color:"rgba(200,195,185,0.55)" }}>{original.fromName}</span>
              </div>
              <div style={{ fontFamily:"Share Tech Mono,monospace", fontSize:11, color:"rgba(210,210,210,0.28)", letterSpacing:"0.1em" }}>
                {date}
              </div>
            </div>
            <div style={{ fontFamily:"Share Tech Mono,monospace", fontSize:10, color:"rgba(210,210,210,0.25)", letterSpacing:"0.08em", marginTop:2 }}>
              {original.from}
            </div>
          </div>
          {/* Action buttons */}
          <div style={{ display:"flex", gap:6 }}>
            {[
              { label:"★", title:"Star", active:email.starred, onClick:()=>onStarToggle(email.id) },
              { label:"↩", title:"Reply", onClick:onReply },
              { label:"✕", title:"Delete", onClick:()=>onDelete(email.id) },
            ].map(btn => (
              <IconButton key={btn.title} {...btn}/>
            ))}
          </div>
        </div>
        {original.labels && original.labels.length > 0 && (
          <div style={{ display:"flex", gap:4 }}>
            {original.labels.map(l=>(
              <span key={l} style={{ fontFamily:"Share Tech Mono,monospace", fontSize:9, letterSpacing:"0.12em", color:"rgba(200,195,185,0.55)", background:"rgba(200,195,185,0.07)", border:"1px solid rgba(200,195,185,0.15)", padding:"2px 7px" }}>{l}</span>
            ))}
          </div>
        )}
      </div>
      {/* Conversation thread — original message + all replies stacked below */}
      <div key={`body-${animKey}`} style={{ flex:1, minHeight:0, height:0, overflowY:"scroll", overflowX:"hidden", padding:"24px 28px 200px", background:"rgba(2,6,18,0.18)", backdropFilter:"blur(4px)", WebkitBackdropFilter:"blur(4px)", animation: animKey > 0 ? "bodyFadeIn 0.6s ease both" : "none" }}>
        {threadMessages.map((msg, idx) => (
          <ThreadMessageBody key={msg.id} msg={msg} fontScale={fontScale} isOriginal={idx === 0}/>
        ))}
      </div>
      {/* Quick reply strip */}
      <div style={{ padding:"10px 28px", borderTop:"1px solid rgba(200,195,185,0.12)", background:"rgba(2,6,18,0.28)", backdropFilter:"blur(4px)", WebkitBackdropFilter:"blur(4px)", display:"flex", gap:8 }}>
        <button onClick={onReply} style={{
          fontFamily:"Share Tech Mono,monospace", fontSize:11, letterSpacing:"0.2em",
          padding:"7px 18px", cursor:"pointer",
          background:"rgba(200,195,185,0.09)", border:"1px solid rgba(200,195,185,0.22)",
          color:"#ffffff", transition:"all 0.15s",
        }}
        onMouseEnter={e=>{e.target.style.background="rgba(200,195,185,0.14)";e.target.style.color="#ffffff";}}
        onMouseLeave={e=>{e.target.style.background="rgba(200,195,185,0.09)";e.target.style.color="#ffffff";}}>
          ↩ REPLY
        </button>
        <button onClick={onForward} style={{
          fontFamily:"Share Tech Mono,monospace", fontSize:11, letterSpacing:"0.2em",
          padding:"7px 18px", cursor:"pointer",
          background:"transparent", border:"1px solid rgba(200,195,185,0.10)",
          color:"rgba(255,255,255,0.6)", transition:"all 0.15s",
        }}
        onMouseEnter={e=>{e.target.style.borderColor="rgba(200,195,185,0.22)";e.target.style.color="#ffffff";}}
        onMouseLeave={e=>{e.target.style.borderColor="rgba(200,195,185,0.10)";e.target.style.color="rgba(255,255,255,0.6)";}}>
          ↪ FORWARD
        </button>
      </div>
    </div>
  );
}

function IconButton({ label, title, active, onClick }) {
  const [h, setH] = useState(false);
  return (
    <button title={title} onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)} onClick={onClick} style={{
      width:30, height:30, display:"flex", alignItems:"center", justifyContent:"center",
      background: active||h ? "rgba(200,195,185,0.10)" : "transparent",
      border:`1px solid ${active||h?"rgba(200,195,185,0.32)":"rgba(200,195,185,0.10)"}`,
      color: active?"rgba(210,200,185,0.85)":h?"#ffffff":"rgba(255,255,255,0.55)",
      cursor:"pointer", fontSize:13, transition:"all 0.15s",
    }}>{label}</button>
  );
}

// ─── Compose Modal ────────────────────────────────────────────────────────────
function ComposeModal({ replyTo, forwardOf, onClose, onSend }) {
  const [to, setTo] = useState(replyTo ? replyTo.from : "");
  const [subject, setSubject] = useState(
    replyTo ? `Re: ${replyTo.subject}` :
    forwardOf ? `Fwd: ${forwardOf.subject}` : ""
  );
  const [body, setBody] = useState(
    forwardOf ? `\n\n---------- Forwarded message ----------\nFrom: ${forwardOf.fromName}\n\n${forwardOf.body}` : ""
  );
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState(null); // "sent" | "receiving" | "done"
  const [toFocused, setToFocused] = useState(false);

  // Contact list — all known characters from the registry
  const contactList = Object.entries(window.STEINS_CHARS || {});
  const q = (to || '').toLowerCase().trim();
  const filteredContacts = !q
    ? contactList
    : contactList.filter(([emailAddr, c]) => (
        emailAddr.toLowerCase().includes(q) ||
        (c.name  || '').toLowerCase().includes(q) ||
        (c.alias || '').toLowerCase().includes(q) ||
        (c.lab   || '').toLowerCase().includes(q)
      ));
  // Hide dropdown if the field already contains an exact contact email
  const exactMatch = contactList.some(([e]) => e === to);
  const showSuggestions = toFocused && filteredContacts.length > 0 && !exactMatch;

  // Escape closes the modal (unless mid-send)
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && !sending) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sending]);

  const handleSend = () => {
    if (!body.trim()) return;
    setSending(true);

    // Build the sent email object
    const sentEmail = {
      id: `sent_${Date.now()}`,
      from: "hououin.kyouma@future-gadget-lab.jp",
      fromName: "Hououin Kyouma",
      subject, body,
      date: new Date().toISOString(),
      read: true, starred: false,
      folder: "sent", labels: [],
      to,
    };
    onSend(sentEmail);
    playSendSound();
    onClose();

    // Generate AI reply in background
    const persona = CHARACTER_PERSONAS[to];
    if (!persona) return;
    if (window.sgSetTypingFrom) window.sgSetTypingFrom(to);
    if (window.sgSetThinkingFrom) window.sgSetThinkingFrom(to);
    fetchAiReply(to, subject, body).then(data => {
      const aiEmotion = data.emotion || detectEmotion(data.reply);
      if (window.sgSetActiveEmotion) window.sgSetActiveEmotion(to, aiEmotion);
      const replyEmail = {
        id: `ai_${Date.now()}`,
        from: to,
        fromName: persona.name,
        subject: `Re: ${subject.replace(/^Re: /i, "")}`,
        preview: data.reply.slice(0, 100) + "...",
        body: data.reply,
        date: new Date().toISOString(),
        read: false, starred: false,
        folder: "inbox",
        labels: ["AI Reply"],
        inReplyTo: sentEmail.id,
        aiEmotion,
        farisEmotion: to === "nyan@future-gadget-lab.jp" ? aiEmotion : undefined,
      };
      if (window.sgSetTypingFrom) window.sgSetTypingFrom(null);
      if (window.sgSetThinkingFrom) window.sgSetThinkingFrom(null);
      playNotificationSound();
      onSend(replyEmail);
    }).catch(() => {
      if (window.sgSetTypingFrom) window.sgSetTypingFrom(null);
      if (window.sgSetThinkingFrom) window.sgSetThinkingFrom(null);
    });
  };

  const persona = CHARACTER_PERSONAS[to];
  const sendDisabled = sending || !body.trim() || !to.trim();

  // Refs for tabbing between fields with Enter (like Apple Mail).
  const subjectRef = useRef(null);
  const bodyRef    = useRef(null);

  // Enter sends from any field (Shift+Enter inserts a newline in the body).
  const onToKeyDown = (e) => {
    if (e.key === "Enter" && !sendDisabled) { e.preventDefault(); handleSend(); }
  };
  const onSubjectKeyDown = (e) => {
    if (e.key === "Enter" && !sendDisabled) { e.preventDefault(); handleSend(); }
  };
  const onBodyKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey && !sendDisabled) { e.preventDefault(); handleSend(); }
  };

  // Field row: label on the left, content on the right, hairline divider underneath.
  const FieldRow = ({ label, children, last = false }) => (
    <div style={{
      display: "flex", alignItems: "center",
      padding: "12px 22px",
      borderBottom: last ? "none" : "1px solid rgba(200,195,185,0.10)",
      position: "relative",
      minHeight: 48,
    }}>
      <label style={{
        width: 80, flexShrink: 0,
        fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
        fontSize: 15, color: "rgba(200,195,185,0.55)",
      }}>{label}</label>
      <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center" }}>{children}</div>
    </div>
  );

  const fieldInputStyle = {
    flex: 1, width: "100%",
    background: "transparent", border: "none", outline: "none",
    color: "rgba(245,238,222,0.96)",
    fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    fontSize: 15, padding: 0,
  };

  return (
    <div onClick={(e) => { if (e.target === e.currentTarget && !sending) onClose(); }} style={{
      position: "fixed", inset: 0, zIndex: 100,
      background: "rgba(2,5,15,0.55)",
      backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "40px",
    }}>
      <div style={{
        width: "min(840px, 100%)", height: "min(680px, 100%)",
        background: "rgba(8,14,28,0.50)",
        backdropFilter: "blur(28px) saturate(160%)",
        WebkitBackdropFilter: "blur(28px) saturate(160%)",
        border: "1px solid rgba(200,146,10,0.32)",
        borderRadius: 12,
        boxShadow: "0 0 40px rgba(200,146,10,0.10), 0 30px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(0,0,0,0.4)",
        display: "flex", flexDirection: "column",
        overflow: "hidden",
        animation: "screenSlideIn 0.22s ease forwards",
      }}>
        {/* Title bar — close button left, label center, send right */}
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "14px 18px",
          borderBottom: "1px solid rgba(200,146,10,0.18)",
          background: "rgba(200,146,10,0.04)",
        }}>
          <button onClick={() => !sending && onClose()} disabled={sending} title="Close" style={{
            width: 14, height: 14, borderRadius: "50%", border: "none",
            background: "#ff5f57", cursor: sending ? "default" : "pointer",
            opacity: sending ? 0.35 : 1, padding: 0, flexShrink: 0,
            boxShadow: "inset 0 0 0 0.5px rgba(0,0,0,0.18)",
          }}/>
          <div style={{ width: 14, height: 14, borderRadius: "50%", background: "rgba(200,195,185,0.10)", flexShrink: 0 }}/>
          <div style={{ width: 14, height: 14, borderRadius: "50%", background: "rgba(200,195,185,0.10)", flexShrink: 0 }}/>

          <div style={{ flex: 1, textAlign: "center" }}>
            <span style={{
              fontFamily: 'Share Tech Mono,monospace',
              fontSize: 12, fontWeight: 600, color: "rgba(232,184,92,0.75)",
              letterSpacing: "0.28em", textTransform: "uppercase",
              textShadow: "0 0 8px rgba(232,184,92,0.25)",
            }}>
              {forwardOf ? "Forward" : replyTo ? "Reply" : "New Message"}
            </span>
          </div>

          {/* Send button — Steins;Gate amber */}
          <button onClick={handleSend} disabled={sendDisabled} title="Send (↩)" style={{
            width: 32, height: 32, borderRadius: "50%", border: "1px solid",
            borderColor: sendDisabled ? "rgba(200,195,185,0.18)" : "rgba(232,184,92,0.85)",
            background: sendDisabled ? "rgba(255,255,255,0.05)" : "linear-gradient(180deg, #e8b850 0%, #c8920a 100%)",
            color: sendDisabled ? "rgba(255,255,255,0.3)" : "#1a1208",
            cursor: sendDisabled ? "not-allowed" : "pointer",
            fontSize: 18, lineHeight: 1, padding: 0, flexShrink: 0,
            boxShadow: sendDisabled ? "none" : "0 0 14px rgba(232,184,92,0.45)",
            transition: "all 0.15s",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 700,
          }}>↑</button>
        </div>

        {/* Field area */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          {/* To */}
          <FieldRow label="To:">
            <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
              <input
                value={to}
                onChange={e => { setTo(e.target.value); setToFocused(true); }}
                onFocus={() => setToFocused(true)}
                onBlur={() => setTimeout(() => setToFocused(false), 200)}
                onKeyDown={onToKeyDown}
                placeholder=""
                style={fieldInputStyle}
                disabled={sending}
              />
              {showSuggestions && (
                <div style={{
                  position: "absolute", top: "calc(100% + 8px)", left: -10, right: -10, zIndex: 200,
                  maxHeight: 280, overflowY: "auto",
                  background: "rgba(14,20,34,0.94)",
                  backdropFilter: "blur(24px) saturate(160%)", WebkitBackdropFilter: "blur(24px) saturate(160%)",
                  border: "1px solid rgba(200,146,10,0.35)",
                  borderRadius: 10,
                  boxShadow: "0 14px 36px rgba(0,0,0,0.6), 0 0 18px rgba(200,146,10,0.10)",
                }}>
                  <div style={{
                    padding: "8px 14px",
                    fontFamily: 'Share Tech Mono,monospace',
                    fontSize: 10, letterSpacing: "0.22em",
                    color: "rgba(232,184,92,0.6)",
                    borderBottom: "1px solid rgba(200,146,10,0.16)",
                  }}>// LAB ROSTER · {filteredContacts.length} CONTACT{filteredContacts.length !== 1 ? 'S' : ''}</div>
                  {filteredContacts.map(([emailAddr, c]) => (
                    <button
                      key={emailAddr}
                      onMouseDown={(e) => { e.preventDefault(); setTo(emailAddr); setToFocused(false); }}
                      style={{
                        display: "flex", alignItems: "center", gap: 12,
                        width: "100%", textAlign: "left", cursor: "pointer",
                        padding: "10px 14px",
                        background: "transparent", border: "none",
                        transition: "background 0.12s",
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = "rgba(200,146,10,0.14)"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >
                      <CharacterAvatar noThinking email={emailAddr} size={34}/>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', fontSize: 14,
                          color: "rgba(245,238,222,0.96)", fontWeight: 600,
                          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                        }}>{c.name}</div>
                        <div style={{
                          fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', fontSize: 12,
                          color: "rgba(200,180,130,0.6)", marginTop: 1,
                          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                        }}>{emailAddr}</div>
                      </div>
                      <span style={{
                        width: 8, height: 8, borderRadius: "50%",
                        background: c.status === "online" ? "#7acaa8" : c.status === "transmitting" ? "#e8b850" : "#a04040",
                        boxShadow: `0 0 6px ${c.status === "online" ? "#7acaa8" : c.status === "transmitting" ? "#e8b850" : "#a04040"}`,
                        flexShrink: 0,
                      }}/>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </FieldRow>

          {/* Subject */}
          <FieldRow label="Subject:">
            <input
              ref={subjectRef}
              value={subject}
              onChange={e => setSubject(e.target.value)}
              onKeyDown={onSubjectKeyDown}
              placeholder=""
              style={fieldInputStyle}
              disabled={sending}
            />
          </FieldRow>

          {/* From */}
          <FieldRow label="From:" last>
            <span style={{
              fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
              fontSize: 15, color: "rgba(245,238,222,0.85)",
            }}>
              Hououin Kyouma <span style={{ color: "rgba(200,195,185,0.5)" }}>– hououin.kyouma@future-gadget-lab.jp</span>
            </span>
          </FieldRow>
        </div>

        {/* Separator */}
        <div style={{ height: 1, background: "rgba(200,146,10,0.18)", flexShrink: 0 }}/>

        {/* AI banner */}
        {persona && !sending && (
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "8px 22px",
            background: "rgba(200,146,10,0.06)",
            borderBottom: "1px solid rgba(200,146,10,0.10)",
            flexShrink: 0,
          }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#e8b850", animation: "pulse 1.5s infinite", boxShadow: "0 0 6px #e8b850" }}/>
            <span style={{
              fontFamily: 'Share Tech Mono,monospace',
              fontSize: 11, color: "rgba(232,184,92,0.7)", letterSpacing: "0.18em", textTransform: "uppercase",
            }}>{persona.name} will reply live</span>
          </div>
        )}

        {/* Body */}
        <textarea
          ref={bodyRef}
          value={body}
          onChange={e => setBody(e.target.value)}
          onKeyDown={onBodyKeyDown}
          placeholder="Write a message…"
          style={{
            flex: 1, minHeight: 0,
            width: "100%", padding: "18px 22px",
            background: "transparent", border: "none", outline: "none", resize: "none",
            color: "rgba(245,238,222,0.96)",
            fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
            fontSize: 15, lineHeight: 1.6,
            overflowY: "auto",
          }}
          disabled={sending}
        />

        {/* Hint footer */}
        {!status && (
          <div style={{
            padding: "8px 22px",
            borderTop: "1px solid rgba(200,146,10,0.12)",
            background: "rgba(200,146,10,0.03)",
            flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <span style={{
              fontFamily: 'Share Tech Mono,monospace', fontSize: 10,
              color: "rgba(200,195,185,0.4)", letterSpacing: "0.18em",
            }}>⌘↩ to send · ↩ next field · esc to cancel</span>
          </div>
        )}

        {/* Status footer (only while sending) */}
        {status && (
          <div style={{
            padding: "10px 22px",
            background: "rgba(200,146,10,0.05)",
            borderTop: "1px solid rgba(200,146,10,0.15)",
            flexShrink: 0,
          }}>
            <div style={{
              fontFamily: 'Share Tech Mono,monospace',
              fontSize: 11, color: "rgba(232,184,92,0.75)", letterSpacing: "0.18em", textTransform: "uppercase",
              display: "flex", alignItems: "center", gap: 8,
            }}>
              {status === "sent"      && <>▲ Sending…</>}
              {status === "receiving" && <span style={{ animation: "pulse 1s infinite" }}>⟳ {persona?.name} is typing…</span>}
              {status === "done"      && <span style={{ color: "#7acaa8" }}>✓ Sent</span>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


// ─── Live Clock ───────────────────────────────────────────────────────────────
function LiveClock() {
  const [now, setNow] = useState(new Date());
  const [glitch, setGlitch] = useState(false);
  useEffect(() => {
    const t = setInterval(() => {
      setNow(new Date());
      // brief glitch on each second tick
      setGlitch(true);
      setTimeout(() => setGlitch(false), 120);
    }, 1000);
    return () => clearInterval(t);
  }, []);
  const hh = String(now.getHours()).padStart(2,'0');
  const mm = String(now.getMinutes()).padStart(2,'0');
  const ss = String(now.getSeconds()).padStart(2,'0');
  const dd = now.toLocaleDateString("de-DE", { weekday:"short", day:"2-digit", month:"2-digit" });
  const sep = now.getSeconds() % 2 === 0;
  return (
    <div style={{ display:"flex", alignItems:"center", gap:12 }}>
      <span style={{ fontFamily:"Share Tech Mono,monospace", fontSize:14, fontWeight:"bold", color:"rgba(220,220,220,0.92)", letterSpacing:"0.06em" }}>{dd}</span>
      <div style={{
        fontFamily:"Share Tech Mono,monospace", fontWeight:"bold", fontSize:20,
        letterSpacing:"0.06em",
        color: glitch ? "rgba(255,255,255,0.95)" : "rgba(230,230,230,0.92)",
        textShadow: glitch
          ? "0 0 8px rgba(255,255,255,0.6), -1px 0 rgba(120,200,255,0.5), 1px 0 rgba(255,120,120,0.5)"
          : "0 0 4px rgba(255,255,255,0.2)",
        transition: "color 0.08s, text-shadow 0.08s",
        display:"flex", alignItems:"center", gap:1,
      }}>
        <span>{hh}</span>
        <span style={{ opacity: sep ? 1 : 0.2, transition:"opacity 0.08s", margin:"0 1px" }}>:</span>
        <span>{mm}</span>
        <span style={{ opacity: sep ? 1 : 0.2, transition:"opacity 0.08s", margin:"0 1px" }}>:</span>
        <span style={{ color: glitch ? "rgba(255,255,255,0.95)" : "rgba(200,200,200,0.75)", fontSize:16 }}>{ss}</span>
      </div>
    </div>
  );
}

// ─── Steins;Gate Notification Toast System ──────────────────────────────────
// Addictive character-aware notification toasts that slide in from the right.
// Each toast drains a progress bar and auto-dismisses. Dismissable on click.

const NOTIF_TYPE_INFO = {
  ai_reply:         { icon: "◈", label: "AI REPLY",        color: "#a060d0" },
  dmail_sent:       { icon: "⚛", label: "D-MAIL FIRED",    color: "#e87840" },
  world_line_shift: { icon: "⚡", label: "WORLD LINE ↑",   color: "#e8b850" },
  chapter_complete: { icon: "✦", label: "OP COMPLETE",     color: "#7acaa8" },
  intercepted:      { icon: "⚠", label: "INTERCEPTED",    color: "#cc4040" },
  email_alert:      { icon: "✉", label: "NEW MESSAGE",     color: "#e8b850" },
};

function SGNotifToast({ notif, onDismiss }) {
  const [visible, setVisible] = useState(false);
  const [draining, setDraining] = useState(false);
  const duration = notif.duration || 4500;
  const theme = CHARACTER_THEMES[notif.from] || null;
  const typeInfo = NOTIF_TYPE_INFO[notif.type] || { icon: "◉", label: "NOTICE", color: "#e8b850" };
  const accent = theme?.accent || typeInfo.color;
  const glow   = theme?.glow   || "rgba(232,184,92,0.35)";

  useEffect(() => {
    const t1 = setTimeout(() => setVisible(true), 20);
    const t2 = setTimeout(() => setDraining(true), 320);
    const t3 = setTimeout(() => { setVisible(false); setTimeout(onDismiss, 320); }, duration - 300);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  return (
    <div
      onClick={() => { setVisible(false); setTimeout(onDismiss, 280); }}
      style={{
        width: 340,
        background: "rgba(4,10,26,0.97)",
        border: `1px solid ${accent}55`,
        borderLeft: `3px solid ${accent}`,
        borderRadius: 3,
        backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
        boxShadow: `0 6px 28px rgba(0,0,0,0.65), 0 0 20px ${glow}44`,
        overflow: "hidden", cursor: "pointer",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateX(0) scale(1)" : "translateX(24px) scale(0.97)",
        transition: "opacity 0.28s ease, transform 0.28s ease",
        pointerEvents: "all",
      }}>
      <div style={{ padding: "10px 13px 9px" }}>
        {/* Header row: type badge + from name */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: notif.subject || notif.message ? 6 : 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            {notif.from && <CharacterAvatar noThinking email={notif.from} size={30}/>}
            <div>
              <div style={{
                fontFamily: "Share Tech Mono,monospace", fontSize: 9, letterSpacing: "0.22em",
                color: typeInfo.color, fontWeight: 700,
              }}>{typeInfo.icon} {typeInfo.label}</div>
              {notif.fromName && (
                <div style={{
                  fontFamily: "Share Tech Mono,monospace", fontSize: 10, letterSpacing: "0.06em",
                  color: `${accent}ee`, fontWeight: 600, marginTop: 1,
                }}>{notif.fromName}</div>
              )}
            </div>
          </div>
          {/* mini oscilloscope for AI replies */}
          {notif.type === "ai_reply" && (
            <DivergenceOscilloscope accent={accent} height={20} bars={10}/>
          )}
          {notif.type === "world_line_shift" && notif.divergence && (
            <div style={{
              fontFamily: "Share Tech Mono,monospace", fontSize: 13, color: "#e8b850", fontWeight: 600,
              textShadow: "0 0 8px rgba(232,184,92,0.55)", letterSpacing: "0.04em",
            }}>{notif.divergence}</div>
          )}
        </div>
        {notif.subject && (
          <div style={{
            fontFamily: "Share Tech Mono,monospace", fontSize: 10,
            color: "rgba(228,222,205,0.88)", letterSpacing: "0.04em",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            marginBottom: notif.message ? 3 : 0,
          }}>Re: {notif.subject}</div>
        )}
        {notif.message && (
          <div style={{
            fontFamily: "Share Tech Mono,monospace", fontSize: 10,
            color: "rgba(200,195,180,0.60)", letterSpacing: "0.05em", lineHeight: 1.4,
            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
          }}>{notif.message}</div>
        )}
      </div>
      {/* Drain bar */}
      <div style={{ height: 2, background: "rgba(200,195,185,0.07)" }}>
        <div style={{
          height: "100%",
          width: draining ? "0%" : "100%",
          background: `linear-gradient(90deg, ${accent}, ${accent}88)`,
          boxShadow: `0 0 5px ${accent}88`,
          transition: draining ? `width ${duration - 600}ms linear` : "width 0.08s",
        }}/>
      </div>
    </div>
  );
}

function SGNotificationStack({ notifications, onDismiss }) {
  if (!notifications || notifications.length === 0) return null;
  return (
    <div style={{
      position: "fixed", right: 20, top: 82, zIndex: 150,
      display: "flex", flexDirection: "column", gap: 7,
      pointerEvents: "none",
      width: 340,
    }}>
      {notifications.map(n => (
        <SGNotifToast key={n.id} notif={n} onDismiss={() => onDismiss(n.id)}/>
      ))}
    </div>
  );
}

// ============================================================
// ROOT APP
// ============================================================
function App() {
  const [emails, setEmails] = useState(MOCK_EMAILS);
  const [activeFolder, setActiveFolder] = useState("inbox");
  const [selectedId, setSelectedId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [composing, setComposing] = useState(false);
  const [replyTarget, setReplyTarget] = useState(null);
  const [forwardTarget, setForwardTarget] = useState(null);

  // ── UI preferences ──────────────────────────────────────
  const [fontScale, setFontScale] = useState(() => parseFloat(localStorage.getItem('sg_font_scale') || '1.5'));
  const [uiScale,   setUiScale]   = useState(() => parseFloat(localStorage.getItem('sg_ui_scale') || '0.8'));
  useEffect(() => { localStorage.setItem('sg_font_scale', fontScale); }, [fontScale]);
  useEffect(() => { localStorage.setItem('sg_ui_scale', uiScale); }, [uiScale]);

  // ── extended state ──────────────────────────────────────
  const [booting, setBooting] = useState(true);
  const [palette, setPalette] = useState(false);
  const [dossierEmail, setDossierEmail] = useState(null);
  const [shifting, setShifting] = useState(false);
  const [dmailLog, setDmailLog] = useState([]);
  const [divergence, setDivergence] = useState("0.571046%");

  // ── Notification system ─────────────────────────────────
  const [notifications, setNotifications] = useState([]);
  const notifIdRef = useRef(0);
  const pushNotif = useCallback((notif) => {
    const id = ++notifIdRef.current;
    setNotifications(prev => [...prev.slice(-4), { ...notif, id }]);
    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), (notif.duration || 4500) + 400);
  }, []);
  useEffect(() => { window.sgNotify = pushNotif; return () => { window.sgNotify = null; }; }, [pushNotif]);

  // ── story state ─────────────────────────────────────────
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const [railHidden,    setRailHidden]    = useState(true); // rail removed; flag kept for legacy
  const [dmailOpen,     setDmailOpen]     = useState(false);
  const [storyOpen,     setStoryOpen]     = useState(false);
  const [playingChapter,setPlayingChapter]= useState(null);
  const [justCompleted, setJustCompleted] = useState(null);
  const [completedChapters, setCompletedChapters] = useState(() => {
    try { return JSON.parse(localStorage.getItem("sg_chapters") || "{}"); } catch { return {}; }
  });
  const [stats, setStats] = useState(() => {
    try {
      const s = JSON.parse(localStorage.getItem("sg_stats") || "null");
      if (s) return s;
    } catch {}
    return { emailsSent: 0, dmailsSent: 0, aiRepliesReceived: 0, emailsSentTo: {} };
  });
  useEffect(() => { localStorage.setItem("sg_chapters", JSON.stringify(completedChapters)); }, [completedChapters]);
  useEffect(() => { localStorage.setItem("sg_stats", JSON.stringify(stats)); }, [stats]);

  // ── Auto-save: write to the active slot whenever progress changes ───────────
  useEffect(() => {
    if (booting) return; // don't auto-save during boot/title screen
    const slotIdx = parseInt(localStorage.getItem("sg_active_slot") || "0", 10);
    const fn = window.sg_saveGame;
    // Debounce auto-save by 600ms so rapid state changes batch into one write
    const t = setTimeout(() => {
      if (fn) {
        fn(slotIdx, completedChapters, stats).catch(() => {});
      } else {
        // Fallback: write minimal slot data without chats
        const s = { ts: Date.now(), completed: completedChapters, stats, chats: {},
          divergence: localStorage.getItem("sg_divergence") || "0.571046%" };
        localStorage.setItem(`sg_save_slot_${slotIdx}`, JSON.stringify(s));
      }
    }, 600);
    return () => clearTimeout(t);
  }, [completedChapters, stats, booting]);

  // First-run: prompt user toward story after boot
  useEffect(() => {
    if (booting) return;
    if (Object.keys(completedChapters).length === 0) {
      const t = setTimeout(() => setStoryOpen(true), 900);
      return () => clearTimeout(t);
    }
  }, [booting]);

  // ⌘K / Ctrl+K opens command palette
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette(p => !p);
      }
      if (e.key === "Escape") {
        setPalette(false);
        setDossierEmail(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const handleSelect = useCallback((id) => {
    setSelectedId(id);
    setEmails(prev => prev.map(e => e.id === id ? {...e, read:true} : e));
  }, []);

  const handleStarToggle = useCallback((id) => {
    setEmails(prev => prev.map(e => e.id === id ? {...e, starred:!e.starred} : e));
  }, []);

  const handleDelete = useCallback((id) => {
    setEmails(prev => prev.map(e => e.id === id ? {...e, folder:"trash"} : e));
    setSelectedId(null);
  }, []);

  const handleSend = useCallback((emailObj) => {
    setEmails(prev => [emailObj, ...prev]);
    if (emailObj.folder === "inbox") setSelectedId(emailObj.id);
    // ── story stats tracking ──
    setStats(prev => {
      const next = { ...prev, emailsSentTo: { ...prev.emailsSentTo } };
      if (emailObj.folder === "sent") {
        next.emailsSent = (prev.emailsSent || 0) + 1;
        if (emailObj.to) next.emailsSentTo[emailObj.to] = (next.emailsSentTo[emailObj.to] || 0) + 1;
      }
      if (emailObj.labels && emailObj.labels.includes("AI Reply")) {
        next.aiRepliesReceived = (prev.aiRepliesReceived || 0) + 1;
      }
      return next;
    });
    // ── notification ──
    if (emailObj.labels?.includes("AI Reply")) {
      playNotificationSound();
      pushNotif({
        type: "ai_reply",
        from: emailObj.from,
        fromName: emailObj.fromName,
        subject: emailObj.subject,
        message: emailObj.preview,
        duration: 5500,
      });
    }
  }, [pushNotif]);

  // ── D-Mail send: triggers world line shift, drops a Suzuha warning ──
  const handleSendDMail = useCallback(({ msg, target }) => {
    setDmailLog(prev => [...prev, { msg, target, ts: Date.now() }]);
    setStats(prev => ({ ...prev, dmailsSent: (prev.dmailsSent || 0) + 1 }));
    setShifting(true);
    // Roll a new divergence reading
    const r = (Math.random() * 0.6 + 0.3).toFixed(6);
    setDivergence(`${r}%`);
    // World line shift notification
    pushNotif({
      type: "world_line_shift",
      divergence: `${r}%`,
      message: `D-Mail transmitted · attractor field destabilised`,
      duration: 5000,
    });
    // Suzuha responds from 2036
    setTimeout(() => {
      const suzuhaEmail = {
        id: `dmail_${Date.now()}`,
        from: "suzuha.amane@ibm5100.net",
        fromName: "Suzuha Amane",
        subject: `Detected D-Mail to ${target} — STOP.`,
        preview: `You sent: "${msg}". The attractor field has shifted. We're tracking the consequences.`,
        body: `I felt the shift from 2036.\n\nYou sent: "${msg}"\nTarget: ${target}\nNew divergence: ${r}%\n\nEvery one of these moves you further from Steins Gate. Please. Stop sending D-Mails.\n\nBurn this after reading.\n\n— S.A.`,
        date: new Date().toISOString(),
        read: false, starred: false, folder: "inbox",
        labels: ["URGENT", "FROM 2036"],
      };
      setEmails(prev => [suzuhaEmail, ...prev]);
      playNotificationSound();
      pushNotif({
        type: "intercepted",
        from: "suzuha.amane@ibm5100.net",
        fromName: "Suzuha Amane",
        subject: `Detected D-Mail to ${target} — STOP.`,
        message: `World line ${r}% — attractor field destabilised`,
        duration: 6000,
      });
    }, 1500);
  }, [pushNotif]);

  const handlePickCharacter = useCallback((email) => {
    setDossierEmail(email);
  }, []);

  const handleMarkAllRead = useCallback(() => {
    setEmails(prev => prev.map(e => ({...e, read: true})));
  }, []);

  // ── story handlers ──
  const handlePlayChapter = useCallback((ch) => {
    setPlayingChapter(ch);
  }, []);
  const handleChapterComplete = useCallback((ch) => {
    setPlayingChapter(null);
    setCompletedChapters(prev => ({ ...prev, [ch.id]: true }));
    if (ch.reward && ch.reward.email) {
      const rewardEmail = { ...ch.reward.email };
      setEmails(prev => {
        if (prev.find(e => e.id === rewardEmail.id)) return prev;
        return [rewardEmail, ...prev];
      });
    }
    if (ch.id === "ch5") setDivergence("1.048596%");
    setJustCompleted(ch);
    pushNotif({
      type: "chapter_complete",
      message: `${ch.title} — ${ch.reward?.email ? "reward email received" : "operation complete"}`,
      duration: 6000,
    });
  }, [pushNotif]);
  const handleResetProgress = useCallback(() => {
    if (!confirm("Reset story progress? This will clear all completed chapters and stats. (Inbox stays.)")) return;
    setCompletedChapters({});
    setStats({ emailsSent: 0, dmailsSent: 0, aiRepliesReceived: 0, emailsSentTo: {} });
  }, []);

  // Command palette commands
  const commands = useMemo(() => ([
    { id: "compose", icon: "✎", label: "COMPOSE NEW MESSAGE", hint: "open compose modal", shortcut: "C", run: () => { setReplyTarget(null); setForwardTarget(null); setComposing(true); } },
    { id: "markall", icon: "☑", label: "MARK ALL AS READ", hint: "clears all unread badges", run: handleMarkAllRead },
    { id: "shift",   icon: "⚡", label: "FORCE WORLD LINE SHIFT", hint: "manual divergence reroll", run: () => { setShifting(true); setDivergence(`${(Math.random() * 0.6 + 0.3).toFixed(6)}%`); } },
    { id: "story",   icon: "✦", label: "OPEN STORY MODE", hint: "chapter select · operation skuld", shortcut: "S", run: () => setStoryOpen(true) },
    { id: "kongroo", icon: "Ψ", label: "EL PSY KONGROO", hint: "the chosen phrase of the mad scientist", run: () => { setShifting(true); setDivergence("1.048596%"); } },
    { id: "togglesb", icon: "◧", label: sidebarHidden ? "SHOW SIDEBAR" : "HIDE SIDEBAR", run: () => setSidebarHidden(s => !s) },
    { id: "phonewave", icon: "⚛", label: "OPEN PHONEWAVE · SEND D-MAIL", hint: "future gadget #8", run: () => setDmailOpen(true) },
    { id: "boot",    icon: "▶", label: "REBOOT TERMINAL", hint: "replay the boot sequence", run: () => setBooting(true) },
    { id: "inbox",   icon: "▤", label: "GO TO INBOX",   run: () => setActiveFolder("inbox") },
    { id: "starred", icon: "◈", label: "GO TO STARRED", run: () => setActiveFolder("starred") },
    { id: "sent",    icon: "▶", label: "GO TO SENT",    run: () => setActiveFolder("sent") },
    { id: "dmail",   icon: "✉", label: "OPEN D-MAIL TRANSMITTER", hint: "phone microwave", run: () => {} },
    ...Object.entries(window.STEINS_CHARS || {}).map(([email, c]) => ({
      id: `dossier_${email}`, icon: "◑", label: `DOSSIER · ${c.alias.toUpperCase()}`, hint: c.role, run: () => setDossierEmail(email),
    })),
  ]), [handleMarkAllRead, sidebarHidden]);

  const selectedEmail = emails.find(e => e.id === selectedId) || null;

  const Boot = window.BootSequence;
  const Palette = window.CommandPalette;
  const Dossier = window.DossierPanel;
  const Shift = window.ShiftFlash;
  const Particles = window.AmbientParticles;

  return (
  <>
    <div style={{ width:"100vw", height:"100vh", display:"flex", flexDirection:"row", overflow:"hidden", position:"relative", zoom: uiScale }}>
      <Slideshow />
      <BlueprintOverlay />
      {Particles && <Particles />}

      {/* Sidebar — extends from top to bottom of viewport (Apple-Mail layout) */}
      {!sidebarHidden ? (
        <Sidebar
          activeFolder={activeFolder}
          onFolderChange={setActiveFolder}
          emails={emails}
          onCompose={() => { setReplyTarget(null); setComposing(true); }}
          divergence={divergence}
        />
      ) : (
        <CollapsedStrip side="left" onClick={() => setSidebarHidden(false)}/>
      )}

      {/* Right column — header on top of email list + reader */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden", position:"relative", minWidth:0 }}>
        {/* Header — sits only above the email list + reader, never above the sidebar */}
        <header style={{
          height:64, flexShrink:0,
          background:"rgba(2,6,18,0.28)",
          backdropFilter:"blur(4px)", WebkitBackdropFilter:"blur(4px)",
          display:"flex", alignItems:"center", padding:"0 20px", gap:18,
          zIndex:20, position:"relative",
        }}>
          <div style={{ flex:1 }}/>

          {/* story button */}
          <StoryButton
            completedCount={Object.keys(completedChapters).length}
            total={(window.STORY_CHAPTERS||[]).length}
            onClick={() => setStoryOpen(true)}
          />

          <LiveClock/>
        </header>

        {/* Lists + reader row */}
        <div style={{ flex:1, display:"flex", overflow:"hidden", position:"relative", minHeight:0 }}>
          {/* Floating sidebar toggle tab */}
          <div onClick={() => setSidebarHidden(s => !s)}
            style={{
              position:"absolute",
              left: 0,
              top:"50%", transform:"translateY(-50%)",
              zIndex:50, cursor:"pointer",
              display:"flex", alignItems:"center", justifyContent:"center",
              width:16, height:48,
              background:"rgba(200,195,185,0.09)",
              borderTop:"1px solid rgba(200,195,185,0.14)",
              borderRight:"1px solid rgba(200,195,185,0.14)",
              borderBottom:"1px solid rgba(200,195,185,0.14)",
              borderRadius:"0 4px 4px 0",
              transition:"left 0.2s ease",
            }}
            onMouseEnter={e => { e.currentTarget.style.background="rgba(200,195,185,0.15)"; e.currentTarget.style.borderColor="rgba(200,195,185,0.35)"; }}
            onMouseLeave={e => { e.currentTarget.style.background="rgba(200,195,185,0.09)"; e.currentTarget.style.borderColor="rgba(200,195,185,0.14)"; }}
          >
            <span style={{ fontFamily:"Share Tech Mono,monospace", fontSize:9, color:"rgba(200,195,185,0.45)", lineHeight:1 }}>
              {sidebarHidden ? "›" : "‹"}
            </span>
          </div>
          <EmailList
            emails={emails}
            activeFolder={activeFolder}
            selectedId={selectedId}
            onSelect={handleSelect}
            searchQuery={searchQuery}
          />
        <EmailReader
          email={selectedEmail}
          allEmails={emails}
          fontScale={fontScale}
          onStarToggle={handleStarToggle}
          onDelete={handleDelete}
          onReply={() => { setReplyTarget(selectedEmail); setForwardTarget(null); setComposing(true); }}
          onForward={() => { setForwardTarget(selectedEmail); setReplyTarget(null); setComposing(true); }}
        />
        {!railHidden && Rail && (
          <Rail
            divergence={divergence}
            onSendDMail={handleSendDMail}
            onPickCharacter={handlePickCharacter}
            dmailLog={dmailLog}
          />
        )}
        </div>
      </div>

      {/* Floating Title Menu button — saves & returns to title; music stops instantly */}
      <SaveLoadButton onClick={() => {
        // 1) Force save current state to active slot
        const slotIdx = parseInt(localStorage.getItem("sg_active_slot") || "0", 10);
        const fn = window.sg_saveGame;
        if (fn) { try { fn(slotIdx, completedChapters, stats); } catch {} }
        // 2) Pause YouTube OST player immediately
        try { window._ytPlayer?.pauseVideo(); } catch {}
        // 3) Return to title screen for slot management
        setBooting(true);
      }}/>

      {/* D-Mail Compose (launcher hidden — accessible via ⌘K command palette to match target UI) */}
      {dmailOpen && <DMailCompose
        onClose={() => setDmailOpen(false)}
        onSend={({msg, target}) => { handleSendDMail({msg, target}); setDmailOpen(false); }}
      />}

      {composing && (
        <ComposeModal
          replyTo={replyTarget}
          forwardOf={forwardTarget}
          onClose={() => { setComposing(false); setReplyTarget(null); setForwardTarget(null); }}
          onSend={handleSend}
        />
      )}

      {Palette && <Palette open={palette} onClose={() => setPalette(false)} commands={commands}/>}
      {Dossier && dossierEmail && <Dossier email={dossierEmail} onClose={() => setDossierEmail(null)}/>}
      {Shift && <Shift active={shifting} onDone={() => setShifting(false)}/>}

      {/* Story system */}
      {window.StoryHub && (
        <window.StoryHub
          open={storyOpen}
          onClose={() => setStoryOpen(false)}
          stats={stats}
          completed={completedChapters}
          onPlay={handlePlayChapter}
          onResetProgress={handleResetProgress}
          fontScale={fontScale}
          setFontScale={setFontScale}
          uiScale={uiScale}
          setUiScale={setUiScale}
          onLoadSave={(slot) => {
            setCompletedChapters(slot.completed || {});
            setStats(slot.stats || { emailsSent:0, dmailsSent:0, aiRepliesReceived:0, emailsSentTo:{} });
            if (slot.divergence) setDivergence(slot.divergence);
          }}
        />
      )}
      {playingChapter && window.VNScene && (
        <window.VNScene
          chapter={playingChapter}
          onClose={() => setPlayingChapter(null)}
          onComplete={handleChapterComplete}
        />
      )}
      {justCompleted && window.ChapterComplete && (
        <window.ChapterComplete
          chapter={justCompleted}
          onDone={() => { setJustCompleted(null); setStoryOpen(true); }}
        />
      )}

      {/* Mail Handy — right-edge slide-out phone tied to the storyline */}
      {!booting && (
        <MailHandy
          completedChapters={completedChapters}
          stats={stats}
          divergence={divergence}
          onOpenStory={() => setStoryOpen(true)}
          onOpenDmail={() => setDmailOpen(true)}
        />
      )}

      {/* Floating MP3 player — bottom-right, hidden during boot */}
      {!booting && <MusicPlayer />}

      {/* Notification toasts */}
      <SGNotificationStack
        notifications={notifications}
        onDismiss={(id) => setNotifications(prev => prev.filter(n => n.id !== id))}
      />

      {/* Scanlines + vignette */}
      <div style={{ position:"fixed", inset:0, pointerEvents:"none", zIndex:30,
        background:"repeating-linear-gradient(to bottom, transparent 0, transparent 3px, rgba(0,0,0,0.025) 3px, rgba(0,0,0,0.025) 4px)"
      }}/>
      <div style={{ position:"fixed", inset:0, pointerEvents:"none", zIndex:31,
        background:"radial-gradient(ellipse 90% 80% at 50% 50%, transparent 50%, rgba(0,0,0,0.32) 100%)",
      }}/>
    </div>

    {/* Boot sequence — outside zoom wrapper so it always fills the viewport correctly */}
    {booting && Boot && <Boot onDone={() => setBooting(false)} onLoadSave={(slot) => {
      setCompletedChapters(slot.completed || {});
      setStats(slot.stats || { emailsSent:0, dmailsSent:0, aiRepliesReceived:0, emailsSentTo:{} });
      if (slot.divergence) setDivergence(slot.divergence);
    }}/>}
  </>
  );
}


// Export for main entry
Object.assign(window, { SteinsGateMailApp: App });

function layoutToggleBtn(active) {
  return {
    padding: "5px 9px",
    background: active ? "rgba(200,195,185,0.12)" : "transparent",
    border: "1px solid rgba(200,195,185,0.15)",
    color: active ? "rgba(235,230,220,0.92)" : "rgba(210,210,210,0.55)",
    fontFamily: "Share Tech Mono,monospace", fontSize: 10, letterSpacing: "0.1em",
    cursor: "pointer",
  };
}

// ─── Story Button — cinematic header CTA with progress, glow, and pulse ────
function StoryButton({ completedCount, total, onClick }) {
  const [hover, setHover] = useState(false);
  const fresh = completedCount === 0;
  const done = total > 0 && completedCount === total;
  const inProgress = !fresh && !done;
  const pct = total > 0 ? (completedCount / total) * 100 : 0;

  // Color states: fresh = bright amber, in-progress = subtle amber, done = green
  const accent = done ? "#7acaa8" : "#e8b850";
  const accentDark = done ? "#3a8a5e" : "#c8920a";

  return (
    <button onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        position: "relative",
        padding: "0",
        background: fresh
          ? `linear-gradient(180deg, ${accent} 0%, ${accentDark} 100%)`
          : hover ? "rgba(232,184,92,0.14)" : "rgba(20,14,6,0.65)",
        border: `1px solid ${fresh ? accent : hover ? `${accent}aa` : `${accent}55`}`,
        cursor: "pointer",
        borderRadius: 4,
        overflow: "hidden",
        transition: "all 0.18s ease",
        boxShadow: fresh
          ? `0 0 18px ${accent}66, inset 0 0 10px rgba(255,255,255,0.15)`
          : hover ? `0 0 14px ${accent}55` : `0 0 8px ${accent}22`,
        backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)",
        animation: fresh ? "pulse 2.4s ease-in-out infinite" : "none",
      }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "7px 16px 7px 14px",
        position: "relative", zIndex: 2,
      }}>
        <span style={{
          fontSize: 14, lineHeight: 1,
          color: fresh ? "#1a1208" : accent,
          textShadow: fresh ? "none" : `0 0 8px ${accent}88`,
        }}>{done ? "✓" : "✦"}</span>
        <span style={{
          fontFamily: "Share Tech Mono,monospace", fontSize: 12, letterSpacing: "0.28em",
          fontWeight: 700,
          color: fresh ? "#1a1208" : "rgba(235,230,220,0.92)",
          textShadow: fresh ? "none" : "0 0 6px rgba(232,184,92,0.4)",
        }}>STORY</span>
        <span style={{
          fontFamily: "Share Tech Mono,monospace", fontSize: 11, letterSpacing: "0.08em",
          fontWeight: 600,
          color: fresh ? "rgba(26,18,8,0.7)" : `${accent}cc`,
          paddingLeft: 6, borderLeft: `1px solid ${fresh ? "rgba(26,18,8,0.3)" : `${accent}33`}`,
        }}>{completedCount}/{total}</span>
      </div>
      {/* Progress bar at the bottom of the button — visible when in-progress */}
      {inProgress && (
        <div style={{
          position: "absolute", left: 0, bottom: 0, height: 2, width: `${pct}%`,
          background: `linear-gradient(90deg, ${accent}, ${accentDark})`,
          boxShadow: `0 0 6px ${accent}aa`,
          transition: "width 0.4s",
        }}/>
      )}
    </button>
  );
}

// ─── Mail Handy — slide-out phone on the right edge, tied to the storyline ──
// Hover the small arrow on the right edge → the FG.LAB phone slides out and
// shows the current chapter, unlock progress, divergence, and quick actions.
function MailHandy({ completedChapters, stats, divergence, onOpenStory, onOpenDmail }) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef(null);
  const chapters = window.STORY_CHAPTERS || [];
  const evalUnlock = window.STORY_evaluateUnlock || (() => ({ ok: true, progress: 0, of: 1 }));

  // Find the next chapter to play (first incomplete one)
  const nextIdx = chapters.findIndex(ch => !completedChapters[ch.id]);
  const next = nextIdx >= 0 ? chapters[nextIdx] : null;
  const prevDone = nextIdx <= 0 || !!completedChapters[chapters[nextIdx - 1]?.id];
  const evalRes = next ? evalUnlock(next.unlock, stats) : { ok: true, progress: 1, of: 1 };
  const unlocked = prevDone && evalRes.ok;
  const allDone = nextIdx === -1;

  const handleEnter = () => { if (closeTimer.current) clearTimeout(closeTimer.current); setOpen(true); };
  const handleLeave = () => { closeTimer.current = setTimeout(() => setOpen(false), 220); };

  const PANEL_W = 320;
  const accent = "#e8b850";

  return (
    <>
      {/* Tab — the small arrow on the right edge */}
      <div onMouseEnter={handleEnter} onMouseLeave={handleLeave}
        onClick={() => setOpen(o => !o)}
        style={{
          position: "fixed", right: open ? PANEL_W : 0, top: "50%", transform: "translateY(-50%)",
          width: 22, height: 64, zIndex: 55, cursor: "pointer",
          background: "rgba(20,14,6,0.85)",
          border: `1px solid ${accent}55`,
          borderRight: "none",
          borderRadius: "6px 0 0 6px",
          display: "flex", alignItems: "center", justifyContent: "center",
          backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
          boxShadow: open ? `0 0 14px ${accent}44, -3px 0 16px rgba(0,0,0,0.4)` : `0 0 8px ${accent}22`,
          transition: "right 0.35s cubic-bezier(0.4,0,0.2,1), box-shadow 0.2s",
        }}>
        <span style={{
          fontFamily: "Share Tech Mono,monospace", fontSize: 16, color: accent,
          textShadow: `0 0 6px ${accent}88`,
          transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.3s",
        }}>‹</span>
      </div>

      {/* Sliding phone panel */}
      <div onMouseEnter={handleEnter} onMouseLeave={handleLeave}
        style={{
          position: "fixed", right: open ? 0 : -PANEL_W, top: 0, bottom: 110, width: PANEL_W,
          zIndex: 54, transition: "right 0.35s cubic-bezier(0.4,0,0.2,1)",
          background: "linear-gradient(180deg, rgba(8,12,24,0.96) 0%, rgba(4,8,18,0.96) 100%)",
          borderLeft: `1px solid ${accent}44`,
          boxShadow: "-12px 0 32px rgba(0,0,0,0.55)",
          backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
          display: "flex", flexDirection: "column",
          padding: "22px 18px 18px",
          overflow: "hidden",
        }}>
        {/* Phone "screen" header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ fontFamily: "Share Tech Mono,monospace", fontSize: 10, color: `${accent}cc`, letterSpacing: "0.28em" }}>FG.LAB · PHONE</div>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#7acaa8", boxShadow: "0 0 6px #7acaa8", animation: "pulse 2s infinite" }}/>
            <span style={{ fontFamily: "Share Tech Mono,monospace", fontSize: 9, color: "rgba(200,195,185,0.55)", letterSpacing: "0.18em" }}>ONLINE</span>
          </div>
        </div>

        {/* Divergence read-out */}
        <div style={{
          padding: "10px 12px", marginBottom: 14,
          background: "rgba(200,146,10,0.06)", border: `1px solid ${accent}22`,
          borderRadius: 4,
        }}>
          <div style={{ fontFamily: "Share Tech Mono,monospace", fontSize: 9, color: `${accent}aa`, letterSpacing: "0.22em", marginBottom: 3 }}>WORLD LINE</div>
          <div style={{ fontFamily: "Share Tech Mono,monospace", fontSize: 20, fontWeight: 600, color: accent, letterSpacing: "0.04em", textShadow: `0 0 8px ${accent}66` }}>{divergence}</div>
        </div>

        {/* Chapter card */}
        {allDone ? (
          <div style={{ padding: 14, border: `1px solid ${accent}44`, background: `${accent}10`, borderRadius: 4, marginBottom: 14 }}>
            <div style={{ fontFamily: "Share Tech Mono,monospace", fontSize: 10, color: accent, letterSpacing: "0.22em", marginBottom: 6 }}>OPERATION COMPLETE</div>
            <div style={{ fontFamily: '"IM Fell English",serif', fontSize: 16, color: "rgba(235,230,220,0.92)", lineHeight: 1.3 }}>You reached Steins;Gate.</div>
          </div>
        ) : (
          <div style={{ padding: 14, border: "1px solid rgba(200,195,185,0.15)", background: "rgba(2,6,18,0.5)", borderRadius: 4, marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
              <span style={{ fontFamily: "Share Tech Mono,monospace", fontSize: 9, color: `${accent}99`, letterSpacing: "0.22em" }}>CH.{String(next.num).padStart(2, "0")}</span>
              <span style={{ fontFamily: "Share Tech Mono,monospace", fontSize: 8, color: unlocked ? "#7acaa8" : "rgba(200,195,185,0.4)", letterSpacing: "0.2em" }}>
                {unlocked ? "▶ READY" : "🔒 LOCKED"}
              </span>
            </div>
            <div style={{ fontFamily: '"IM Fell English",serif', fontSize: 17, color: "rgba(235,230,220,0.92)", lineHeight: 1.2, marginBottom: 6 }}>{next.title}</div>
            <div style={{ fontFamily: "Share Tech Mono,monospace", fontSize: 9, color: "rgba(200,195,185,0.5)", letterSpacing: "0.1em", marginBottom: 10 }}>{next.subtitle}</div>

            {/* Objective */}
            <div style={{ fontFamily: "Share Tech Mono,monospace", fontSize: 9, color: `${accent}aa`, letterSpacing: "0.22em", marginBottom: 6 }}>OBJECTIVE</div>
            <div style={{ fontFamily: "Share Tech Mono,monospace", fontSize: 11, color: "rgba(220,210,190,0.85)", lineHeight: 1.5, marginBottom: 8 }}>
              {prevDone ? (next.unlock?.label || "Ready to play") : `Complete Chapter ${nextIdx} first`}
            </div>
            {prevDone && evalRes.of > 1 && (
              <div style={{ marginBottom: 4 }}>
                <div style={{ height: 4, background: "rgba(200,195,185,0.1)", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{
                    width: `${(evalRes.progress / evalRes.of) * 100}%`, height: "100%",
                    background: `linear-gradient(90deg, ${accent}, #c8920a)`,
                    boxShadow: `0 0 6px ${accent}88`,
                    transition: "width 0.4s",
                  }}/>
                </div>
                <div style={{ fontFamily: "Share Tech Mono,monospace", fontSize: 9, color: "rgba(200,195,185,0.55)", marginTop: 3, textAlign: "right" }}>
                  {evalRes.progress} / {evalRes.of}
                </div>
              </div>
            )}
            {prevDone && evalRes.of === 1 && evalRes.progress > 0 && (
              <div style={{ fontFamily: "Share Tech Mono,monospace", fontSize: 9, color: "#7acaa8", letterSpacing: "0.12em" }}>✓ DONE</div>
            )}
          </div>
        )}

        {/* Lab member stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginBottom: 14 }}>
          <PhoneStat label="EMAILS" v={stats.emailsSent || 0}/>
          <PhoneStat label="REPLIES" v={stats.aiRepliesReceived || 0}/>
          <PhoneStat label="D-MAILS" v={stats.dmailsSent || 0}/>
        </div>

        <div style={{ flex: 1 }}/>

        {/* Action buttons */}
        <button onClick={onOpenStory} style={{
          padding: "10px 14px", marginBottom: 8,
          background: unlocked && !allDone ? `linear-gradient(180deg, ${accent} 0%, #c8920a 100%)` : "rgba(200,195,185,0.08)",
          border: `1px solid ${unlocked && !allDone ? accent : "rgba(200,195,185,0.18)"}`,
          color: unlocked && !allDone ? "#1a1208" : "rgba(235,230,220,0.85)",
          fontFamily: "Share Tech Mono,monospace", fontSize: 11, letterSpacing: "0.22em", fontWeight: 700,
          cursor: "pointer", borderRadius: 3,
          boxShadow: unlocked && !allDone ? `0 0 12px ${accent}55` : "none",
          transition: "all 0.15s",
        }}>✦ STORY {!allDone && `· CH.${String(next.num).padStart(2,"0")}`}</button>
        <button onClick={onOpenDmail} style={{
          padding: "10px 14px",
          background: "rgba(200,146,10,0.08)",
          border: "1px solid rgba(200,146,10,0.4)",
          color: "#f0d890",
          fontFamily: "Share Tech Mono,monospace", fontSize: 11, letterSpacing: "0.22em", fontWeight: 700,
          cursor: "pointer", borderRadius: 3,
          transition: "all 0.15s",
        }}>⚛ PHONEWAVE · D-MAIL</button>
      </div>
    </>
  );
}

function PhoneStat({ label, v }) {
  return (
    <div style={{ padding: "6px 8px", background: "rgba(2,6,18,0.5)", border: "1px solid rgba(200,195,185,0.1)", borderRadius: 3, textAlign: "center" }}>
      <div style={{ fontFamily: "Share Tech Mono,monospace", fontSize: 8, color: "rgba(200,195,185,0.5)", letterSpacing: "0.18em", marginBottom: 2 }}>{label}</div>
      <div style={{ fontFamily: "Share Tech Mono,monospace", fontSize: 15, fontWeight: 600, color: "rgba(235,230,220,0.92)" }}>{v}</div>
    </div>
  );
}

// ─── Floating Phonewave launcher (bottom-right) ─────────────────────────────
// ─── TITLE MENU floating button — bottom-right, above the music player ───────
function SaveLoadButton({ onClick }) {
  const [hover, setHover] = useState(false);
  return (
    <div style={{ position: "fixed", right: 20, bottom: 108, zIndex: 60 }}>
      <button onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "7px 13px",
        background: hover ? "rgba(200,146,10,0.16)" : "rgba(2,6,18,0.6)",
        border: `1px solid rgba(200,146,10,${hover ? 0.55 : 0.32})`,
        backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
        borderRadius: 4,
        cursor: "pointer",
        transition: "all 0.18s ease",
        boxShadow: hover
          ? "0 0 18px rgba(200,146,10,0.28)"
          : "0 2px 12px rgba(0,0,0,0.4)",
      }}>
        <span style={{ fontSize: 12, lineHeight: 1, color: hover ? "#f0d890" : "rgba(200,146,10,0.75)" }}>⊟</span>
        <span style={{
          fontFamily: "Share Tech Mono,monospace", fontSize: 11, letterSpacing: "0.28em",
          color: hover ? "#ffffff" : "rgba(220,210,190,0.78)", fontWeight: "700",
          textShadow: hover ? "0 0 8px rgba(232,184,92,0.6)" : "none",
        }}>TITLE MENU</span>
      </button>
    </div>
  );
}

function PhonewaveLauncher({ onClick, divergence, dmailCount }) {
  const [hover, setHover] = useState(false);
  return (
    <div style={{ position: "fixed", right: 156, bottom: 108, zIndex: 60 }}>
      <button onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "9px 16px 9px 12px",
        background: hover ? "rgba(200,146,10,0.16)" : "rgba(2,6,18,0.55)",
        border: `1px solid rgba(200,146,10,${hover ? 0.55 : 0.28})`,
        backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)",
        cursor: "pointer",
        transition: "all 0.18s ease",
        boxShadow: hover ? "0 0 20px rgba(200,195,185,0.09)" : "none",
      }}>
        <span style={{ fontSize: 15, lineHeight: 1 }}>⚛</span>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 1 }}>
          <span style={{ fontFamily: "Share Tech Mono,monospace", fontSize: 11, letterSpacing: "0.22em", color: hover ? "rgba(235,230,220,0.92)" : "rgba(200,146,10,0.75)" }}>D-MAIL</span>
          {dmailCount > 0 && <span style={{ fontFamily: "Share Tech Mono,monospace", fontSize: 9, letterSpacing: "0.1em", color: "rgba(200,195,185,0.25)" }}>{dmailCount} SENT</span>}
        </div>
      </button>
    </div>
  );
}

// ─── D-Mail compose modal ───────────────────────────────────────────────────
const DMAIL_TARGETS = [
  { id: "past_self", label: "PAST SELF · 6 min ago", note: "feedback loop · safe-ish" },
  { id: "daru",      label: "DARU · 3 days ago",      note: "lottery numbers approved" },
  { id: "mayuri",    label: "MAYURI · 1 week ago",    note: "convergence risk: HIGH" },
  { id: "kurisu",    label: "KURISU · before Akiba",  note: "convergence risk: ABSOLUTE" },
  { id: "moeka",     label: "MOEKA · before Rounder", note: "alters SERN attractor" },
  { id: "suzuha",    label: "2036 · SUZUHA",          note: "uplink to Resistance" },
];

function DMailCompose({ onClose, onSend }) {
  const [msg, setMsg] = useState("");
  const [target, setTarget] = useState(DMAIL_TARGETS[0].id);
  const [armed, setArmed] = useState(false);
  const [countdown, setCountdown] = useState(9);
  const [statusIdx, setStatusIdx] = useState(0);
  const max = 36;

  const STATUS_MSGS = [
    "COMPRESSING JELLY...",
    "ENCODING D-MAIL PAYLOAD...",
    "MICROWAVE ARRAY CHARGING...",
    "ESTABLISHING TEMPORAL LINK...",
    "ATTRACTOR FIELD DESTABILISING...",
    "FIRING — EL PSY KONGROO",
  ];

  useEffect(() => {
    if (!armed) return;
    const cdInterval = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 150);
    const stInterval = setInterval(() => setStatusIdx(i => Math.min(i + 1, STATUS_MSGS.length - 1)), 140);
    return () => { clearInterval(cdInterval); clearInterval(stInterval); };
  }, [armed]);

  const handleFire = () => {
    if (!msg.trim()) return;
    setArmed(true);
    setTimeout(() => onSend({ msg: msg.trim(), target }), 900);
  };

  const selectedTarget = DMAIL_TARGETS.find(t => t.id === target);

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 110,
      background: "rgba(2,5,15,0.82)", backdropFilter: "blur(8px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      animation: "bodyFadeIn 0.25s ease",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "min(560px,94vw)",
        background: armed
          ? "linear-gradient(180deg, rgba(18,4,4,0.99) 0%, rgba(4,10,24,0.99) 100%)"
          : "rgba(4,10,24,0.98)",
        border: `1px solid ${armed ? "rgba(200,80,60,0.55)" : "rgba(200,195,185,0.28)"}`,
        boxShadow: armed
          ? "0 0 60px rgba(200,80,60,0.18), 0 0 100px rgba(200,80,60,0.08)"
          : "0 0 50px rgba(200,195,185,0.10)",
        animation: "screenSlideIn 0.3s ease",
        transition: "border-color 0.4s, box-shadow 0.4s",
      }}>
        {/* Header */}
        <div style={{ padding: "14px 18px 12px", borderBottom: `1px solid ${armed ? "rgba(200,80,60,0.22)" : "rgba(200,195,185,0.12)"}`, background: "rgba(200,195,185,0.03)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontFamily: "Share Tech Mono,monospace", fontSize: 10, color: armed ? "rgba(220,100,80,0.7)" : "rgba(200,195,185,0.32)", letterSpacing: "0.28em" }}>// PHONEWAVE (NAME SUBJECT TO CHANGE) · FG #08</div>
            <div style={{ fontFamily: '"IM Fell English",serif', fontSize: 22, color: "rgba(235,230,220,0.92)", marginTop: 2 }}>D-Mail Transmitter</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
            {armed && (
              <div style={{
                fontFamily: "Share Tech Mono,monospace", fontSize: 32, color: "#e84040",
                fontWeight: 700, letterSpacing: "0.04em", lineHeight: 1,
                textShadow: "0 0 16px rgba(232,64,64,0.7)",
                animation: "pulse 0.4s steps(2) infinite",
              }}>T-0{countdown}</div>
            )}
            {!armed && <button onClick={onClose} style={{ background: "transparent", border: "1px solid rgba(200,195,185,0.15)", color: "rgba(210,210,210,0.5)", padding: "4px 10px", fontFamily: "Share Tech Mono,monospace", fontSize: 11, letterSpacing: "0.2em", cursor: "pointer" }}>× CLOSE</button>}
          </div>
        </div>

        {/* Waveform visualization — always visible, goes wild when armed */}
        <div style={{
          padding: "10px 18px 0",
          background: armed ? "rgba(40,4,4,0.4)" : "rgba(2,6,18,0.4)",
          borderBottom: `1px solid ${armed ? "rgba(200,80,60,0.18)" : "rgba(200,195,185,0.08)"}`,
          transition: "background 0.4s",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontFamily: "Share Tech Mono,monospace", fontSize: 9, color: armed ? "rgba(220,100,80,0.7)" : "rgba(200,195,185,0.3)", letterSpacing: "0.22em" }}>
              {armed ? STATUS_MSGS[statusIdx] : "// PHONEWAVE SIGNAL MONITOR"}
            </span>
            {armed && (
              <span style={{ fontFamily: "Share Tech Mono,monospace", fontSize: 9, color: "#e84040", letterSpacing: "0.18em", animation: "pulse 0.6s infinite" }}>● REC</span>
            )}
          </div>
          <DivergenceOscilloscope
            accent={armed ? "#e84040" : "#e8b850"}
            height={32}
            bars={24}
            wild={armed}
          />
          <div style={{ height: 8 }}/>
        </div>

        <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Target attractor */}
          <div>
            <div style={{ fontFamily: "Share Tech Mono,monospace", fontSize: 10, color: "rgba(200,195,185,0.35)", letterSpacing: "0.22em", marginBottom: 6 }}>TARGET ATTRACTOR</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {DMAIL_TARGETS.map(t => (
                <button key={t.id} onClick={() => setTarget(t.id)} disabled={armed} style={{
                  textAlign: "left", padding: "7px 12px",
                  background: target === t.id ? "rgba(200,146,10,0.10)" : "rgba(200,195,185,0.02)",
                  border: `1px solid ${target === t.id ? "rgba(232,184,92,0.45)" : "rgba(200,195,185,0.10)"}`,
                  borderLeft: target === t.id ? "3px solid #e8b850" : "3px solid transparent",
                  color: target === t.id ? "rgba(235,230,220,0.92)" : "rgba(190,175,130,0.6)",
                  fontFamily: "Share Tech Mono,monospace", fontSize: 11, letterSpacing: "0.1em",
                  cursor: armed ? "not-allowed" : "pointer", display: "flex", justifyContent: "space-between",
                  boxShadow: target === t.id ? "0 0 8px rgba(232,184,92,0.10)" : "none",
                  transition: "all 0.12s",
                }}>
                  <span>{t.label}</span>
                  <span style={{ color: "rgba(200,195,185,0.22)", fontSize: 10 }}>{t.note}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Payload input */}
          <div>
            <div style={{ fontFamily: "Share Tech Mono,monospace", fontSize: 10, color: "rgba(200,195,185,0.35)", letterSpacing: "0.22em", marginBottom: 6, display: "flex", justifyContent: "space-between" }}>
              <span>PAYLOAD · MAX {max} CHAR</span>
              <span style={{ color: msg.length > max * 0.85 ? (msg.length >= max ? "#cc4040" : "#e8a040") : "rgba(200,195,185,0.30)" }}>{msg.length}/{max}</span>
            </div>
            <textarea value={msg} onChange={e => setMsg(e.target.value.slice(0, max))} disabled={armed}
              placeholder="Lottery numbers · save Mayuri · don't trust Moeka..."
              rows={3} style={{
                width: "100%", padding: "10px 12px",
                background: "rgba(2,6,18,0.88)",
                border: `1px solid ${armed ? "rgba(200,80,60,0.4)" : "rgba(200,195,185,0.16)"}`,
                color: "#f3e8c8", fontFamily: "Share Tech Mono,monospace", fontSize: 12,
                letterSpacing: "0.08em", lineHeight: 1.6, outline: "none", resize: "none",
                boxShadow: msg.trim() && !armed ? "inset 0 0 14px rgba(232,184,92,0.05)" : "none",
              }}/>
          </div>

          {/* Warning banner */}
          <div style={{
            padding: "7px 10px",
            background: "rgba(150,30,30,0.08)", border: "1px solid rgba(180,60,60,0.22)",
            fontFamily: "Share Tech Mono,monospace", fontSize: 9, color: "rgba(220,130,130,0.70)",
            letterSpacing: "0.11em", lineHeight: 1.6,
          }}>
            ⚠ TRANSMISSION SHIFTS ATTRACTOR FIELD · CONVERGENCE RISK NON-ZERO · EVERY D-MAIL EDGES SERN CLOSER
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: "12px 18px", borderTop: `1px solid ${armed ? "rgba(200,80,60,0.22)" : "rgba(200,195,185,0.12)"}`,
          background: armed ? "rgba(30,4,4,0.5)" : "rgba(200,195,185,0.02)",
          display: "flex", gap: 10, alignItems: "center",
          transition: "background 0.4s",
        }}>
          <button onClick={handleFire} disabled={armed || !msg.trim()} style={{
            padding: "10px 24px",
            background: armed
              ? "linear-gradient(180deg, #8a1010 0%, #4a0a0a 100%)"
              : msg.trim()
              ? "linear-gradient(180deg, #c8920a 0%, #8a6010 100%)"
              : "rgba(200,195,185,0.04)",
            border: `1px solid ${armed ? "rgba(200,80,60,0.6)" : "rgba(200,195,185,0.35)"}`,
            color: armed ? "#ff8880" : msg.trim() ? "#02060e" : "rgba(210,210,210,0.30)",
            fontFamily: "Share Tech Mono,monospace", fontSize: 10, letterSpacing: "0.28em",
            cursor: armed || !msg.trim() ? "not-allowed" : "pointer", fontWeight: "bold",
            boxShadow: armed ? "0 0 16px rgba(200,40,40,0.35)" : msg.trim() ? "0 0 10px rgba(200,146,10,0.2)" : "none",
            transition: "all 0.2s",
          }}>{armed ? "▣ FIRING..." : "▶ FIRE D-MAIL"}</button>
          <div style={{ flex: 1 }}/>
          {armed && (
            <span style={{
              fontFamily: "Share Tech Mono,monospace", fontSize: 10,
              color: "rgba(220,100,80,0.85)", letterSpacing: "0.18em",
              animation: "pulse 0.5s infinite",
            }}>// ATTRACTOR FIELD SHIFTING</span>
          )}
          {!armed && selectedTarget && msg.trim() && (
            <span style={{ fontFamily: "Share Tech Mono,monospace", fontSize: 9, color: "rgba(200,195,185,0.28)", letterSpacing: "0.12em" }}>
              → {selectedTarget.label.split(" · ")[0].toUpperCase()}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function CollapsedStrip({ side, onClick }) {
  const [hover, setHover] = useState(false);
  const isLeft = side === "left";
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: 42, flexShrink: 0,
        position: "relative",
        background: hover
          ? "rgba(200,146,10,0.13)"
          : "rgba(3,7,18,0.85)",
        [isLeft ? "borderRight" : "borderLeft"]: hover
          ? "2px solid rgba(200,146,10,0.75)"
          : "2px solid rgba(200,146,10,0.32)",
        cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        writingMode: "vertical-rl",
        transform: isLeft ? "none" : "rotate(180deg)",
        fontFamily: "Share Tech Mono,monospace",
        fontSize: 11,
        letterSpacing: "0.32em",
        color: hover ? "rgba(240,216,144,1)" : "rgba(200,146,10,0.75)",
        textShadow: hover ? "0 0 10px rgba(240,200,80,0.7), 0 0 20px rgba(200,146,10,0.4)" : "none",
        boxShadow: hover
          ? (isLeft ? "inset -3px 0 12px rgba(200,146,10,0.12)" : "inset 3px 0 12px rgba(200,146,10,0.12)")
          : "none",
        transition: "all 0.18s ease",
        zIndex: 10,
        userSelect: "none",
      }}
    >
      {/* amber accent line on inner edge */}
      <div style={{
        position: "absolute",
        [isLeft ? "right" : "left"]: 0,
        top: "20%", bottom: "20%",
        width: 2,
        background: hover
          ? "linear-gradient(to bottom, transparent, rgba(200,146,10,0.85), transparent)"
          : "linear-gradient(to bottom, transparent, rgba(200,146,10,0.3), transparent)",
        transition: "all 0.18s",
        borderRadius: 2,
      }} />
      {/* arrows indicator */}
      <div style={{
        position: "absolute",
        top: isLeft ? "auto" : "auto",
        [isLeft ? "bottom" : "top"]: 16,
        fontSize: 14,
        color: hover ? "rgba(240,216,144,0.95)" : "rgba(200,146,10,0.5)",
        textShadow: hover ? "0 0 8px rgba(240,200,80,0.8)" : "none",
        letterSpacing: 0,
        transition: "all 0.18s",
        writingMode: "horizontal-tb",
        transform: isLeft ? "none" : "rotate(180deg)",
      }}>
        {isLeft ? "▶▶" : "◀◀"}
      </div>
      {isLeft ? "EXPAND FOLDERS" : "EXPAND PHONEWAVE"}
    </div>
  );
}
