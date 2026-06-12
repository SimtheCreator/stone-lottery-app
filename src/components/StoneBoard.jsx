import { useState } from 'react';
import ConfirmDialog from './ConfirmDialog';

const NUMBERS = Array.from({ length: 100 }, (_, i) => i.toString().padStart(2, '0'));
const CRACK_ANIMATION_MS = 1400;

function StoneBoard({ selections, onSelect, currentUser }) {
  const [selectedNumber, setSelectedNumber] = useState(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [shatteringNum, setShatteringNum] = useState(null);
  const [claimingNum, setClaimingNum] = useState(null);

  const currentUsers = Object.keys(selections).length;

  const handleNumberClick = (num) => {
    if (selections[num] || shatteringNum || claimingNum) return;
    
    setSelectedNumber(num);
    setIsConfirmOpen(true);
  };

  const playStoneCrackSound = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();

      const makeNoiseBurst = (start, duration, filterFrequency, peakGain) => {
        const bufferSize = Math.floor(ctx.sampleRate * duration);
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          const fade = 1 - i / bufferSize;
          data[i] = (Math.random() * 2 - 1) * fade;
        }

        const source = ctx.createBufferSource();
        const filter = ctx.createBiquadFilter();
        const gain = ctx.createGain();

        source.buffer = buffer;
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(filterFrequency, ctx.currentTime + start);
        filter.Q.value = 1.6;
        gain.gain.setValueAtTime(0.001, ctx.currentTime + start);
        gain.gain.exponentialRampToValueAtTime(peakGain, ctx.currentTime + start + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration);

        source.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        source.start(ctx.currentTime + start);
      };

      const makeStoneKnock = (start, frequency, duration, peakGain) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'triangle';
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

      const bufferSize = Math.floor(ctx.sampleRate * 0.8);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        const fade = Math.pow(1 - i / bufferSize, 1.8);
        data[i] = (Math.random() * 2 - 1) * fade * 0.7;
      }

      const crumble = ctx.createBufferSource();
      const crumbleFilter = ctx.createBiquadFilter();
      const crumbleGain = ctx.createGain();

      crumble.buffer = buffer;
      crumbleFilter.type = 'lowpass';
      crumbleFilter.frequency.setValueAtTime(420, ctx.currentTime);
      crumbleFilter.frequency.linearRampToValueAtTime(1200, ctx.currentTime + 0.55);
      crumbleGain.gain.setValueAtTime(0.001, ctx.currentTime);
      crumbleGain.gain.exponentialRampToValueAtTime(0.28, ctx.currentTime + 0.08);
      crumbleGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);

      crumble.connect(crumbleFilter);
      crumbleFilter.connect(crumbleGain);
      crumbleGain.connect(ctx.destination);

      makeStoneKnock(0, 88, 0.34, 0.55);
      makeStoneKnock(0.18, 132, 0.22, 0.22);
      makeNoiseBurst(0.08, 0.18, 760, 0.25);
      makeNoiseBurst(0.34, 0.22, 1500, 0.18);
      makeNoiseBurst(0.58, 0.24, 540, 0.16);
      crumble.start(ctx.currentTime + 0.12);

      window.setTimeout(() => ctx.close?.(), 1400);
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
      await Promise.all([onSelect(num), minimumAnimation]);
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
          <span id="stat-claimed">จองสำเร็จ: {currentUsers}</span>
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
              className={`tablet-tile stone-variant-${stoneVariant} ${isTaken ? 'claimed' : ''} ${claimingNum === num ? 'claiming' : ''} ${shatteringNum === num ? 'shattering' : ''}`}
              onClick={() => handleNumberClick(num)}
              disabled={isTaken || !!shatteringNum || !!claimingNum}
              aria-label={isTaken ? `หมายเลข ${num} ถูกเลือกโดย ${name}` : `เลือกหมายเลข ${num}`}
              title={isTaken ? `ถูกเลือกโดย: ${name}` : 'คลิกเพื่อเลือกหมายเลขนี้'}
            >
              <span className="stone-surface" aria-hidden="true"></span>
              <span className="stone-runes" aria-hidden="true"></span>
              <span className="number">{num}</span>
              {isTaken && <span className="tile-owner">{name}</span>}
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
