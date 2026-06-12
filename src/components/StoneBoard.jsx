import { useState } from 'react';
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

      const makeNoiseBurst = (start, duration, filterFrequency, peakGain, type = 'bandpass') => {
        const bufferSize = Math.floor(ctx.sampleRate * duration);
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          const progress = i / bufferSize;
          const fade = Math.pow(1 - progress, 1.35);
          const brittle = Math.sin(progress * Math.PI * 34) * 0.18;
          data[i] = (Math.random() * 2 - 1 + brittle) * fade;
        }

        const source = ctx.createBufferSource();
        const filter = ctx.createBiquadFilter();
        const gain = ctx.createGain();

        source.buffer = buffer;
        filter.type = type;
        filter.frequency.setValueAtTime(filterFrequency, ctx.currentTime + start);
        filter.Q.value = 2.4;
        gain.gain.setValueAtTime(0.001, ctx.currentTime + start);
        gain.gain.exponentialRampToValueAtTime(peakGain, ctx.currentTime + start + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration);

        source.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        source.start(ctx.currentTime + start);
      };

      const makeStoneKnock = (start, frequency, duration, peakGain, wave = 'triangle') => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = wave;
        osc.frequency.setValueAtTime(frequency, ctx.currentTime + start);
        osc.frequency.exponentialRampToValueAtTime(frequency * 0.45, ctx.currentTime + start + duration);
        gain.gain.setValueAtTime(0.001, ctx.currentTime + start);
        gain.gain.exponentialRampToValueAtTime(peakGain, ctx.currentTime + start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + duration);
      };

      const makeHairlineSnap = (start, frequency, peakGain) => {
        makeStoneKnock(start, frequency, 0.09, peakGain, 'square');
        makeNoiseBurst(start + 0.012, 0.08, frequency * 5.2, peakGain * 0.42, 'highpass');
      };

      const bufferSize = Math.floor(ctx.sampleRate * 1.55);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        const progress = i / bufferSize;
        const fade = Math.pow(1 - progress, 1.6);
        const granular = Math.sin(progress * Math.PI * 84) * 0.12;
        data[i] = (Math.random() * 2 - 1 + granular) * fade * 0.54;
      }

      const crumble = ctx.createBufferSource();
      const crumbleFilter = ctx.createBiquadFilter();
      const crumbleGain = ctx.createGain();

      crumble.buffer = buffer;
      crumbleFilter.type = 'lowpass';
      crumbleFilter.frequency.setValueAtTime(260, ctx.currentTime);
      crumbleFilter.frequency.linearRampToValueAtTime(980, ctx.currentTime + 1.1);
      crumbleGain.gain.setValueAtTime(0.001, ctx.currentTime);
      crumbleGain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.14);
      crumbleGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.55);

      crumble.connect(crumbleFilter);
      crumbleFilter.connect(crumbleGain);
      crumbleGain.connect(ctx.destination);

      makeStoneKnock(0, 72, 0.42, 0.34);
      makeHairlineSnap(0.28, 420, 0.08);
      makeHairlineSnap(0.52, 620, 0.075);
      makeHairlineSnap(0.78, 540, 0.07);
      makeNoiseBurst(0.92, 0.22, 1250, 0.12, 'bandpass');
      makeHairlineSnap(1.14, 760, 0.06);
      makeStoneKnock(1.38, 105, 0.34, 0.16);
      makeNoiseBurst(1.52, 0.32, 580, 0.13, 'lowpass');
      makeNoiseBurst(1.9, 0.24, 1900, 0.06, 'highpass');
      crumble.start(ctx.currentTime + 0.16);

      window.setTimeout(() => ctx.close?.(), 2700);
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

      <div className={`board-warning-ribbon ${currentUserSelection ? 'locked' : ''}`} role="status" aria-live="polite">
        <span>{currentUserSelection ? 'ผนึกเรียบร้อย' : 'กฎสำคัญ'}</span>
        <strong>
          {currentUserSelection
            ? `จอมเวท ${currentUser} ผนึกหมายเลข ${currentUserSelection.number} แล้ว ห้ามจารึกซ้ำในรอบนี้`
            : 'จอมเวท 1 ท่าน จารึกได้เพียง 1 หมายเลขเท่านั้น'}
        </strong>
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
