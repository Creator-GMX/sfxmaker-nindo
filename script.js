/* ══════════════════════════════════════════════
   SFX Maker — script.js
   ══════════════════════════════════════════════ */

// ── AudioContext & Chain ───────────────────────
const audioCtx   = new (window.AudioContext || window.webkitAudioContext)();
const masterGain = audioCtx.createGain();
masterGain.gain.value = 0.7;

const reverbNode = audioCtx.createConvolver();
const reverbSend = audioCtx.createGain();
const dryChain   = audioCtx.createGain();
reverbSend.gain.value = 0.2;
dryChain.gain.value   = 1;

masterGain.connect(dryChain);
masterGain.connect(reverbSend);
dryChain.connect(audioCtx.destination);
reverbSend.connect(reverbNode);
reverbNode.connect(audioCtx.destination);

buildIR(audioCtx, reverbNode);

function buildIR(ctx, conv, dur = 2.5, decay = 2.5) {
  const sr  = ctx.sampleRate;
  const len = Math.ceil(sr * dur);
  const ir  = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++)
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  conv.buffer = ir;
}

// ── DOM ────────────────────────────────────────
const $ = id => document.getElementById(id);
const sequencerEl  = $('sequencer');
const noteLabelsEl = $('note-labels');
const beatRulerEl  = $('beat-ruler');
const playBtn      = $('play-btn');
const iconPlay     = $('icon-play');
const iconStop     = $('icon-stop');
const clearBtn     = $('clear-btn');
const randomBtn    = $('random-btn');
const trackGenBtn  = $('track-gen-btn');
const bpmInput     = $('bpm');
const bpmUp        = $('bpm-up');
const bpmDown      = $('bpm-down');
const oscTypeEl    = $('osc-type');
const scaleTypeEl  = $('scale-type');
const genreTypeEl  = $('genre-type');
const gridColsEl   = $('grid-cols');
const volumeEl     = $('volume');
const volumeVal    = $('volume-val');
const reverbEl     = $('reverb');
const reverbVal    = $('reverb-val');
const exportBtn    = $('export-btn');
const statusPill   = $('status-pill');
const statusLabel  = $('status-label');
const stepCounter  = $('step-counter');
const genToast     = $('gen-toast');
const genToastText = $('gen-toast-text');
const waveCanvas   = $('waveform-canvas');
const waveCtx      = waveCanvas.getContext('2d');

// ── Scales & Frequencies ──────────────────────
const SCALES = {
  major:      ['C5','B4','A4','G4','F4','E4','D4','C4'],
  minor:      ['A5','G5','F5','E5','D5','C5','B4','A4'],
  pentatonic: ['A5','G5','E5','D5','B4','A4','G4','E4'],
  blues:      ['A5','G5','Eb5','D5','C5','A4','G4','Eb4'],
  chromatic:  ['C5','B4','Bb4','A4','Ab4','G4','F#4','F4'],
  dorian:     ['D5','C5','Bb4','A4','G4','F4','E4','D4'],
  phrygian:   ['E5','D5','C5','Bb4','A4','G4','F4','E4'],
  japanese:   ['B4','A4','E4','D4','C4','B3','A3','E3'],
};

const FREQ = {
  'E3':164.81,'A3':220.00,'B3':246.94,
  'C4':261.63,'D4':293.66,'E4':329.63,'Eb4':311.13,'F4':349.23,
  'F#4':369.99,'G4':392.00,'Ab4':415.30,'A4':440.00,'Bb4':466.16,'B4':493.88,
  'C5':523.25,'D5':587.33,'Eb5':622.25,'E5':659.25,'F5':698.46,
  'F#5':739.99,'G5':783.99,'Ab5':830.61,'A5':880.00,'B5':987.77,
};

// ── Genre presets ─────────────────────────────
const GENRES = {
  action:        { bpmRange:[140,180], scale:'minor',     wave:'square',      rowDensity:[.2,.15,.3,.1,.25,.35,.1,.2], beatBias:1.8 },
  explore:       { bpmRange:[90,115],  scale:'pentatonic', wave:'pad',         rowDensity:[.12,.1,.18,.12,.1,.18,.1,.12], beatBias:1.2 },
  boss:          { bpmRange:[160,200], scale:'phrygian',  wave:'fm',          rowDensity:[.3,.2,.4,.1,.3,.4,.2,.3], beatBias:2.0 },
  ambient:       { bpmRange:[60,85],   scale:'major',     wave:'pad',         rowDensity:[.08,.06,.1,.06,.08,.06,.05,.08], beatBias:1.0 },
  chiptune_retro:{ bpmRange:[120,160], scale:'major',     wave:'pulse25',     rowDensity:[.25,.2,.3,.15,.25,.2,.15,.25], beatBias:1.6 },
  dungeon:       { bpmRange:[80,110],  scale:'dorian',    wave:'fm_bass',     rowDensity:[.1,.12,.1,.18,.15,.22,.2,.28], beatBias:1.5 },
  victory:       { bpmRange:[140,165], scale:'major',     wave:'chiptune',    rowDensity:[.35,.25,.3,.2,.15,.2,.1,.15], beatBias:2.0 },
};

// ── State ─────────────────────────────────────
const ROWS = 8;
let COLS = 16;
let isPlaying = false;
let currentStep = 0;
let gridState = makeGrid();
let schedulerInterval = null;
let nextNoteTime = 0;
const LOOKAHEAD = 0.12;
const SCHED_MS  = 20;

function makeGrid() {
  return Array(ROWS).fill(null).map(() => Array(COLS).fill(false));
}
function getFreqs() {
  return (SCALES[scaleTypeEl.value] || SCALES.major).map(n => FREQ[n] || 440);
}
function getNoteNames() {
  return SCALES[scaleTypeEl.value] || SCALES.major;
}

// ── Build Grid ────────────────────────────────
function createGrid() {
  const nc = parseInt(gridColsEl.value);
  const ns = Array(ROWS).fill(null).map((_, r) =>
    Array(nc).fill(false).map((_, c) => gridState[r]?.[c] ?? false)
  );
  COLS = nc; gridState = ns;

  // Note labels
  noteLabelsEl.innerHTML = '';
  getNoteNames().forEach(name => {
    const el = document.createElement('div');
    el.className = 'note-label';
    el.textContent = name;
    noteLabelsEl.appendChild(el);
  });

  // Beat ruler
  beatRulerEl.innerHTML = '';
  beatRulerEl.style.gridTemplateColumns = `repeat(${COLS}, var(--step-size))`;
  // Use flex instead
  beatRulerEl.style.display = 'flex';
  beatRulerEl.style.gap = 'var(--step-gap)';
  for (let c = 0; c < COLS; c++) {
    const m = document.createElement('div');
    m.className = 'beat-mark' + (c % 4 === 0 ? ' main' : '');
    m.textContent = c % 4 === 0 ? (c / 4 + 1) : '·';
    beatRulerEl.appendChild(m);
  }

  // Grid
  sequencerEl.innerHTML = '';
  sequencerEl.style.gridTemplateColumns = `repeat(${COLS}, var(--step-size))`;

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const step = document.createElement('div');
      let cls = 'step';
      if (gridState[r][c]) cls += ' active';
      if (c % 4 === 0)     cls += ' beat-col';
      if (c % 4 === 3 && c < COLS - 1) cls += ' group-sep';
      step.className = cls;
      step.dataset.row = r;
      step.dataset.col = c;

      // Touch & click
      let pointerDown = false;
      let initialState;
      step.addEventListener('pointerdown', e => {
        e.preventDefault();
        pointerDown = true;
        initialState = gridState[r][c];
        toggleStep(r, c, step, !initialState);
        step.setPointerCapture(e.pointerId);
      });
      step.addEventListener('pointerenter', () => {
        if (pointerDown) toggleStep(r, c, step, !initialState);
      });
      step.addEventListener('pointerup', () => { pointerDown = false; });

      sequencerEl.appendChild(step);
    }
  }
  updateCounter();
}

function toggleStep(r, c, el, val) {
  gridState[r][c] = val;
  el.classList.toggle('active', val);
}

function refreshGrid() {
  document.querySelectorAll('.step').forEach(el => {
    const r = +el.dataset.row, c = +el.dataset.col;
    el.classList.toggle('active', gridState[r][c]);
  });
}

function rebuildNoteLabels() {
  noteLabelsEl.innerHTML = '';
  getNoteNames().forEach(name => {
    const el = document.createElement('div');
    el.className = 'note-label';
    el.textContent = name;
    noteLabelsEl.appendChild(el);
  });
}

// ── Audio Scheduler ───────────────────────────
function stepDur() {
  return (60 / Math.max(40, Math.min(240, parseInt(bpmInput.value)||120))) / 4;
}

function scheduleNotes() {
  while (nextNoteTime < audioCtx.currentTime + LOOKAHEAD) {
    const snap  = currentStep;
    const delay = (nextNoteTime - audioCtx.currentTime) * 1000;
    setTimeout(() => highlightStep(snap), Math.max(0, delay));

    const freqs = getFreqs();
    for (let r = 0; r < ROWS; r++) {
      if (gridState[r][currentStep])
        playNote(freqs[r], audioCtx, nextNoteTime, masterGain);
    }

    nextNoteTime += stepDur();
    currentStep = (currentStep + 1) % COLS;
  }
}

function highlightStep(step) {
  document.querySelectorAll('.step').forEach(s => s.classList.remove('playing'));
  for (let r = 0; r < ROWS; r++) {
    const el = document.querySelector(`.step[data-row="${r}"][data-col="${step}"]`);
    if (el) {
      el.classList.add('playing');
      // Highlight note label
      noteLabelsEl.children[r]?.classList.add('lit');
    }
  }
  // Clear other labels
  [...noteLabelsEl.children].forEach((lbl, i) => {
    if (!gridState[i][step]) lbl.classList.remove('lit');
  });
  updateCounter(step);
  updateWaveform(step);
}

function updateCounter(step = 0) {
  stepCounter.textContent = `${String(step+1).padStart(2,'0')} / ${String(COLS).padStart(2,'0')}`;
}

function startSequencer() {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  isPlaying = true; currentStep = 0; nextNoteTime = audioCtx.currentTime;
  iconPlay.classList.add('hidden');
  iconStop.classList.remove('hidden');
  playBtn.classList.add('playing');
  statusPill.classList.add('playing');
  statusLabel.textContent = 'Tocando';
  schedulerInterval = setInterval(scheduleNotes, SCHED_MS);
}

function stopSequencer() {
  clearInterval(schedulerInterval);
  isPlaying = false;
  iconPlay.classList.remove('hidden');
  iconStop.classList.add('hidden');
  playBtn.classList.remove('playing');
  statusPill.classList.remove('playing');
  statusLabel.textContent = 'Pronto';
  document.querySelectorAll('.step').forEach(s => s.classList.remove('playing'));
  noteLabelsEl.querySelectorAll('.note-label').forEach(l => l.classList.remove('lit'));
  updateCounter(0);
}

playBtn.addEventListener('click', () => isPlaying ? stopSequencer() : startSequencer());

// ── Controls ──────────────────────────────────
bpmUp.addEventListener('click',   () => bpmInput.value = Math.min(240, parseInt(bpmInput.value)+5));
bpmDown.addEventListener('click', () => bpmInput.value = Math.max(40,  parseInt(bpmInput.value)-5));

volumeEl.addEventListener('input', () => {
  const v = volumeEl.value;
  volumeVal.textContent = v + '%';
  masterGain.gain.setTargetAtTime(v/100, audioCtx.currentTime, 0.01);
});

reverbEl.addEventListener('input', () => {
  const v = reverbEl.value / 100;
  reverbVal.textContent = reverbEl.value + '%';
  dryChain.gain.setTargetAtTime(1 - v*0.4, audioCtx.currentTime, 0.05);
  reverbSend.gain.setTargetAtTime(v*0.45, audioCtx.currentTime, 0.05);
});

clearBtn.addEventListener('click', () => {
  gridState = makeGrid().map((r,ri) => r.map(() => false));
  gridState = Array(ROWS).fill(null).map(() => Array(COLS).fill(false));
  document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
});

randomBtn.addEventListener('click', () => {
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      gridState[r][c] = Math.random() < (c%4===0 ? 0.35 : 0.14);
  refreshGrid();
});

gridColsEl.addEventListener('change', createGrid);
scaleTypeEl.addEventListener('change', rebuildNoteLabels);

// ── Track Generator ───────────────────────────
trackGenBtn.addEventListener('click', () => {
  const g = GENRES[genreTypeEl.value] || GENRES.action;

  bpmInput.value    = Math.floor(g.bpmRange[0] + Math.random()*(g.bpmRange[1]-g.bpmRange[0]));
  scaleTypeEl.value = g.scale;
  oscTypeEl.value   = g.wave;
  rebuildNoteLabels();

  gridState = Array(ROWS).fill(null).map(() => Array(COLS).fill(false));
  const half = Math.floor(COLS/2);

  for (let r = 0; r < ROWS; r++) {
    const bd = g.rowDensity[r] || 0.12;
    // First half: probabilistic
    for (let c = 0; c < half; c++) {
      let p = bd;
      if (c%4===0) p *= g.beatBias;
      else if (c%2===0) p *= 1.3;
      gridState[r][c] = Math.random() < p;
    }
    // Second half: motif mirror with variation
    for (let c = half; c < COLS; c++) {
      const src = c - half;
      if (gridState[r][src]) {
        const roll = Math.random();
        if (roll < 0.78) gridState[r][c] = true;
        else if (roll < 0.88 && r > 0) gridState[r-1][c] = true;
      } else if (Math.random() < bd * 0.25) {
        gridState[r][c] = true;
      }
    }
  }

  // Anchor bass
  [6,7].forEach(r => { if(r<ROWS){ gridState[r][0]=true; if(COLS>=8) gridState[r][8]=true; }});
  // Ensure some melody
  [0,1,2].forEach(r => {
    if (gridState[r].filter(Boolean).length < 2) {
      gridState[r][0] = true;
      gridState[r][Math.floor(COLS/4)] = true;
    }
  });

  refreshGrid();
  showToast('Trilha gerada! ✨');
  if (isPlaying) stopSequencer();
  setTimeout(startSequencer, 80);
});

function showToast(msg) {
  genToastText.textContent = msg;
  genToast.classList.remove('hidden');
  clearTimeout(genToast._t);
  genToast._t = setTimeout(() => genToast.classList.add('hidden'), 2500);
}

// ══════════════════════════════════════════════
//  SOUND ENGINES
// ══════════════════════════════════════════════

function playNote(freq, ctx, time, out) {
  if (audioCtx.state === 'suspended') return;
  switch (oscTypeEl.value) {
    case 'sine':      return basicOsc('sine',      freq, 0.14, ctx, time, out);
    case 'square':    return basicOsc('square',    freq, 0.14, ctx, time, out);
    case 'sawtooth':  return basicOsc('sawtooth',  freq, 0.14, ctx, time, out);
    case 'triangle':  return basicOsc('triangle',  freq, 0.14, ctx, time, out);
    case 'pulse25':   return synthPulse(freq, .25,  ctx, time, out);
    case 'pulse12':   return synthPulse(freq, .125, ctx, time, out);
    case 'chiptune':  return synthChiptune(freq,    ctx, time, out);
    case 'fatsaw':    return synthFatSaw(freq,      ctx, time, out);
    case 'supersquare': return synthSuperSquare(freq, ctx, time, out);
    case 'fm':        return synthFM(freq,2.0,3.0,.18, ctx, time, out);
    case 'fm_bass':   return synthFM(freq*.5,1.0,1.5,.35, ctx, time, out);
    case 'am':        return synthAM(freq,          ctx, time, out);
    case 'ringmod':   return synthRingMod(freq,     ctx, time, out);
    case 'karplus':   return synthKarplus(freq,     ctx, time, out);
    case 'noise_white': return synthNoise('white',.14, ctx, time, out);
    case 'noise_pink':  return synthNoise('pink', .14, ctx, time, out);
    case 'kick':      return synthKick(freq,        ctx, time, out);
    case 'snare':     return synthSnare(            ctx, time, out);
    case 'hihat':     return synthHihat(            ctx, time, out);
    case 'pad':       return synthPad(freq,         ctx, time, out);
    case 'bass':      return synthBass(freq,        ctx, time, out);
    case 'laser':     return synthLaser(freq,       ctx, time, out);
    case 'coin':      return synthCoin(freq,        ctx, time, out);
    case 'explosion': return synthExplosion(        ctx, time, out);
    default:          return basicOsc('square', freq, .14, ctx, time, out);
  }
}

/* Helpers */
function mkG(ctx, time, peak, dur, out) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, time);
  g.gain.linearRampToValueAtTime(peak, time+0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, time+dur);
  g.connect(out); return g;
}
function mkO(ctx, type, freq, time, dur, g) {
  const o = ctx.createOscillator();
  o.type = type; o.frequency.setValueAtTime(freq, time);
  o.connect(g); o.start(time); o.stop(time+dur+0.01); return o;
}

function basicOsc(type, freq, dur, ctx, time, out) {
  mkO(ctx, type, freq, time, dur, mkG(ctx, time, 0.14, dur, out));
}

function synthPulse(freq, duty, ctx, time, out) {
  const dur = 0.14;
  const g = mkG(ctx, time, 0.11, dur, out);
  mkO(ctx, 'square', freq, time, dur, g);
  const g2 = ctx.createGain(); g2.gain.value = -(1-duty*2)*0.5; g2.connect(out);
  const o2 = ctx.createOscillator(); o2.type='square';
  o2.frequency.setValueAtTime(freq,time); o2.detune.setValueAtTime(duty*120,time);
  o2.connect(g2); o2.start(time); o2.stop(time+dur+0.01);
}

function synthChiptune(freq, ctx, time, out) {
  const dur=.14;
  mkO(ctx,'square',freq,time,dur, mkG(ctx,time,.09,dur,out));
  mkO(ctx,'square',freq*2,time,dur, mkG(ctx,time,.05,dur,out));
}

function synthFatSaw(freq, ctx, time, out) {
  [-8,0,8].forEach(d => { const g=mkG(ctx,time,.05,.14,out); const o=mkO(ctx,'sawtooth',freq,time,.14,g); o.detune.setValueAtTime(d,time); });
}

function synthSuperSquare(freq, ctx, time, out) {
  [0,5,-5].forEach(d => { const g=mkG(ctx,time,.05,.14,out); const o=mkO(ctx,'square',freq,time,.14,g); o.detune.setValueAtTime(d,time); });
}

function synthFM(freq, ratio, depth, dur, ctx, time, out) {
  const g=mkG(ctx,time,.14,dur,out);
  const car=ctx.createOscillator(), mod=ctx.createOscillator(), mg=ctx.createGain();
  mg.gain.setValueAtTime(freq*ratio*depth,time); mg.gain.exponentialRampToValueAtTime(.001,time+dur);
  mod.frequency.setValueAtTime(freq*ratio,time);
  mod.connect(mg); mg.connect(car.frequency);
  car.frequency.setValueAtTime(freq,time); car.connect(g);
  mod.start(time); mod.stop(time+dur+.01);
  car.start(time); car.stop(time+dur+.01);
}

function synthAM(freq, ctx, time, out) {
  const dur=.15, g=mkG(ctx,time,.12,dur,out);
  mkO(ctx,'sawtooth',freq,time,dur,g);
  const lfo=ctx.createOscillator(), lg=ctx.createGain();
  lg.gain.value=.5; lfo.frequency.value=8;
  lfo.connect(lg); lg.connect(g.gain);
  lfo.start(time); lfo.stop(time+dur+.01);
}

function synthRingMod(freq, ctx, time, out) {
  const dur=.15, g=mkG(ctx,time,.12,dur,out);
  const car=ctx.createOscillator(), ring=ctx.createOscillator(), rg=ctx.createGain();
  rg.gain.value=1; car.type='sawtooth'; car.frequency.value=freq;
  ring.type='sine'; ring.frequency.value=freq*1.5;
  car.connect(rg); ring.connect(rg.gain); rg.connect(g);
  car.start(time); car.stop(time+dur+.01);
  ring.start(time); ring.stop(time+dur+.01);
}

function synthKarplus(freq, ctx, time, out) {
  const sr=ctx.sampleRate, period=Math.floor(sr/freq);
  const len=period+Math.floor(sr*.9);
  const buf=ctx.createBuffer(1,len,sr), d=buf.getChannelData(0);
  for (let i=0;i<period;i++) d[i]=Math.random()*2-1;
  for (let i=period;i<len;i++) d[i]=.5*(d[i-period]+d[i-period+1]);
  const src=ctx.createBufferSource(); src.buffer=buf;
  const g=ctx.createGain(); g.gain.setValueAtTime(.38,time);
  src.connect(g); g.connect(out); src.start(time);
}

function synthNoise(color, dur, ctx, time, out) {
  const sr=ctx.sampleRate, len=Math.ceil(sr*dur);
  const buf=ctx.createBuffer(1,len,sr), d=buf.getChannelData(0);
  if (color==='white') { for(let i=0;i<len;i++) d[i]=Math.random()*2-1; }
  else {
    let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
    for(let i=0;i<len;i++){
      const w=Math.random()*2-1;
      b0=.99886*b0+w*.0555179; b1=.99332*b1+w*.0750759;
      b2=.96900*b2+w*.1538520; b3=.86650*b3+w*.3104856;
      b4=.55000*b4+w*.5329522; b5=-.7616*b5-w*.0168980;
      d[i]=(b0+b1+b2+b3+b4+b5+b6+w*.5362)*.11; b6=w*.115926;
    }
  }
  const src=ctx.createBufferSource(); src.buffer=buf;
  const g=mkG(ctx,time,.14,dur,out);
  src.connect(g); src.start(time);
}

function synthKick(freq, ctx, time, out) {
  const g=ctx.createGain();
  g.gain.setValueAtTime(.8,time); g.gain.exponentialRampToValueAtTime(.0001,time+.4);
  g.connect(out);
  const o=ctx.createOscillator(); o.type='sine';
  o.frequency.setValueAtTime(freq*2,time); o.frequency.exponentialRampToValueAtTime(freq*.3,time+.15);
  o.connect(g); o.start(time); o.stop(time+.45);
}

function synthSnare(ctx, time, out) {
  const g1=ctx.createGain(); g1.gain.setValueAtTime(.3,time); g1.gain.exponentialRampToValueAtTime(.0001,time+.12); g1.connect(out);
  mkO(ctx,'triangle',180,time,.12,g1);
  synthNoise('white',.12,ctx,time,out);
}

function synthHihat(ctx, time, out) {
  const sr=ctx.sampleRate, len=Math.ceil(sr*.06);
  const buf=ctx.createBuffer(1,len,sr), d=buf.getChannelData(0);
  for(let i=0;i<len;i++) d[i]=Math.random()*2-1;
  const src=ctx.createBufferSource(); src.buffer=buf;
  const hp=ctx.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=9000;
  const g=ctx.createGain(); g.gain.setValueAtTime(.18,time); g.gain.exponentialRampToValueAtTime(.0001,time+.06);
  src.connect(hp); hp.connect(g); g.connect(out); src.start(time);
}

function synthPad(freq, ctx, time, out) {
  const dur=.65;
  [0,7,-7].forEach(det=>{
    const g=ctx.createGain(); g.gain.setValueAtTime(0,time);
    g.gain.linearRampToValueAtTime(.035,time+.09); g.gain.exponentialRampToValueAtTime(.0001,time+dur);
    g.connect(out);
    const o=ctx.createOscillator(); o.type='sine'; o.frequency.setValueAtTime(freq,time); o.detune.setValueAtTime(det,time);
    o.connect(g); o.start(time); o.stop(time+dur+.01);
    const g2=ctx.createGain(); g2.gain.setValueAtTime(0,time);
    g2.gain.linearRampToValueAtTime(.018,time+.12); g2.gain.exponentialRampToValueAtTime(.0001,time+dur);
    g2.connect(out);
    const o2=ctx.createOscillator(); o2.type='triangle'; o2.frequency.setValueAtTime(freq*2,time);
    o2.connect(g2); o2.start(time); o2.stop(time+dur+.01);
  });
}

function synthBass(freq, ctx, time, out) {
  const dur=.28, g=mkG(ctx,time,.28,dur,out);
  const lp=ctx.createBiquadFilter(); lp.type='lowpass';
  lp.frequency.setValueAtTime(900,time); lp.frequency.exponentialRampToValueAtTime(200,time+dur);
  const o=ctx.createOscillator(); o.type='sawtooth'; o.frequency.setValueAtTime(freq*.5,time);
  o.connect(lp); lp.connect(g); o.start(time); o.stop(time+dur+.01);
}

function synthLaser(freq, ctx, time, out) {
  const dur=.22, g=mkG(ctx,time,.18,dur,out);
  const o=ctx.createOscillator(); o.type='sawtooth';
  o.frequency.setValueAtTime(freq*4,time); o.frequency.exponentialRampToValueAtTime(freq*.5,time+dur);
  o.connect(g); o.start(time); o.stop(time+dur+.01);
}

function synthCoin(freq, ctx, time, out) {
  [freq,freq*1.5,freq*2].forEach((f,i)=>{
    const t=time+i*.04, g=mkG(ctx,t,.14,.09,out);
    mkO(ctx,'square',f,t,.09,g);
  });
}

function synthExplosion(ctx, time, out) {
  const dur=.55, g=ctx.createGain();
  g.gain.setValueAtTime(.4,time); g.gain.exponentialRampToValueAtTime(.0001,time+dur);
  const lp=ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=500;
  g.connect(lp); lp.connect(out);
  const sr=ctx.sampleRate, len=Math.ceil(sr*dur);
  const buf=ctx.createBuffer(1,len,sr), d=buf.getChannelData(0);
  for(let i=0;i<len;i++) d[i]=Math.random()*2-1;
  const src=ctx.createBufferSource(); src.buffer=buf;
  src.connect(g); src.start(time);
}

// ── Waveform Visualizer ───────────────────────
let wavePhase = 0;
let animFrame = null;

function resizeCanvas() {
  waveCanvas.width  = waveCanvas.offsetWidth;
  waveCanvas.height = waveCanvas.offsetHeight;
}

function updateWaveform(step) {
  if (animFrame) cancelAnimationFrame(animFrame);
  const cols = COLS;
  function draw() {
    resizeCanvas();
    const W = waveCanvas.width, H = waveCanvas.height;
    waveCtx.clearRect(0,0,W,H);

    // Draw grid state as a waveform line
    const active = [];
    for (let c = 0; c < cols; c++) {
      let count = 0;
      for (let r = 0; r < ROWS; r++) if (gridState[r][c]) count++;
      active.push(count / ROWS);
    }

    waveCtx.beginPath();
    waveCtx.strokeStyle = 'rgba(108,99,255,0.5)';
    waveCtx.lineWidth = 2;
    active.forEach((v, i) => {
      const x = (i / cols) * W;
      const y = H - v * H * 0.85 - 4;
      if (i===0) waveCtx.moveTo(x,y); else waveCtx.lineTo(x,y);
    });
    // Close path down
    waveCtx.lineTo(W, H); waveCtx.lineTo(0,H); waveCtx.closePath();
    const grad = waveCtx.createLinearGradient(0,0,0,H);
    grad.addColorStop(0,'rgba(108,99,255,0.25)');
    grad.addColorStop(1,'rgba(108,99,255,0)');
    waveCtx.fillStyle = grad;
    waveCtx.fill();
    waveCtx.stroke();

    // Playhead highlight
    if (isPlaying) {
      const px = (step / cols) * W;
      waveCtx.fillStyle = 'rgba(0,212,170,0.6)';
      waveCtx.fillRect(px-1, 0, 3, H);
    }
  }
  draw();
}

window.addEventListener('resize', () => { resizeCanvas(); updateWaveform(currentStep); });
resizeCanvas();
updateWaveform(0);

// ── Export ────────────────────────────────────
exportBtn.addEventListener('click', async () => {
  if (audioCtx.state === 'suspended') await audioCtx.resume();
  exportBtn.disabled = true;
  exportBtn.querySelector('span').textContent = 'Renderizando...';

  const bpm = parseInt(bpmInput.value)||120;
  const sd  = (60/bpm)/4;
  const dur = sd*COLS + 0.8;
  const sr  = 44100;
  const offCtx = new OfflineAudioContext(2, Math.ceil(sr*dur), sr);

  const offG = offCtx.createGain(); offG.gain.value = volumeEl.value/100;
  const offR = offCtx.createConvolver(); buildIR(offCtx, offR);
  const offRS = offCtx.createGain(); offRS.gain.value = reverbEl.value/100*0.4;
  offG.connect(offCtx.destination);
  offG.connect(offRS); offRS.connect(offR); offR.connect(offCtx.destination);

  const freqs = getFreqs();
  // Snapshot current osc type
  const oscSnap = oscTypeEl.value;
  const origGet = () => oscSnap;

  for (let c = 0; c < COLS; c++)
    for (let r = 0; r < ROWS; r++)
      if (gridState[r][c]) {
        // Temporarily patch oscTypeEl.value for offline
        const tmp = oscTypeEl.value;
        playNote(freqs[r], offCtx, c*sd, offG);
      }

  try {
    const rendered = await offCtx.startRendering();
    if (typeof lamejs !== 'undefined') encodeMP3(rendered, sr);
    else encodeWAV(rendered, sr);
  } catch(e) { alert('Erro: ' + e.message); }

  exportBtn.disabled = false;
  exportBtn.querySelector('span').textContent = 'Exportar MP3';
});

function encodeMP3(buf, sr) {
  const enc = new lamejs.Mp3Encoder(2, sr, 128);
  const L = buf.getChannelData(0), R = buf.numberOfChannels>1 ? buf.getChannelData(1) : L;
  const i16 = ch => { const a=new Int16Array(ch.length); for(let i=0;i<ch.length;i++) a[i]=ch[i]<0?ch[i]*32768:ch[i]*32767; return a; };
  const l16=i16(L), r16=i16(R), bs=1152, mp3=[];
  for(let i=0;i<l16.length;i+=bs){const c=enc.encodeBuffer(l16.subarray(i,i+bs),r16.subarray(i,i+bs));if(c.length>0)mp3.push(c);}
  const t=enc.flush(); if(t.length>0)mp3.push(t);
  dl(new Blob(mp3,{type:'audio/mp3'}),'sfxmaker.mp3');
}

function encodeWAV(buf, sr) {
  const L=buf.getChannelData(0), R=buf.numberOfChannels>1?buf.getChannelData(1):L;
  const len=L.length, ab=new ArrayBuffer(44+len*4), v=new DataView(ab);
  const ws=(o,s)=>{for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i));};
  ws(0,'RIFF');v.setUint32(4,36+len*4,true);ws(8,'WAVE');ws(12,'fmt ');
  v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,2,true);
  v.setUint32(24,sr,true);v.setUint32(28,sr*4,true);v.setUint16(32,4,true);v.setUint16(34,16,true);
  ws(36,'data');v.setUint32(40,len*4,true);
  let off=44;
  for(let i=0;i<len;i++){v.setInt16(off,Math.max(-1,Math.min(1,L[i]))*0x7FFF,true);off+=2;v.setInt16(off,Math.max(-1,Math.min(1,R[i]))*0x7FFF,true);off+=2;}
  dl(new Blob([ab],{type:'audio/wav'}),'sfxmaker.wav');
}

function dl(blob, name) {
  const url=URL.createObjectURL(blob);
  Object.assign(document.createElement('a'),{href:url,download:name}).click();
  setTimeout(()=>URL.revokeObjectURL(url),5000);
}

// ── Init ─────────────────────────────────────
createGrid();
