import { useMemo, useState } from 'react';
import ConfirmDialog from './ConfirmDialog';

const NUMBERS = Array.from({ length: 100 }, (_, i) => i.toString().padStart(2, '0'));
const CRACK_ANIMATION_MS = 2400;
const INSCRIPTION_ANIMATION_MS = 1800;

function StoneBoard({ selections, onSelect, currentUser, currentUserSelection, onWarn }) {
  const [selectedNumber, setSelectedNumber] = useState(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [shatteringNum, setShatteringNum] = useState(null);
  const [claimingNum, setClaimingNum] = useState(null);
  const [inscribingNum, setInscribingNum] = useState(null);

  const currentUsers = Object.keys(selections).length;
  const claimedPercent = Math.round((currentUsers / NUMBERS.length) * 100);
  const availableNumbers = useMemo(() => (
    NUMBERS.filter((num) => !selections[num]).slice(0, 8)
  ), [selections]);
  const latestSelection = useMemo(() => (
    Object.entries(selections)
      .map(([number, data]) => ({ number, ...data }))
      .sort((a, b) => {
        const left = typeof a.timestamp?.toMillis === 'function' ? a.timestamp.toMillis() : 0;
        const right = typeof b.timestamp?.toMillis === 'function' ? b.timestamp.toMillis() : 0;
        return right - left;
      })[0]
  ), [selections]);
  const ritualStageLabel = useMemo(() => {
    if (shatteringNum && claimingNum) return 'ศิลากำลัง crack เพื่อเปิดผนึก';
    if (claimingNum) return 'วงเวทกำลังตรวจสิทธิ์';
    if (shatteringNum) return 'ศิลากำลัง crack';
    if (inscribingNum) return 'ศิลายอมรับจารึกแล้ว';
    if (currentUserSelection) return 'ผนึกของท่านเสถียรแล้ว';
    return 'เลือกศิลาที่ยังว่างเพื่อเริ่มพิธี';
  }, [claimingNum, currentUserSelection, inscribingNum, shatteringNum]);

  const handleNumberClick = (num) => {
    if (shatteringNum || claimingNum) return;

    if (selections[num]) {
      onWarn?.({
        type: 'warning',
        title: 'หมายเลขนี้ถูกผนึกแล้ว',
        message: `หมายเลข ${num} ถูกผนึกโดยจอมเวท ${selections[num].name || 'ท่านอื่น'}`,
      });
      return;
    }

    if (currentUserSelection) {
      onWarn?.({
        type: 'warning',
        title: 'จารึกซ้ำไม่ได้',
        message: `จอมเวท ${currentUser} ผนึกหมายเลข ${currentUserSelection.number} แล้วในรอบนี้`,
      });
      return;
    }
    
    setSelectedNumber(num);
    setIsConfirmOpen(true);
  };

  const playStoneCrackSound = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      ctx.resume?.();
      const master = ctx.createGain();
      master.gain.setValueAtTime(0.72, ctx.currentTime);
      master.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 2.7);
      master.connect(ctx.destination);

      const makeNoiseBurst = (start, duration, filterFrequency, peakGain, type = 'bandpass', q = 4.5) => {
        const bufferSize = Math.floor(ctx.sampleRate * duration);
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          const progress = i / bufferSize;
          const fade = Math.pow(1 - progress, 2.8);
          const scratch = Math.sin(progress * Math.PI * 220) * 0.08;
          const tick = (i % 31 === 0 || i % 47 === 0) ? 0.28 : 0;
          data[i] = (Math.random() * 2 - 1 + scratch + tick) * fade * 0.62;
        }

        const source = ctx.createBufferSource();
        const filter = ctx.createBiquadFilter();
        const gain = ctx.createGain();

        source.buffer = buffer;
        filter.type = type;
        filter.frequency.setValueAtTime(filterFrequency, ctx.currentTime + start);
        filter.Q.value = q;
        gain.gain.setValueAtTime(0.001, ctx.currentTime + start);
        gain.gain.exponentialRampToValueAtTime(peakGain, ctx.currentTime + start + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration);

        source.connect(filter);
        filter.connect(gain);
        gain.connect(master);
        source.start(ctx.currentTime + start);
      };

      const makeShellSnap = (start, frequency, peakGain) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'square';
        osc.frequency.setValueAtTime(frequency, ctx.currentTime + start);
        osc.frequency.exponentialRampToValueAtTime(frequency * 0.72, ctx.currentTime + start + 0.052);
        gain.gain.setValueAtTime(0.001, ctx.currentTime + start);
        gain.gain.exponentialRampToValueAtTime(peakGain, ctx.currentTime + start + 0.006);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + 0.058);

        osc.connect(gain);
        gain.connect(master);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + 0.064);
        makeNoiseBurst(start + 0.008, 0.085, frequency * 2.7, peakGain * 0.8, 'highpass', 7.8);
      };

      const makePressureCreak = () => {
        const osc = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        const gain = ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(190, ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(310, ctx.currentTime + 1.15);
        osc.frequency.linearRampToValueAtTime(160, ctx.currentTime + 2.25);
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(760, ctx.currentTime);
        filter.frequency.linearRampToValueAtTime(1180, ctx.currentTime + 1.2);
        filter.Q.value = 2.2;
        gain.gain.setValueAtTime(0.001, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.028, ctx.currentTime + 0.2);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 2.35);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(master);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 2.38);
      };

      const bufferSize = Math.floor(ctx.sampleRate * 2.1);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        const progress = i / bufferSize;
        const fadeIn = Math.min(1, progress * 7);
        const fadeOut = Math.pow(1 - progress, 2.2);
        const granular = Math.sin(progress * Math.PI * 420) * 0.04;
        data[i] = (Math.random() * 2 - 1 + granular) * fadeIn * fadeOut * 0.22;
      }

      const crumble = ctx.createBufferSource();
      const crumbleFilter = ctx.createBiquadFilter();
      const crumbleGain = ctx.createGain();

      crumble.buffer = buffer;
      crumbleFilter.type = 'bandpass';
      crumbleFilter.frequency.setValueAtTime(1450, ctx.currentTime + 0.18);
      crumbleFilter.frequency.linearRampToValueAtTime(820, ctx.currentTime + 2.1);
      crumbleFilter.Q.value = 2.4;
      crumbleGain.gain.setValueAtTime(0.001, ctx.currentTime);
      crumbleGain.gain.exponentialRampToValueAtTime(0.07, ctx.currentTime + 0.5);
      crumbleGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 2.35);

      crumble.connect(crumbleFilter);
      crumbleFilter.connect(crumbleGain);
      crumbleGain.connect(master);

      makePressureCreak();
      makeShellSnap(0.12, 1320, 0.032);
      makeShellSnap(0.3, 1680, 0.038);
      makeShellSnap(0.52, 1460, 0.04);
      makeNoiseBurst(0.74, 0.18, 2800, 0.042, 'highpass', 8.2);
      makeShellSnap(0.92, 1960, 0.048);
      makeShellSnap(1.16, 1560, 0.043);
      makeNoiseBurst(1.38, 0.22, 1900, 0.05, 'bandpass', 5.6);
      makeShellSnap(1.66, 2240, 0.05);
      makeShellSnap(1.94, 1740, 0.044);
      makeNoiseBurst(2.12, 0.2, 980, 0.055, 'bandpass', 3.2);
      makeShellSnap(2.24, 1280, 0.036);
      crumble.start(ctx.currentTime + 0.2);

      window.setTimeout(() => ctx.close?.(), 3000);
    } catch (e) {
      console.warn('Audio API not supported or blocked', e);
    }
  };

  const handleConfirm = async (num) => {
    setIsConfirmOpen(false);
    setSelectedNumber(null);
    setShatteringNum(num);
    setClaimingNum(num);
    playStoneCrackSound();

    const minimumAnimation = new Promise((resolve) => {
      window.setTimeout(resolve, CRACK_ANIMATION_MS);
    });

    try {
      const [didSelect] = await Promise.all([onSelect(num), minimumAnimation]);
      if (didSelect) {
        setInscribingNum(num);
        window.setTimeout(() => setInscribingNum((current) => (current === num ? null : current)), INSCRIPTION_ANIMATION_MS);
      }
    } finally {
      setShatteringNum(null);
      setClaimingNum(null);
    }
  };



  return (
    <div className="board-panel">
      <div className="board-header">
        <div>
          <div className="board-title" id="active-theme-title">🪨 ศิลาแห่งคำพยากรณ์โบราณ</div>
          <div className="board-subtitle">ยืนยันแล้วระบบจารึกทันที ใครถึงวงเวทก่อน ได้ครองเลขนั้นก่อน</div>
        </div>
        <div className="board-stats">
          <span id="stat-available">ว่าง: {100 - currentUsers}/100</span>
          <span id="stat-claimed">จารึกสำเร็จ: {currentUsers}</span>
        </div>
      </div>

      <div className="board-energy-band" aria-label={`พลังผนึก ${claimedPercent} เปอร์เซ็นต์`}>
        <div className="energy-band-copy">
          <span>พลังผนึกกระดาน</span>
          <strong>{claimedPercent}%</strong>
        </div>
        <div className="energy-track">
          <span style={{ width: `${claimedPercent}%` }}></span>
        </div>
        <small>
          {latestSelection
            ? `ผู้ปลุกศิลาล่าสุด: จอมเวท ${latestSelection.name} · หมายเลข ${latestSelection.number}`
            : 'ยังไม่มีผู้ปลุกศิลาในรอบนี้'}
        </small>
      </div>

      <div className={`board-warning-ribbon ${currentUserSelection ? 'locked' : ''}`} role="status" aria-live="polite">
        <span>{currentUserSelection ? 'ผนึกเรียบร้อย' : 'กฎสำคัญ'}</span>
        <strong>
          {currentUserSelection
            ? `จอมเวท ${currentUser} ผนึกหมายเลข ${currentUserSelection.number} แล้ว ห้ามจารึกซ้ำในรอบนี้`
            : 'จอมเวท 1 ท่าน จารึกได้เพียง 1 หมายเลขเท่านั้น'}
        </strong>
      </div>

      <div className={`ritual-stage-line ${claimingNum || shatteringNum || inscribingNum ? 'active' : ''}`} aria-live="polite">
        <span className="stage-sigil" aria-hidden="true"></span>
        <span>{ritualStageLabel}</span>
      </div>

      <div className="empty-number-strip" aria-label="เลขไร้ผู้ครอบครอง">
        <span>เลขไร้ผู้ครอบครอง</span>
        <div>
          {availableNumbers.map((num) => (
            <button
              type="button"
              key={num}
              onClick={() => handleNumberClick(num)}
              disabled={!!shatteringNum || !!claimingNum || !!currentUserSelection}
            >
              {num}
            </button>
          ))}
        </div>
      </div>

      <div id="theme-tablet" className="tablet-grid">
        {NUMBERS.map(num => {
          const isTaken = !!selections[num];
          const name = isTaken ? selections[num].name : '';
          const stoneVariant = Number(num) % 5;
          
          return (
            <button
              type="button"
              key={num} 
              className={`tablet-tile stone-variant-${stoneVariant} ${isTaken ? 'claimed' : ''} ${claimingNum === num ? 'claiming' : ''} ${shatteringNum === num ? 'shattering' : ''} ${inscribingNum === num ? 'inscribing' : ''}`}
              onClick={() => handleNumberClick(num)}
              disabled={!!shatteringNum || !!claimingNum}
              aria-disabled={isTaken || !!currentUserSelection || !!shatteringNum || !!claimingNum}
              aria-label={isTaken ? `หมายเลข ${num} ถูกผนึกโดย ${name}` : `เลือกหมายเลข ${num}`}
              title={isTaken ? `ถูกผนึกโดย: ${name}` : 'คลิกเพื่อเลือกหมายเลขนี้'}
            >
              <span className="stone-surface" aria-hidden="true"></span>
              <span className="stone-runes" aria-hidden="true"></span>
              <span className="eggshell-cracks" aria-hidden="true"></span>
              <span className="number">{num}</span>
              {isTaken && (
                <span className="tile-owner">
                  <span className="owner-label">จารึก</span>
                  {name}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <ConfirmDialog
        isOpen={isConfirmOpen}
        number={selectedNumber}
        currentUser={currentUser}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={handleConfirm}
      />
    </div>
  );
}

export default StoneBoard;
