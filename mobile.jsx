// Mobile tuner mockup — компактный экран для iOS / Android

const M_NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const M_STRINGS = [
  { name: '6', note: 'E', octave: 2, freq: 82.41 },
  { name: '5', note: 'A', octave: 2, freq: 110.00 },
  { name: '4', note: 'D', octave: 3, freq: 146.83 },
  { name: '3', note: 'G', octave: 3, freq: 196.00 },
  { name: '2', note: 'B', octave: 3, freq: 246.94 },
  { name: '1', note: 'E', octave: 4, freq: 329.63 },
];

function mClamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function mMedian(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mRefScale(refA) {
  return (refA || 440) / 440;
}

function mCorrectedPitchForString(freq, targetFreq, maxHarmonic = 4) {
  let best = { freq, cents: 1200 * Math.log2(freq / targetFreq), harmonic: 1, score: Infinity };
  [1, 2, 3, 4].filter(h => h <= maxHarmonic).forEach((harmonic) => {
    const corrected = freq / harmonic;
    const cents = 1200 * Math.log2(corrected / targetFreq);
    const score = Math.abs(cents) + (harmonic - 1) * 18;
    if (score < best.score) best = { freq: corrected, cents, harmonic, score };
  });
  return best;
}

function mNearestStringMatch(freq, refScale) {
  let best = { idx: 0, freq, cents: 0, harmonic: 1, score: Infinity };
  M_STRINGS.forEach((s, idx) => {
    const match = mCorrectedPitchForString(freq, s.freq * refScale, idx >= 4 ? 1 : 4);
    if (match.score < best.score) best = { idx, ...match };
  });
  return best;
}

// ─── Mini VU (mobile) ───────────────────────────────────────────────
function MobileVU({ cents, theme, lampColor, lampOn, inTune, signal = false, readingReady = false, springK = 0.06, springD = 0.88 }) {
  const isMid = theme === 'midnight';
  const ink = isMid ? '#f3d58a' : '#1a1612';
  const needleInk = isMid ? '#ffe7a3' : '#1a1612';
  const pivotInk = isMid ? '#d69a38' : '#1a1612';
  const hot = isMid ? '#ff8a4a' : '#c83a16';

  const targetCents = Math.max(-50, Math.min(50, cents ?? 0));
  const angle = (targetCents / 50) * 55;
  const [a, setA] = React.useState(0);
  const aRef = React.useRef(0); const vRef = React.useRef(0);
  const kRef = React.useRef(springK);
  const dRef = React.useRef(springD);
  React.useEffect(() => { kRef.current = springK; }, [springK]);
  React.useEffect(() => { dRef.current = springD; }, [springD]);
  React.useEffect(() => {
    let raf;
    const tick = () => {
      const dx = angle - aRef.current;
      vRef.current = (vRef.current + dx * kRef.current) * dRef.current;
      aRef.current += vRef.current;
      setA(aRef.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [angle]);

  const bgTop = isMid ? '#1a3550' : '#f4ead0';
  const bgMid = isMid ? '#1a3550' : '#ead9a8';
  const bgBot = isMid ? '#1a3550' : '#d4bf86';

  const cx = 500, cy = 480, r = 380;
  const ticks = [];
  for (let v = -50; v <= 50; v += 5) {
    const isMajor = v % 10 === 0;
    const ang = (v / 50) * 55;
    const rad = (ang - 90) * Math.PI / 180;
    const len = isMajor ? 24 : 14;
    const w = isMajor ? 2.4 : 1.4;
    const x1 = cx + Math.cos(rad) * r;
    const y1 = cy + Math.sin(rad) * r;
    const x2 = cx + Math.cos(rad) * (r - len);
    const y2 = cy + Math.sin(rad) * (r - len);
    const inHot = v >= 20;
    ticks.push(<line key={'t'+v} x1={x1} y1={y1} x2={x2} y2={y2}
      stroke={inHot ? hot : ink} strokeWidth={w}
      opacity={isMid && !inHot ? 0.82 : 1} />);
    if (isMajor) {
      const lx = cx + Math.cos(rad) * (r - 50);
      const ly = cy + Math.sin(rad) * (r - 50);
      ticks.push(<text key={'l'+v} x={lx} y={ly}
        textAnchor="middle" dominantBaseline="middle"
        fill={inHot ? hot : ink}
        opacity={isMid && !inHot ? 0.9 : 1}
        fontFamily="'Helvetica Neue', sans-serif"
        fontWeight={v === 0 ? 700 : 600}
        fontSize={v === 0 ? 44 : 34}
        transform={`rotate(${ang},${lx},${ly})`}>
        {v === 0 ? '0' : (v > 0 ? '+' + (v/10) : (v/10))}
      </text>);
    }
  }
  const arcPath = (rr, fA, tA) => {
    const a1 = (fA - 90) * Math.PI / 180;
    const a2 = (tA - 90) * Math.PI / 180;
    return `M ${cx + Math.cos(a1)*rr} ${cy + Math.sin(a1)*rr} A ${rr} ${rr} 0 0 1 ${cx + Math.cos(a2)*rr} ${cy + Math.sin(a2)*rr}`;
  };

  // Горизонтальный индикатор:
  //  • в нуле — одна сплошная красная линия (locked)
  //  • при расстройстве полосы разъезжаются от центра к краям, становятся голубыми
  const absC = Math.min(50, Math.abs(targetCents));
  const locked = signal && inTune;
  const hasStableRead = signal && readingReady;
  // прогресс расстройки: 0 = в нуле, 1 = край
  const detune = absC / 50;
  // в lock — полосы НЕ смыкаются полностью, оставляем зазор для разряда
  const barW = locked ? 42 : hasStableRead ? (50 - detune * 36) : 14;
  // ширина «коридора» разряда между концами полос (в % от шкалы)
  const sparkGap = locked ? (100 - barW * 2) : 0;

  return (
    <div className="m-vu">
      <div className={`m-hbar ${locked ? 'locked' : ''}`}>
        <div className="m-hbar-track" />
        <div className="m-hbar-left"  style={{ width: `${barW}%` }} />
        <div className="m-hbar-right" style={{ width: `${barW}%` }} />
        <div className="m-hbar-spark-glow" style={{ width: `${Math.max(sparkGap * 1.4, 18)}%` }} />
        <div className="m-hbar-terminal left" />
        <div className="m-hbar-terminal right" />
        <div className="m-hbar-spark" style={{ width: `${sparkGap}%` }}>
          <svg viewBox="0 0 100 60" preserveAspectRatio="none">
            {/* мягкое подложечное свечение по основному стволу */}
            <path className="m-hbar-bolt-glow" d="M 0 30 L 12 18 L 22 38 L 32 14 L 44 42 L 56 16 L 68 40 L 78 20 L 90 38 L 100 30" />
            {/* основной ствол молнии */}
            <path className="m-hbar-bolt" d="M 0 30 L 12 18 L 22 38 L 32 14 L 44 42 L 56 16 L 68 40 L 78 20 L 90 38 L 100 30" />
            {/* ветви */}
            <path className="m-hbar-bolt-branch" d="M 22 38 L 28 50 L 33 46" />
            <path className="m-hbar-bolt-branch" d="M 44 42 L 48 54 L 52 50" />
            <path className="m-hbar-bolt-branch" d="M 32 14 L 36 4  L 40 8" />
            <path className="m-hbar-bolt-branch" d="M 68 40 L 72 52 L 76 48" />
            <path className="m-hbar-bolt-branch" d="M 56 16 L 60 6  L 64 10" />
            <path className="m-hbar-bolt-branch" d="M 78 20 L 82 8  L 86 12" />
          </svg>
        </div>
        <div className="m-hbar-lock" />
        <div className="m-hbar-center" />
      </div>
      <div className="m-vu-lamp" style={{
        opacity: lampOn ? (isMid ? 0 : 1) : 0.1,
        background: `radial-gradient(ellipse at 50% 0%, ${lampColor}cc 0%, ${lampColor}55 25%, transparent 60%)`,
      }} />
      <div className="m-vu-glare" />
      <svg viewBox="0 0 1000 560" className="m-vu-svg" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="mScaleBg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={bgTop} />
            <stop offset="50%" stopColor={bgMid} />
            <stop offset="100%" stopColor={bgBot} />
          </linearGradient>
          <radialGradient id="mLampGlow" cx="50%" cy="0%" r="70%">
            <stop offset="0%" stopColor={lampColor} stopOpacity="0.45" />
            <stop offset="40%" stopColor={lampColor} stopOpacity="0.15" />
            <stop offset="100%" stopColor={lampColor} stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="1000" height="560" fill="url(#mScaleBg)" />
        {lampOn && !isMid && <rect width="1000" height="560" fill="url(#mLampGlow)" />}

        <text x="500" y="68" textAnchor="middle"
              fontFamily="'Helvetica Neue', sans-serif"
              fontSize="18" letterSpacing="6" fontWeight="500" fill={ink}>
          GUITAR TUNING
        </text>

        <path d={arcPath(r, -55, 55)} fill="none" stroke={ink} strokeWidth="1.5" />
        <path d={arcPath(r+5, 20, 55)} fill="none" stroke={hot} strokeWidth="6" />
        {ticks}

        <text x={cx} y={cy - 50} textAnchor="middle"
              fontFamily="'Helvetica Neue', sans-serif"
              fontSize="14" letterSpacing="3" fill={ink} opacity="0.7">
          CENTS · ×10
        </text>
        <text x={cx - 250} y={cy - 8} textAnchor="start"
              fontFamily="'Times New Roman', serif" fontStyle="italic"
              fontSize="58" fill={ink}>
          GR-100
        </text>

        {/* стрелка */}
        <g transform={`rotate(${a} ${cx} ${cy})`}>
          <line x1={cx} y1={cy} x2={cx} y2={cy + 50}
                stroke={needleInk} strokeWidth="5" strokeLinecap="round" />
          <circle cx={cx} cy={cy + 50} r="9" fill={needleInk} />
          <line x1={cx} y1={cy} x2={cx} y2={cy - r + 18}
                stroke={needleInk} strokeWidth="4" strokeLinecap="round" />
          <polygon points={`${cx-5.5},${cy-r+30} ${cx+5.5},${cy-r+30} ${cx},${cy-r+10}`} fill={needleInk} />
        </g>
        <circle cx={cx} cy={cy} r="18" fill={pivotInk} />
        <circle cx={cx} cy={cy} r="4" fill="#0a0807" />
      </svg>
      <div className="m-vu-bezel" />
    </div>
  );
}

// ─── Mobile shell ───────────────────────────────────────────────────
function MobileTuner({
  initialTheme = 'cream',
  initialActive = 0,
  initialCents = -8,
  signal = true,
  inTune = false,
  readingReady = false,
  onEngageMic = null,
  micRunning = false,
  inputFreq = null,
  autoIdx = 0,
  onSettingsChange = null,
  onTuningTargetChange = null,
}) {
  const [theme, setTheme] = React.useState(initialTheme);
  const [activeIdx, setActiveIdx] = React.useState(initialActive);
  const [mode, setMode] = React.useState('AUTO');
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [promoOpen, setPromoOpen] = React.useState(false);
  const [needleSpeed, setNeedleSpeed]   = React.useState(0.5);
  const [sensitivity, setSensitivity]   = React.useState(0.95);
  const [refA, setRefA]                 = React.useState(440);

  React.useEffect(() => {
    if (mode === 'AUTO' && signal) setActiveIdx(autoIdx);
  }, [autoIdx, mode, signal]);

  React.useEffect(() => {
    onSettingsChange?.({ needleSpeed, sensitivity, refA });
  }, [needleSpeed, sensitivity, refA]);
  React.useEffect(() => {
    onTuningTargetChange?.({ mode, activeIdx, refA });
  }, [mode, activeIdx, refA]);
  const [demo, setDemo] = React.useState(false);
  const [demoCents, setDemoCents] = React.useState(0);
  const [demoString, setDemoString] = React.useState(0);
  const lampColor = theme === 'midnight' ? '#a4d8ff' : '#ffb24a';
  const s = M_STRINGS[demo ? demoString : activeIdx];
  const cents = demo ? demoCents : initialCents;
  const readoutLocked = (signal && inTune) || (demo && Math.abs(cents) <= 2);
  const targetFreq = s.freq * mRefScale(refA);
  const freq = demo ? targetFreq * Math.pow(2, cents / 1200) : (signal && inputFreq ? inputFreq : targetFreq * Math.pow(2, cents / 1200));

  // self-test demo: стрелка плывёт, струны переключаются по очереди
  React.useEffect(() => {
    if (!demo) return;
    let raf, t0 = performance.now();
    const tick = (now) => {
      const ts = (now - t0) / 1000;
      // широкая волна ±35¢ с проходом через 0 (включая lock-вспышку)
      const v = Math.sin(ts * 1.4) * 30 + Math.sin(ts * 0.6) * 10;
      setDemoCents(Math.round(v));
      // струны переключаются каждые ~1.6s
      setDemoString(Math.floor(ts / 1.6) % 6);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [demo]);

  const blockLogoNativeMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div className={`m-shell theme-${theme}`}>
      <div className="m-safe-top" />

      {/* Top bar */}
      <div className="m-top">
        <div className="m-top-logo" onClick={() => setTheme(t => t === 'midnight' ? 'cream' : 'midnight')}>
          <svg viewBox="0 0 32 32" width="20" height="20" fill="none">
            {(() => {
              const cx=16,cy=16,turns=3.25,steps=240,maxR=12,start=-Math.PI/2;
              const pts=[];
              for(let i=0;i<=steps;i++){const t=i/steps;const th=start+t*turns*2*Math.PI;const r=t*maxR;const x=cx+Math.cos(th)*r;const y=cy+Math.sin(th)*r;pts.push((i===0?'M':'L')+x.toFixed(2)+' '+y.toFixed(2));}
              return <path d={pts.join(' ')} stroke={theme==='midnight'?'#2a1a08':'#2a241a'} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />;
            })()}
          </svg>
        </div>
        <div className="m-top-lamps">
          <div className="m-mini-lamp">
            <div className="m-mini-dot" style={{
              background: '#ff5a1f',
              boxShadow: '0 0 6px rgba(255,90,30,0.7), inset 0 0 3px rgba(255,255,255,0.3)'
            }} />
            <div className="m-mini-label">PWR</div>
          </div>
          <div className="m-mini-lamp">
            <div className="m-mini-dot" style={{
              background: signal ? '#3ad17a' : '#1a1612',
              boxShadow: signal ? '0 0 6px rgba(58,209,122,0.7), inset 0 0 3px rgba(255,255,255,0.3)' : 'inset 0 1px 2px rgba(0,0,0,0.6)'
            }} />
            <div className="m-mini-label">SIG</div>
          </div>
          <div className="m-mini-lamp">
            <div className="m-mini-dot" style={{
              background: inTune ? '#3ad17a' : '#1a1612',
              boxShadow: inTune ? '0 0 8px rgba(58,209,122,0.9), inset 0 0 3px rgba(255,255,255,0.4)' : 'inset 0 1px 2px rgba(0,0,0,0.6)'
            }} />
            <div className="m-mini-label">LCK</div>
          </div>
        </div>
        <div className="m-ref-pill">
          <div className="m-ref-pill-label">REF · A</div>
          <div className="m-ref-pill-val">{refA} Hz</div>
        </div>
      </div>

      {/* VU */}
      <MobileVU cents={cents} theme={theme} lampColor={lampColor} lampOn={true}
        inTune={inTune || (demo && Math.abs(demoCents) <= 2)}
        signal={signal || demo}
        readingReady={readingReady || demo}
        springK={0.03 + needleSpeed * 0.09} springD={0.92 - needleSpeed * 0.10} />

      {/* Readout */}
      <div className="m-readout">
        <div className="m-readout-cell note">
          <div className="m-readout-label">NOTE</div>
          <div className="m-readout-note">{s.note}<span className="oct">{s.octave}</span></div>
        </div>
        <div className="m-readout-cell">
          <div className="m-readout-label">FREQ · Hz</div>
          <div className="m-readout-mono">{freq.toFixed(2)}</div>
        </div>
        <div className={`m-readout-cell cents ${readoutLocked ? 'locked' : ''}`}>
          <div className="m-readout-label">CENTS</div>
          <div className="m-readout-mono">{cents > 0 ? '+' : ''}{cents}<span>¢</span></div>
        </div>
      </div>

      {/* Strings */}
      <div className="m-strings-section">
        <div className="m-strings-head">
          <div className="m-mode-row">
            <button className={`m-mode-btn ${mode==='AUTO'?'on':''}`} onClick={()=>setMode('AUTO')}>AUTO</button>
            <button className={`m-mode-btn ${mode==='MANUAL'?'on':''}`} onClick={()=>setMode('MANUAL')}>MANUAL</button>
          </div>
          <div className="m-tuning-label">STD · E A D G B E</div>
        </div>
        <div className="m-strings-row">
          {M_STRINGS.map((str, i) => {
            const isActive = i === activeIdx && (mode === 'MANUAL' || signal || demo);
            return (
              <button key={i} className="m-string-btn" onClick={() => { setActiveIdx(i); setMode('MANUAL'); }}>
                <div className="m-lamp-cap">
                  <div className="m-lamp" style={{
                    opacity: isActive ? 1 : 0.1,
                    background: isActive
                      ? `radial-gradient(circle at 50% 40%, #fff 0%, ${lampColor} 35%, ${lampColor}88 65%, transparent 100%)`
                      : `radial-gradient(circle at 50% 40%, ${lampColor}66 0%, ${lampColor}22 60%, transparent 100%)`,
                    boxShadow: isActive ? `0 0 16px 3px ${lampColor}cc, 0 0 32px 8px ${lampColor}55` : 'none',
                  }} />
                  {isActive && inTune && <div className="m-lamp-tune" />}
                </div>
                <div className="m-string-plate">
                  <div className="m-string-num">{str.name}</div>
                  <div className="m-string-note">{str.note}<span className="oct">{str.octave}</span></div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Marquee */}
      <div className="m-marquee" aria-label="GEN RUBIT DESIGN">
        <div className="m-marquee-track">
          {Array.from({length: 8}).map((_, i) => (
            <span key={i}>
              {'GEN\u00a0RUBIT\u00a0DESIGN'.split('').map((ch, j) => (
                <span key={j} className="m-g-ch" style={{
                  animationDelay: `${(i * 13 + j * 7) % 50 * 0.13}s`,
                  animationDuration: `${3 + ((i * 3 + j) % 7) * 0.4}s`,
                }}>{ch === ' ' ? '\u00a0' : ch}</span>
              ))}
              <span className="m-g-ch sep">&nbsp;·&nbsp;</span>
            </span>
          ))}
        </div>
      </div>

      {/* Dock */}
      <div className="m-dock">
        <button className="m-icon-btn m-logo-btn" title="Gen Rubit"
                aria-label="Open Gen Rubit"
                onClick={() => setPromoOpen(true)}
                onContextMenu={blockLogoNativeMenu} />
        <button className={`m-mic-btn ${micRunning ? 'running' : ''}`} onClick={onEngageMic}>
          <span className="m-mic-dot" />
          {micRunning ? 'STOP MIC' : 'ENGAGE MIC'}
        </button>
        <button className="m-icon-btn" title="Settings" onClick={() => setSettingsOpen(true)}>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>

      <div className="m-safe-bottom" />

      {settingsOpen && (
        <div className="m-settings-overlay" onClick={() => setSettingsOpen(false)}>
          <div className="m-settings-sheet" onClick={e => e.stopPropagation()}>
            <div className="m-settings-handle" />
            <div className="m-settings-title">SETTINGS</div>

            <div className="m-settings-row">
              <div className="m-settings-label">NEEDLE RESPONSE</div>
              <div className="m-settings-slider-row">
                <span className="m-settings-hint">SMOOTH</span>
                <input className="m-settings-slider" type="range" min="0" max="1" step="0.05"
                  value={needleSpeed} onChange={e => setNeedleSpeed(+e.target.value)} />
                <span className="m-settings-hint">FAST</span>
              </div>
            </div>

            <div className="m-settings-row">
              <div className="m-settings-label">SENSITIVITY</div>
              <div className="m-settings-slider-row">
                <span className="m-settings-hint">LOW</span>
                <input className="m-settings-slider" type="range" min="0" max="1" step="0.05"
                  value={sensitivity} onChange={e => setSensitivity(+e.target.value)} />
                <span className="m-settings-hint">HIGH</span>
              </div>
            </div>

            <div className="m-settings-row">
              <div className="m-settings-label">REF · A</div>
              <div className="m-settings-pills">
                {[432, 440, 442].map(hz => (
                  <button key={hz} className={`m-settings-pill ${refA === hz ? 'on' : ''}`}
                    onClick={() => setRefA(hz)}>{hz} Hz</button>
                ))}
              </div>
            </div>

            <button className="m-settings-close" onClick={() => setSettingsOpen(false)}>CLOSE</button>
          </div>
        </div>
      )}

      {promoOpen && (
        <div className="m-promo-overlay" onClick={() => setPromoOpen(false)}>
          <div className="m-promo-sheet" onClick={e => e.stopPropagation()}>
            <div className="m-settings-handle" />
            <div className="m-promo-head">
              <div className="m-promo-mark" />
              <div>
                <div className="m-promo-kicker">GEN RUBIT</div>
                <div className="m-promo-title">SIGNAL BAY</div>
              </div>
            </div>
            <div className="m-promo-feature">
              <div className="m-promo-product">GR NEXT</div>
              <div className="m-promo-copy">coming soon</div>
            </div>
            <div className="m-promo-grid">
              <div className="m-promo-slot">
                <span>01</span>
                AUDIO TOOLS
              </div>
              <div className="m-promo-slot">
                <span>02</span>
                DESIGN LAB
              </div>
            </div>
            <button className="m-settings-close" onClick={() => setPromoOpen(false)}>CLOSE</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Pitch detection (ACF2+) ────────────────────────────────────────
function noteFromFreq(freq) {
  return Math.round(12 * Math.log2(freq / 440) + 69);
}
function freqFromNote(n) {
  return 440 * Math.pow(2, (n - 69) / 12);
}
function centsOff(freq, note) {
  return Math.round(1200 * Math.log2(freq / freqFromNote(note)));
}
// McLeod Pitch Method — надёжное определение фундаментала для гитары
function detectPitch(buf, sampleRate, rmsThreshold, { preferEarly = true, minPeak = 0.48 } = {}) {
  const N = buf.length;

  let mean = 0;
  for (let i = 0; i < N; i++) mean += buf[i];
  mean /= N;

  let rms = 0;
  const x = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
    const v = (buf[i] - mean) * w;
    x[i] = v;
    rms += v * v;
  }
  rms = Math.sqrt(rms / N);
  if (rms < rmsThreshold) return null;

  // Диапазон поиска: только гитарные частоты 70–420 Гц
  const tauMin = Math.floor(sampleRate / 430);
  const tauMax = Math.min(Math.ceil(sampleRate / 65), N - 2);

  // Префиксные суммы квадратов для быстрого вычисления m'(τ)
  const prefix = new Float64Array(N + 1);
  for (let i = 0; i < N; i++) prefix[i + 1] = prefix[i] + x[i] * x[i];
  const totalSq = prefix[N];

  // NSDF(τ) = 2·r(τ) / m'(τ) — нормализованная функция (МПМ)
  const nsdf = new Float32Array(tauMax - tauMin + 1);
  for (let tau = tauMin; tau <= tauMax; tau++) {
    let r = 0;
    const len = N - tau;
    for (let j = 0; j < len; j++) r += x[j] * x[j + tau];
    const m = prefix[len] + totalSq - prefix[tau];
    nsdf[tau - tauMin] = m > 1e-10 ? (2 * r) / m : 0;
  }

  // Находим все локальные максимумы
  let peakMax = 0;
  const peaks = [];
  for (let i = 1; i < nsdf.length - 1; i++) {
    if (nsdf[i] > nsdf[i - 1] && nsdf[i] >= nsdf[i + 1]) {
      if (nsdf[i] > peakMax) peakMax = nsdf[i];
      peaks.push(i);
    }
  }
  if (peaks.length === 0 || peakMax < minPeak) return null;

  let T0 = -1;
  if (preferEarly) {
    // Берём ранний устойчивый пик: на низких струнах фундаментал часто слабее обертонов.
    for (const p of peaks) {
      if (nsdf[p] >= 0.62 * peakMax && nsdf[p] >= 0.36) { T0 = p; break; }
    }
  } else {
    for (const p of peaks) {
      if (nsdf[p] >= peakMax) { T0 = p; break; }
    }
  }
  if (T0 < 1 || T0 >= nsdf.length - 1) return null;

  const tau = T0 + tauMin;
  const clarity = nsdf[T0];

  // Параболическая интерполяция для точности до доли сэмпла
  const idx = tau - tauMin;
  const y1 = nsdf[idx - 1], y2 = nsdf[idx], y3 = nsdf[idx + 1];
  const a = (y1 + y3 - 2 * y2) / 2;
  const b = (y3 - y1) / 2;
  let tFine = tau;
  if (Math.abs(a) > 1e-12) tFine -= b / (2 * a);

  const freq = sampleRate / tFine;
  if (!Number.isFinite(freq) || freq < 65 || freq > 430) return null;
  return { freq, clarity, rms };
}

function detectPitchForTarget(buf, sampleRate, rmsThreshold, targetFreq, { maxHarmonic = 4, centsRange = 140 } = {}) {
  const N = buf.length;

  let mean = 0;
  for (let i = 0; i < N; i++) mean += buf[i];
  mean /= N;

  let rms = 0;
  const x = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
    const v = (buf[i] - mean) * w;
    x[i] = v;
    rms += v * v;
  }
  rms = Math.sqrt(rms / N);
  if (rms < rmsThreshold) return null;

  const tauMin = Math.floor(sampleRate / 430);
  const tauMax = Math.min(Math.ceil(sampleRate / 65), N - 2);
  const prefix = new Float64Array(N + 1);
  for (let i = 0; i < N; i++) prefix[i + 1] = prefix[i] + x[i] * x[i];
  const totalSq = prefix[N];

  const nsdf = new Float32Array(tauMax - tauMin + 1);
  for (let tau = tauMin; tau <= tauMax; tau++) {
    let r = 0;
    const len = N - tau;
    for (let j = 0; j < len; j++) r += x[j] * x[j + tau];
    const m = prefix[len] + totalSq - prefix[tau];
    nsdf[tau - tauMin] = m > 1e-10 ? (2 * r) / m : 0;
  }

  let best = null;
  for (let harmonic = 1; harmonic <= maxHarmonic; harmonic++) {
    const expected = targetFreq * harmonic;
    const minFreq = expected / Math.pow(2, centsRange / 1200);
    const maxFreq = expected * Math.pow(2, centsRange / 1200);
    const fromTau = Math.max(tauMin + 1, Math.floor(sampleRate / maxFreq));
    const toTau = Math.min(tauMax - 1, Math.ceil(sampleRate / minFreq));

    let peakIdx = -1;
    let peakVal = 0;
    for (let tau = fromTau; tau <= toTau; tau++) {
      const i = tau - tauMin;
      const v = nsdf[i];
      const isPeak = v >= nsdf[i - 1] && v >= nsdf[i + 1];
      if (isPeak && v > peakVal) {
        peakVal = v;
        peakIdx = i;
      }
    }
    if (peakIdx < 1 || peakVal < 0.26) continue;

    const y1 = nsdf[peakIdx - 1], y2 = nsdf[peakIdx], y3 = nsdf[peakIdx + 1];
    const a = (y1 + y3 - 2 * y2) / 2;
    const b = (y3 - y1) / 2;
    let tauFine = peakIdx + tauMin;
    if (Math.abs(a) > 1e-12) tauFine -= b / (2 * a);

    const heardFreq = sampleRate / tauFine;
    const correctedFreq = heardFreq / harmonic;
    const cents = 1200 * Math.log2(correctedFreq / targetFreq);
    if (!Number.isFinite(cents) || Math.abs(cents) > centsRange) continue;

    const score = Math.abs(cents) - peakVal * 22 + (harmonic - 1) * 6;
    if (!best || score < best.score) {
      best = { freq: correctedFreq, heardFreq, cents, clarity: peakVal, rms, harmonic, score };
    }
  }

  return best;
}

// ─── TunerApp — обёртка с аудио-движком ─────────────────────────────
function TunerApp() {
  const [micRunning, setMicRunning] = React.useState(false);
  const [cents, setCents]           = React.useState(0);
  const [inputFreq, setInputFreq]   = React.useState(null);
  const [signal, setSignal]         = React.useState(false);
  const [inTune, setInTune]         = React.useState(false);
  const [lockReady, setLockReady]   = React.useState(false);
  const [readingReady, setReadingReady] = React.useState(false);
  const [autoIdx, setAutoIdx]       = React.useState(0);
  const audioRef  = React.useRef(null);
  const startingRef = React.useRef(false);
  const lockRef   = React.useRef({ holdUntil: 0 });
  const stableRef = React.useRef({ history: [], candidate: 0, votes: 0, silenceCount: 0, smoothCents: 0, lastTrebleAt: 0 });
  const paramsRef = React.useRef({ rmsThreshold: 0.00114, emaAlpha: 0.18, refA: 440, mode: 'AUTO', activeIdx: 0 });

  function releaseAudioHandle(handle) {
    if (!handle) return;
    if (handle.stopped) {
      clearTimeout(handle.timerId);
      return;
    }
    handle.stopped = true;
    if (handle.timerId) {
      clearTimeout(handle.timerId);
      handle.timerId = null;
    }
    [handle.source, handle.inputGain, handle.analyser].forEach((node) => {
      try { node?.disconnect?.(); } catch (_) {}
    });
    try { handle.stream?.getTracks?.().forEach(track => track.stop()); } catch (_) {}
    try {
      if (handle.actx && handle.actx.state !== 'closed') {
        const closePromise = handle.actx.close();
        closePromise?.catch?.(() => {});
      }
    } catch (_) {}
  }

  function stopMic({ resetState = true } = {}) {
    const handle = audioRef.current;
    audioRef.current = null;
    releaseAudioHandle(handle);
    startingRef.current = false;
    stableRef.current.history = [];
    stableRef.current.silenceCount = 0;
    stableRef.current.votes = 0;
    lockRef.current.holdUntil = 0;
    if (!resetState) return;
    setMicRunning(false);
    setSignal(false);
    setInTune(false);
    setLockReady(false);
    setReadingReady(false);
    setInputFreq(null);
  }

  React.useEffect(() => {
    const stopOnPageHide = () => stopMic();
    const stopOnHidden = () => {
      if (document.hidden) stopMic();
    };
    window.addEventListener('pagehide', stopOnPageHide);
    document.addEventListener('visibilitychange', stopOnHidden);
    return () => {
      window.removeEventListener('pagehide', stopOnPageHide);
      document.removeEventListener('visibilitychange', stopOnHidden);
      stopMic({ resetState: false });
    };
  }, []);

  function handleSettingsChange({ needleSpeed, sensitivity, refA }) {
    paramsRef.current.emaAlpha     = 0.10 + needleSpeed * 0.25;
    paramsRef.current.rmsThreshold = 0.0095 - sensitivity * 0.0088;
    paramsRef.current.refA         = refA;
  }

  function handleTuningTargetChange({ mode, activeIdx, refA }) {
    if (paramsRef.current.mode !== mode || paramsRef.current.activeIdx !== activeIdx || paramsRef.current.refA !== refA) {
      stableRef.current.history = [];
      stableRef.current.candidate = activeIdx;
      stableRef.current.votes = 0;
      stableRef.current.smoothCents = cents;
      lockRef.current.holdUntil = 0;
      setInTune(false);
      setLockReady(false);
      setReadingReady(false);
    }
    paramsRef.current.mode = mode;
    paramsRef.current.activeIdx = activeIdx;
    paramsRef.current.refA = refA;
  }

  function tick(analyser, sampleRate) {
    const handle = audioRef.current;
    if (!handle || handle.stopped || document.hidden) return;

    const buf = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(buf);
    const pitchLong = detectPitch(buf, sampleRate, paramsRef.current.rmsThreshold, { preferEarly: true, minPeak: 0.48 });
    const shortStart = Math.max(0, buf.length - 4096);
    const heldIdx = paramsRef.current.mode === 'MANUAL' ? paramsRef.current.activeIdx : stableRef.current.candidate;
    const trebleTail = heldIdx >= 4 || Date.now() - stableRef.current.lastTrebleAt < 900;
    const pitchShort = detectPitch(buf.subarray(shortStart), sampleRate, paramsRef.current.rmsThreshold * (trebleTail ? 0.48 : 0.85), {
      preferEarly: false,
      minPeak: trebleTail ? 0.28 : 0.42,
    });
    const refScale = mRefScale(paramsRef.current.refA);
    const manualTargetIdx = paramsRef.current.activeIdx;
    const manualTargetFreq = M_STRINGS[manualTargetIdx].freq * refScale;
    const manualLong = paramsRef.current.mode === 'MANUAL'
      ? detectPitchForTarget(buf, sampleRate, paramsRef.current.rmsThreshold * 0.72, manualTargetFreq, {
          maxHarmonic: manualTargetIdx >= 4 ? 1 : 4,
          centsRange: manualTargetIdx >= 4 ? 110 : 150,
        })
      : null;
    const manualShort = paramsRef.current.mode === 'MANUAL'
      ? detectPitchForTarget(buf.subarray(shortStart), sampleRate, paramsRef.current.rmsThreshold * (manualTargetIdx >= 4 ? 0.42 : 0.7), manualTargetFreq, {
          maxHarmonic: manualTargetIdx >= 4 ? 1 : 4,
          centsRange: manualTargetIdx >= 4 ? 95 : 140,
        })
      : null;
    const manualPitch = manualShort || manualLong;
    let pitch = pitchLong || pitchShort;
    const manualTrebleGate = paramsRef.current.mode === 'MANUAL' && manualTargetIdx >= 4;

    if (manualPitch) {
      pitch = { freq: manualPitch.heardFreq || manualPitch.freq, clarity: manualPitch.clarity, rms: manualPitch.rms };
    } else if (manualTrebleGate) {
      pitch = null;
    }

    if (!pitch) {
      stableRef.current.history = [];
      stableRef.current.silenceCount = Math.min(stableRef.current.silenceCount + 1, 20);
      const heldTreble = stableRef.current.candidate >= 4 || Date.now() - stableRef.current.lastTrebleAt < 900;
      if (stableRef.current.silenceCount > (heldTreble ? 10 : 3)) {
        setInTune(false);
        setLockReady(false);
        setReadingReady(false);
        setSignal(false);
        setInputFreq(null);
        stableRef.current.smoothCents *= heldTreble ? 0.86 : 0.62;
        if (Math.abs(stableRef.current.smoothCents) < 1.5) stableRef.current.smoothCents = 0;
        const idleCents = Math.round(stableRef.current.smoothCents);
        setCents(idleCents);
      }
    } else {
      stableRef.current.silenceCount = 0;
      setSignal(true);

      let autoMatch = mNearestStringMatch(pitch.freq, refScale);
      if (heldIdx >= 4 && pitchShort) {
        const heldFreq = M_STRINGS[heldIdx].freq * refScale;
        const heldShort = mCorrectedPitchForString(pitchShort.freq, heldFreq, 1);
        if (Math.abs(heldShort.cents) <= 85) {
          pitch = pitchShort;
          autoMatch = { idx: heldIdx, ...heldShort };
        }
      } else if (pitchShort) {
        const shortMatch = mNearestStringMatch(pitchShort.freq, refScale);
        if (shortMatch.idx >= 4 && shortMatch.score + 8 < autoMatch.score) {
          pitch = pitchShort;
          autoMatch = shortMatch;
        }
      }
      const bestIdx = autoMatch.idx;
      const targetIdx = paramsRef.current.mode === 'MANUAL' ? paramsRef.current.activeIdx : bestIdx;
      if (targetIdx >= 4) stableRef.current.lastTrebleAt = Date.now();
      const targetFreq = M_STRINGS[targetIdx].freq * refScale;
      const targetMatch = paramsRef.current.mode === 'MANUAL' && manualPitch
        ? { freq: manualPitch.freq, cents: manualPitch.cents, harmonic: manualPitch.harmonic, score: manualPitch.score }
        : paramsRef.current.mode === 'MANUAL'
          ? mCorrectedPitchForString(pitch.freq, targetFreq, targetIdx >= 4 ? 1 : 4)
          : autoMatch;
      setInputFreq(targetMatch.freq);

      // Сбрасываем историю если сменилась струна
      if (targetIdx !== stableRef.current.candidate) {
        stableRef.current.history = [];
        stableRef.current.candidate = targetIdx;
        stableRef.current.votes = 1;
        lockRef.current.holdUntil = 0;
        setInTune(false);
        setLockReady(false);
        setReadingReady(false);
      } else {
        stableRef.current.votes = Math.min(stableRef.current.votes + 1, 10);
      }

      // Накапливаем замеры
      const rawC = targetMatch.cents;
      const isTrebleString = targetIdx >= 4;
      if (targetIdx >= 4 && Math.abs(rawC) > 90) {
        handle.timerId = setTimeout(() => {
          const current = audioRef.current;
          if (current && !current.stopped && !document.hidden) tick(current.analyser, sampleRate);
        }, 55);
        return;
      }
      const h = stableRef.current.history;
      if (isTrebleString && h.length >= 4) {
        const baseline = mMedian(h.slice(-5));
        if (Math.abs(rawC - baseline) > 28 && pitch.clarity < 0.92) {
          handle.timerId = setTimeout(() => {
            const current = audioRef.current;
            if (current && !current.stopped && !document.hidden) tick(current.analyser, sampleRate);
          }, 55);
          return;
        }
      }
      h.push(rawC);
      const maxHistory = isTrebleString ? 9 : 7;
      if (h.length > maxHistory) h.shift();

      // Обновляем стрелку ТОЛЬКО когда последние 4 замера совпадают (±12¢)
      // Во время атаки струны держим старое значение — как реальный тюнер
      if (h.length >= (isTrebleString ? 5 : 3)) {
        const recent = h.slice(isTrebleString ? -7 : -5);
        const span = Math.max(...recent) - Math.min(...recent);
        const spanLimit = isTrebleString ? 13 : 18;
        if (span <= spanLimit || pitch.clarity > 0.86) {
          const measured = mClamp(mMedian(recent), -50, 50);
          const alpha = paramsRef.current.emaAlpha * (isTrebleString ? 0.58 : 1);
          stableRef.current.smoothCents += (measured - stableRef.current.smoothCents) * alpha;
          const c = Math.round(mClamp(stableRef.current.smoothCents, -50, 50));
          setCents(c);
          setReadingReady(true);
          if (paramsRef.current.mode === 'AUTO' && stableRef.current.votes >= 5) setAutoIdx(bestIdx);
          if (Math.abs(c) <= 3 && pitch.clarity > 0.62) {
            if (stableRef.current.votes >= 4 && h.length >= 4) {
              setInTune(true);
              setLockReady(true);
              lockRef.current.holdUntil = Date.now() + 1200;
            }
          } else if (Math.abs(c) > 7 && Date.now() > lockRef.current.holdUntil) {
            setInTune(false);
            setLockReady(false);
          }
        }
      }
    }

    handle.timerId = setTimeout(() => {
      const current = audioRef.current;
      if (current && !current.stopped && !document.hidden) tick(current.analyser, sampleRate);
    }, 55);
  }

  async function startMic() {
    if (micRunning || startingRef.current || audioRef.current) return;
    startingRef.current = true;
    let handle = null;
    try {
      const actx = new (window.AudioContext || window.webkitAudioContext)();
      handle = { actx, stream: null, source: null, analyser: null, inputGain: null, timerId: null, stopped: false };
      audioRef.current = handle;
      // getUserMedia must be called synchronously within the user gesture —
      // start the promise before any await to satisfy mobile browser policy
      const streamPromise = navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        video: false,
      });
      await actx.resume();
      const stream = await streamPromise;
      handle.stream = stream;
      if (handle.stopped || audioRef.current !== handle) {
        releaseAudioHandle(handle);
        startingRef.current = false;
        return;
      }
      const analyser = actx.createAnalyser();
      const inputGain = actx.createGain();
      const source = actx.createMediaStreamSource(stream);
      handle.source = source;
      handle.analyser = analyser;
      handle.inputGain = inputGain;
      inputGain.gain.value = 2.45;
      analyser.fftSize = 8192;
      analyser.smoothingTimeConstant = 0;
      source.connect(inputGain).connect(analyser);
      setMicRunning(true);
      startingRef.current = false;
      tick(analyser, actx.sampleRate);
    } catch(e) {
      if (audioRef.current === handle) audioRef.current = null;
      releaseAudioHandle(handle);
      startingRef.current = false;
      console.error(e);
      alert('Microphone access is required to use the tuner.');
    }
  }

  return (
    <MobileTuner
      initialCents={cents}
      signal={signal}
      inTune={inTune && lockReady}
      readingReady={readingReady}
      micRunning={micRunning}
      inputFreq={inputFreq}
      autoIdx={autoIdx}
      onEngageMic={micRunning ? stopMic : startMic}
      onSettingsChange={handleSettingsChange}
      onTuningTargetChange={handleTuningTargetChange}
    />
  );
}

ReactDOM.createRoot(document.getElementById('m-root')).render(<TunerApp />);
