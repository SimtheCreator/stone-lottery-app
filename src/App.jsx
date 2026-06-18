import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { addDoc, doc, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore';
import { archivesCol, db, logsCol, selectionsCol } from './firebase';
import StoneBoard from './components/StoneBoard';
import { EXPECTED_PARTICIPANTS, EXPECTED_PARTICIPANT_SET, normalizeParticipantCode } from './participantRoster';

const INITIAL_LOGS = [
  { id: 0, text: '🔮 แท่นพิธีเริ่มต้นขึ้นแล้ว เลือกเลขนำโชคของคุณได้เลย...', type: 'info' },
];

const getTimeValue = (value) => {
  if (typeof value === 'number') return value;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  return 0;
};

const getLogTime = (log) => getTimeValue(log.timestamp);

const getParticipantId = (name) => encodeURIComponent(name.trim().toLowerCase());

const formatRitualText = (text = '') => (
  String(text)
    .replace(/จอมเวทย์/g, 'จอมเวท')
    .replace(/รหัส\s+(.+?)\s+ได้จองหมายเลข\s+(\d{1,2})\s+แล้ว/g, 'จอมเวท $1 ได้ผนึกหมายเลข $2 แล้ว')
);

const toStoneNumber = (value) => {
  const numeric = Number.parseInt(String(value ?? '').replace(/\D/g, ''), 10);
  if (Number.isNaN(numeric)) return null;
  return Math.max(0, Math.min(99, numeric));
};

const describePersona = ({ picks, repeatCount, oddRatio, highRatio, spread }) => {
  if (picks >= 2 && repeatCount > 0) {
    return {
      title: 'นักย้ำชะตา',
      note: 'มีเลขประจำใจ เชื่อแล้วไม่ค่อยเปลี่ยนทิศ',
    };
  }

  if (picks >= 3 && spread >= 55) {
    return {
      title: 'นักสำรวจวงเวท',
      note: 'ลองหลายช่วงเลข เปิดรับสัญญาณใหม่มากกว่ายึดตำราเดิม',
    };
  }

  if (oddRatio >= 0.68) {
    return {
      title: 'จอมเวทญาณไว',
      note: 'ชอบเลขคี่ จังหวะตัดสินใจมักมาจากความรู้สึกแรก',
    };
  }

  if (oddRatio <= 0.32) {
    return {
      title: 'ผู้คุมสมดุล',
      note: 'เอนเอียงเลขคู่ ชอบความนิ่งและสัญญาณที่ดูเป็นระบบ',
    };
  }

  if (highRatio >= 0.68) {
    return {
      title: 'นักล่าปลายกระดาน',
      note: 'ชอบเลขสูง มีแนวโน้มเลือกพลังที่ดูเด่นและชัด',
    };
  }

  if (highRatio <= 0.32) {
    return {
      title: 'ผู้รักษาฐานพลัง',
      note: 'ชอบเลขต้นกระดาน เลือกแบบตั้งหลักก่อนเร่งจังหวะ',
    };
  }

  return {
    title: 'จอมเวทสมดุล',
    note: 'เลือกคละช่วง อ่านสัญญาณจากทั้งเหตุผลและความรู้สึก',
  };
};

const buildSeasonProfiles = (selections, archives) => {
  const rows = [];

  Object.entries(selections).forEach(([number, data]) => {
    rows.push({
      name: data?.name || 'ไม่ระบุนาม',
      number: data?.number || number,
      timestamp: data?.timestamp || null,
      source: 'current',
    });
  });

  archives.forEach((archive) => {
    (archive.participants || []).forEach((participant) => {
      rows.push({
        name: participant.name || 'ไม่ระบุนาม',
        number: participant.number,
        timestamp: participant.timestamp || archive.createdAt || null,
        source: archive.id,
      });
    });
  });

  const grouped = new Map();
  rows.forEach((row) => {
    const normalizedName = String(row.name || '').trim();
    if (!normalizedName) return;

    const key = getParticipantId(normalizedName);
    const numeric = toStoneNumber(row.number);
    if (numeric === null) return;

    if (!grouped.has(key)) {
      grouped.set(key, {
        id: key,
        name: normalizedName,
        numbers: [],
        lastTimestamp: 0,
      });
    }

    const profile = grouped.get(key);
    profile.numbers.push(numeric);
    profile.lastTimestamp = Math.max(profile.lastTimestamp, getTimeValue(row.timestamp));
  });

  return Array.from(grouped.values())
    .map((profile) => {
      const picks = profile.numbers.length;
      const sorted = [...profile.numbers].sort((a, b) => a - b);
      const uniqueCount = new Set(profile.numbers).size;
      const repeatCount = picks - uniqueCount;
      const oddCount = profile.numbers.filter((number) => number % 2 === 1).length;
      const highCount = profile.numbers.filter((number) => number >= 50).length;
      const spread = sorted[sorted.length - 1] - sorted[0];
      const digitCounts = profile.numbers.reduce((acc, number) => {
        const digit = number % 10;
        acc[digit] = (acc[digit] || 0) + 1;
        return acc;
      }, {});
      const favoriteDigit = Object.entries(digitCounts)
        .sort((a, b) => b[1] - a[1] || Number(a[0]) - Number(b[0]))[0]?.[0] ?? '-';
      const persona = describePersona({
        picks,
        repeatCount,
        oddRatio: oddCount / picks,
        highRatio: highCount / picks,
        spread,
      });

      return {
        ...profile,
        picks,
        repeatCount,
        favoriteDigit,
        persona,
        rangeLabel: `${String(sorted[0]).padStart(2, '0')}-${String(sorted[sorted.length - 1]).padStart(2, '0')}`,
        numbersLabel: profile.numbers
          .slice(-5)
          .map((number) => String(number).padStart(2, '0'))
          .join(', '),
      };
    })
    .sort((a, b) => b.picks - a.picks || b.lastTimestamp - a.lastTimestamp || a.name.localeCompare(b.name));
};

const isPermissionError = (error) => (
  error?.code === 'permission-denied'
  || error?.message?.toLowerCase().includes('permission')
  || error?.message?.toLowerCase().includes('insufficient')
);

const isLocalPreview = () => (
  ['127.0.0.1', 'localhost', '::1'].includes(window.location.hostname)
);

const getSavedParticipant = () => {
  try {
    return normalizeParticipantCode(localStorage.getItem('lottery_currentUser'));
  } catch {
    return '';
  }
};

const DEFAULT_GATE_SETTINGS = {
  mode: 'force-open',
  openAt: null,
  closeAt: null,
  updatedAt: null,
};

const getDateMillis = (value) => {
  if (!value) return null;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  const millis = new Date(value).getTime();
  return Number.isNaN(millis) ? null : millis;
};

const formatCountdown = (targetMillis, now) => {
  const remaining = Math.max(0, targetMillis - now);
  const totalSeconds = Math.floor(remaining / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    return `${days} วัน ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const toDateTimeLocalValue = (value) => {
  const millis = getDateMillis(value);
  if (!millis) return '';
  const date = new Date(millis);
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
};

const fromDateTimeLocalValue = (value) => (
  value ? new Date(value).toISOString() : null
);

const getTodayDateInput = () => {
  const today = new Date();
  const localDate = new Date(today.getTime() - today.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 10);
};

const formatDrawDate = (value) => {
  if (!value) return 'ยังไม่ระบุงวด';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
  }).format(date);
};

const getGateView = (gateSettings, now = Date.now()) => {
  const settings = { ...DEFAULT_GATE_SETTINGS, ...(gateSettings || {}) };
  const openAtMillis = getDateMillis(settings.openAt);
  const closeAtMillis = getDateMillis(settings.closeAt);

  if (settings.mode === 'force-open') {
    return {
      canSelect: true,
      status: 'open',
      title: 'ลานพิธีเปิดอยู่',
      message: 'ผู้คุมวงเวทเปิดลานให้ผนึกหมายเลขได้ทันที',
      modeLabel: 'เปิด manual',
      closeCountdownLabel: '',
      openAtMillis,
      closeAtMillis,
    };
  }

  if (settings.mode === 'force-closed') {
    return {
      canSelect: false,
      status: 'closed',
      title: 'ลานพิธีถูกปิดชั่วคราว',
      message: 'ผู้คุมวงเวทปิดการเลือกหมายเลขไว้ก่อน',
      modeLabel: 'ปิด manual',
      countdownLabel: '',
      openAtMillis,
      closeAtMillis,
    };
  }

  if (openAtMillis && now < openAtMillis) {
    return {
      canSelect: false,
      status: 'before-open',
      title: 'ลานพิธียังไม่เปิด',
      message: 'กรอกรหัสพนักงานเข้ามารอได้ แต่ยังเลือกศิลาไม่ได้',
      modeLabel: 'ตั้งเวลา',
      countdownLabel: formatCountdown(openAtMillis, now),
      openAtMillis,
      closeAtMillis,
    };
  }

  if (closeAtMillis && now >= closeAtMillis) {
    return {
      canSelect: false,
      status: 'closed',
      title: 'ลานพิธีปิดแล้ว',
      message: 'หมดเวลาผนึกหมายเลขในรอบนี้',
      modeLabel: 'ครบเวลาปิด',
      openAtMillis,
      closeAtMillis,
    };
  }

  return {
    canSelect: true,
    status: 'open',
    title: 'ลานพิธีเปิดอยู่',
    message: 'เลือกศิลาเพื่อผนึกหมายเลขได้แล้ว',
    modeLabel: 'ตั้งเวลา',
    closeCountdownLabel: closeAtMillis && closeAtMillis > now ? formatCountdown(closeAtMillis, now) : '',
    openAtMillis,
    closeAtMillis,
  };
};

const formatDateTime = (value) => {
  const millis = getTimeValue(value);
  if (!millis) return 'รอเวลาจากระบบ';

  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(millis));
};

function RitualTopPanels({ currentUser, logs, claimedCount, availableCount }) {
  const visibleLogs = logs.slice(-5).reverse();

  return (
    <section className="top-ritual-grid" aria-label="กติกาและพงศาวดาร">
      <div className="sidebar-panel ritual-rules-panel">
        <div className="sidebar-title">
          <span>✨</span> กติกาและข้อบัญญัติ
        </div>
        <div className="rules-panel">
          <p>
            ยินดีต้อนรับ, <strong className="gold-text">{currentUser}</strong>
          </p>
          <ul>
            <li>หนึ่งจอมเวทเลือกเลขได้ <strong>1 หมายเลขเด็ด</strong> เท่านั้นในแต่ละรอบ</li>
            <li><strong>วิถีแห่งความเร็ว:</strong> ผู้ใดจารึกตัวเลขก่อน จักได้เป็นเจ้าของพลังงานเลขนั้นทันที ห้ามซ้ำกันโดยเด็ดขาด!</li>
          </ul>
        </div>
      </div>

      <div className="sidebar-panel chronicle-panel">
        <div className="sidebar-title chronicle-title">
          <span>📜</span> พงศาวดารความโชคดี
          <span className="mini-stat">{claimedCount} จารึกแล้ว · ว่าง {availableCount}</span>
        </div>
        <div className="log-container top-log-container" id="log-list">
          {visibleLogs.map((log) => (
            <div
              key={log.id}
              className={`log-item ${log.type === 'claimed' ? 'claimed-log' : ''}`}
            >
              {formatRitualText(log.text)}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function GateAdminPanel({ gateSettings, gateView, onGateUpdate }) {
  const settings = { ...DEFAULT_GATE_SETTINGS, ...(gateSettings || {}) };
  const [gateMode, setGateMode] = useState(settings.mode);
  const [gateOpenAt, setGateOpenAt] = useState(toDateTimeLocalValue(settings.openAt));
  const [gateCloseAt, setGateCloseAt] = useState(toDateTimeLocalValue(settings.closeAt));

  const submitGateSettings = (mode = gateMode) => {
    onGateUpdate({
      mode,
      openAt: fromDateTimeLocalValue(gateOpenAt),
      closeAt: fromDateTimeLocalValue(gateCloseAt),
    });
  };

  return (
    <div className="admin-section gate-admin-panel">
      <div className="admin-section-title">ประตูเวลาเปิดลาน</div>
      <div className={`gate-status-card ${gateView.canSelect ? 'open' : 'closed'}`}>
        <span>{gateView.modeLabel}</span>
        <strong>{gateView.title}</strong>
        <small>
          {gateView.canSelect && gateView.closeCountdownLabel
            ? `จะปิดใน ${gateView.closeCountdownLabel}`
            : gateView.message}
        </small>
      </div>

      <div className="gate-mode-grid" role="group" aria-label="โหมดเปิดปิดลานพิธี">
        <button
          className={gateMode === 'auto' ? 'active' : ''}
          type="button"
          onClick={() => setGateMode('auto')}
        >
          ใช้ตามเวลา
        </button>
        <button
          className={gateMode === 'force-open' ? 'active' : ''}
          type="button"
          onClick={() => setGateMode('force-open')}
        >
          เปิด manual
        </button>
        <button
          className={gateMode === 'force-closed' ? 'active' : ''}
          type="button"
          onClick={() => setGateMode('force-closed')}
        >
          ปิด manual
        </button>
      </div>

      <div className="gate-time-grid">
        <label>
          <span>เวลาเปิดลาน</span>
          <input
            type="datetime-local"
            value={gateOpenAt}
            onChange={(event) => setGateOpenAt(event.target.value)}
          />
        </label>
        <label>
          <span>เวลาปิดลาน</span>
          <input
            type="datetime-local"
            value={gateCloseAt}
            onChange={(event) => setGateCloseAt(event.target.value)}
          />
        </label>
      </div>

      <div className="gate-action-row">
        <button className="btn btn-secondary" type="button" onClick={() => submitGateSettings('force-open')}>
          เปิดทันที
        </button>
        <button className="btn btn-secondary" type="button" onClick={() => submitGateSettings('force-closed')}>
          ปิดทันที
        </button>
        <button className="btn btn-primary" type="button" onClick={() => submitGateSettings()}>
          บันทึกประตูเวลา
        </button>
      </div>
    </div>
  );
}

function DrawResultPanel({ results, onSave }) {
  const [drawDate, setDrawDate] = useState(getTodayDateInput);
  const [twoDigit, setTwoDigit] = useState('');
  const [firstPrize, setFirstPrize] = useState('');
  const [note, setNote] = useState('');

  const handleSubmit = (event) => {
    event.preventDefault();
    onSave({
      drawDate,
      twoDigit,
      firstPrize,
      note,
    });
  };

  return (
    <div className="admin-section draw-result-panel">
      <div className="draw-result-header">
        <div>
          <div className="admin-section-title">บันทึกผลงวดรัฐบาล</div>
          <p>กรอกหลังประกาศผล เพื่อเก็บเป็นสถิติเทียบกับศิลาที่จอมเวทเลือกในรอบนั้น</p>
        </div>
        <span>{results.length} งวด</span>
      </div>

      <form className="draw-result-form" onSubmit={handleSubmit}>
        <label>
          <span>วันที่งวด</span>
          <input
            type="date"
            value={drawDate}
            onChange={(event) => setDrawDate(event.target.value)}
            required
          />
        </label>
        <label>
          <span>เลขท้าย 2 ตัว</span>
          <input
            type="text"
            inputMode="numeric"
            value={twoDigit}
            onChange={(event) => setTwoDigit(event.target.value.replace(/\D/g, '').slice(0, 2))}
            placeholder="เช่น 37"
            maxLength={2}
            required
          />
        </label>
        <label>
          <span>รางวัลที่ 1</span>
          <input
            type="text"
            inputMode="numeric"
            value={firstPrize}
            onChange={(event) => setFirstPrize(event.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="ไม่บังคับ"
            maxLength={6}
          />
        </label>
        <label className="draw-result-note">
          <span>หมายเหตุ</span>
          <input
            type="text"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="เช่น ประกาศผลแล้ว / แก้ไขย้อนหลัง"
            maxLength={200}
          />
        </label>
        <button className="btn btn-primary" type="submit">
          บันทึกผลงวด
        </button>
      </form>

      <div className="draw-result-list">
        {results.length ? results.slice(0, 8).map((result) => (
          <div className="draw-result-row" key={result.id || result.drawDate}>
            <div>
              <strong>{formatDrawDate(result.drawDate)}</strong>
              <span>เลขท้าย 2 ตัว: {result.twoDigit}</span>
            </div>
            <div>
              <small>{result.firstPrize ? `รางวัลที่ 1: ${result.firstPrize}` : 'ยังไม่ได้กรอกรางวัลที่ 1'}</small>
              <small>ตรงเลข {result.matchedCount || 0} จาก {result.claimedCount || 0} จารึก</small>
            </div>
            {result.matchedParticipants?.length ? (
              <p>ผู้ตรงเลข: {result.matchedParticipants.map((participant) => participant.name).join(', ')}</p>
            ) : (
              <p>ยังไม่มีจอมเวทตรงเลขในงวดนี้</p>
            )}
            {result.note ? <em>{result.note}</em> : null}
          </div>
        )) : (
          <div className="empty-state">ยังไม่มีผลงวดที่บันทึกไว้</div>
        )}
      </div>
    </div>
  );
}

function AdminDashboard({ isOpen, onClose, selections, logs, archives, checkins, drawResults, gateSettings, gateView, onGateUpdate, onDrawResultSave, onReset, onPurgeTestData }) {
  const [rosterFilter, setRosterFilter] = useState('');
  const claimedEntries = useMemo(() => (
    Object.entries(selections)
      .map(([number, data]) => ({ number, ...data }))
      .sort((a, b) => getTimeValue(b.timestamp) - getTimeValue(a.timestamp))
  ), [selections]);
  const checkedInEntries = useMemo(() => (
    (checkins || [])
      .map((entry) => ({
        ...entry,
        name: normalizeParticipantCode(entry.name || entry.code || entry.id),
      }))
      .filter((entry) => entry.name)
  ), [checkins]);

  const claimedCount = claimedEntries.length;
  const availableCount = 100 - claimedCount;
  const latestClaim = claimedEntries[0];
  const rosterFilterValue = normalizeParticipantCode(rosterFilter);
  const claimedMap = useMemo(() => {
    const map = new Map();
    claimedEntries.forEach((entry) => {
      map.set(normalizeParticipantCode(entry.name), entry);
    });
    return map;
  }, [claimedEntries]);
  const checkedInMap = useMemo(() => {
    const map = new Map();
    checkedInEntries.forEach((entry) => {
      map.set(normalizeParticipantCode(entry.name), entry);
    });
    return map;
  }, [checkedInEntries]);
  const rosterEntries = useMemo(() => (
    EXPECTED_PARTICIPANTS.map((code) => {
      const checkin = checkedInMap.get(code);
      const claim = claimedMap.get(code);
      return {
        code,
        checkedIn: Boolean(checkin || claim),
        claimed: Boolean(claim),
        number: claim?.number || '',
        timestamp: checkin?.timestamp || checkin?.updatedAt || claim?.timestamp || null,
      };
    })
  ), [checkedInMap, claimedMap]);
  const missingRoster = rosterEntries.filter((entry) => !entry.checkedIn);
  const enteredRoster = rosterEntries.filter((entry) => entry.checkedIn);
  const waitingRoster = rosterEntries.filter((entry) => entry.checkedIn && !entry.claimed);
  const unknownRoster = [
    ...checkedInEntries
      .filter((entry) => !EXPECTED_PARTICIPANT_SET.has(normalizeParticipantCode(entry.name)))
      .map((entry) => ({ code: normalizeParticipantCode(entry.name), status: 'เข้าพิธีแล้ว' })),
    ...claimedEntries
      .filter((entry) => !EXPECTED_PARTICIPANT_SET.has(normalizeParticipantCode(entry.name)))
      .map((entry) => ({ code: normalizeParticipantCode(entry.name), status: `ผนึกหมายเลข ${entry.number}` })),
  ].filter((entry, index, all) => (
    entry.code && all.findIndex((candidate) => candidate.code === entry.code) === index
  ));
  const matchesRosterFilter = (entry) => (
    !rosterFilterValue || entry.code.includes(rosterFilterValue)
  );
  const visibleMissingRoster = missingRoster.filter(matchesRosterFilter);
  const visibleEnteredRoster = enteredRoster.filter(matchesRosterFilter);
  const visibleWaitingRoster = waitingRoster.filter(matchesRosterFilter);
  const seasonProfiles = useMemo(() => (
    buildSeasonProfiles(selections, archives)
  ), [selections, archives]);
  const gatePanelKey = [
    gateSettings?.mode || DEFAULT_GATE_SETTINGS.mode,
    getDateMillis(gateSettings?.openAt) || '',
    getDateMillis(gateSettings?.closeAt) || '',
  ].join('|');

  if (!isOpen) return null;

  return (
    <div className="modal-overlay admin-overlay" onClick={onClose}>
      <section className="admin-dashboard" onClick={(event) => event.stopPropagation()}>
        <div className="admin-dashboard-header">
          <div>
            <div className="admin-kicker">ห้องควบคุมวงเวท</div>
            <h2>Dashboard หลังบ้าน</h2>
            <p>ติดตามสถานะกระดานปัจจุบัน และเก็บสถิติงวดก่อนเมื่อกดล้างกระดาน</p>
          </div>
          <button className="icon-close" type="button" onClick={onClose} aria-label="ปิด Dashboard">
            ✕
          </button>
        </div>

        <div className="dashboard-stat-grid">
          <div className="dashboard-stat">
            <span>จารึกสำเร็จ</span>
            <strong>{claimedCount}</strong>
            <small>จากทั้งหมด 100 หมายเลข</small>
          </div>
          <div className="dashboard-stat">
            <span>ยังว่าง</span>
            <strong>{availableCount}</strong>
            <small>พร้อมให้แย่งกด</small>
          </div>
          <div className="dashboard-stat">
            <span>ล่าสุด</span>
            <strong>{latestClaim ? latestClaim.number : '-'}</strong>
            <small>{latestClaim ? latestClaim.name : 'ยังไม่มีผู้จารึก'}</small>
          </div>
          <div className="dashboard-stat">
            <span>ประวัติงวด</span>
            <strong>{archives.length}</strong>
            <small>เก็บไว้หลัง reset</small>
          </div>
        </div>

        <GateAdminPanel
          key={gatePanelKey}
          gateSettings={gateSettings}
          gateView={gateView}
          onGateUpdate={onGateUpdate}
        />

        <DrawResultPanel
          results={drawResults}
          onSave={onDrawResultSave}
        />

        <div className="admin-section roster-section">
          <div className="roster-header">
            <div>
              <div className="admin-section-title">บัญชีจอมเวท MKTXCRC</div>
              <p>เช็กจากรายชื่อพนักงานที่ต้องเข้าพิธีทั้งหมด {EXPECTED_PARTICIPANTS.length} คน</p>
            </div>
            <input
              type="search"
              className="roster-search"
              value={rosterFilter}
              onChange={(event) => setRosterFilter(event.target.value)}
              placeholder="ค้นจอมเวท..."
              aria-label="ค้นจอมเวทในบัญชี"
            />
          </div>

          <div className="roster-summary-grid">
            <div className="roster-summary-card">
              <span>ทั้งหมด</span>
              <strong>{EXPECTED_PARTICIPANTS.length}</strong>
            </div>
            <div className="roster-summary-card ready">
              <span>เข้าพิธีแล้ว</span>
              <strong>{enteredRoster.length}</strong>
            </div>
            <div className="roster-summary-card waiting">
              <span>เข้ามาแล้ว ยังไม่เลือก</span>
              <strong>{waitingRoster.length}</strong>
            </div>
            <div className="roster-summary-card missing">
              <span>ยังไม่เข้าพิธี</span>
              <strong>{missingRoster.length}</strong>
            </div>
          </div>

          <div className="waiting-participant-section">
            <div className="waiting-participant-header">
              <div>
                <div className="roster-column-title">เข้าพิธีแล้ว แต่ยังไม่ได้เลือกศิลา</div>
                <p>อิงจากรหัสพนักงานที่กรอกเข้ามาแล้ว แมตช์กับรายการที่ยังไม่มีหมายเลขผนึก</p>
              </div>
              <strong>{visibleWaitingRoster.length}</strong>
            </div>
            <div className="waiting-participant-list">
              {visibleWaitingRoster.length ? visibleWaitingRoster.map((entry) => (
                <div className="waiting-participant-row" key={entry.code}>
                  <span>{entry.code}</span>
                  <strong>ยังไม่ได้เลือกเลข</strong>
                  <small>{entry.timestamp ? formatDateTime(entry.timestamp) : 'รอเวลาเข้าพิธี'}</small>
                </div>
              )) : (
                <div className="empty-state">ไม่มีจอมเวทที่เข้าพิธีแล้วแต่ยังไม่ได้เลือกในตัวกรองนี้</div>
              )}
            </div>
          </div>

          <div className="roster-columns">
            <div className="roster-column">
              <div className="roster-column-title">ยังไม่เข้าพิธี ({visibleMissingRoster.length})</div>
              <div className="roster-chip-list missing">
                {visibleMissingRoster.length ? visibleMissingRoster.map((entry) => (
                  <span className="roster-chip missing" key={entry.code}>{entry.code}</span>
                )) : (
                  <div className="empty-state">ไม่มีจอมเวทค้างในตัวกรองนี้</div>
                )}
              </div>
            </div>

            <div className="roster-column">
              <div className="roster-column-title">เข้าพิธีแล้ว ({visibleEnteredRoster.length})</div>
              <div className="roster-status-list">
                {visibleEnteredRoster.length ? visibleEnteredRoster.map((entry) => (
                  <div className={`roster-status-row ${entry.claimed ? 'claimed' : 'waiting'}`} key={entry.code}>
                    <span>{entry.code}</span>
                    <strong>{entry.claimed ? `ผนึกเลข ${entry.number}` : 'รอเลือกศิลา'}</strong>
                    <small>{entry.timestamp ? formatDateTime(entry.timestamp) : 'รอเวลา'}</small>
                  </div>
                )) : (
                  <div className="empty-state">ยังไม่มีจอมเวทเข้าพิธีในตัวกรองนี้</div>
                )}
              </div>
            </div>
          </div>

          {unknownRoster.length ? (
            <div className="roster-unknown">
              <strong>พบจอมเวทนอกบัญชี</strong>
              <div className="roster-chip-list">
                {unknownRoster.map((entry) => (
                  <span className="roster-chip unknown" key={entry.code}>{entry.code} · {entry.status}</span>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="admin-dashboard-grid">
          <div className="admin-section">
            <div className="admin-section-title">รายชื่อจารึกงวดนี้</div>
            <div className="admin-list compact-list">
              {claimedEntries.length ? claimedEntries.map((entry) => (
                <div className="admin-row" key={entry.number}>
                  <span className="admin-number">{entry.number}</span>
                  <span>{entry.name}</span>
                  <small>{formatDateTime(entry.timestamp)}</small>
                </div>
              )) : (
                <div className="empty-state">ยังไม่มีผู้จารึกในงวดนี้</div>
              )}
            </div>
          </div>

          <div className="admin-section">
            <div className="admin-section-title">พงศาวดารล่าสุด</div>
            <div className="admin-list compact-list">
              {logs.slice(-8).reverse().map((log) => (
                <div className="admin-row log-row" key={log.id}>
                  <span>{log.type === 'claimed' ? 'จารึก' : 'ระบบ'}</span>
                  <small>{formatRitualText(log.text)}</small>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="admin-section archive-section">
          <div className="admin-section-title">สถิติงวดก่อน</div>
          <div className="archive-list">
            {archives.length ? archives.slice(0, 6).map((archive) => (
              <div className="archive-row" key={archive.id}>
                <span>{formatDateTime(archive.createdAt)}</span>
                <strong>{archive.claimedCount || 0} จารึก</strong>
                <small>ว่าง {archive.availableCount ?? Math.max(0, 100 - (archive.claimedCount || 0))}</small>
              </div>
            )) : (
              <div className="empty-state">ยังไม่มีประวัติงวดก่อน กดล้างกระดานครั้งแรกจึงเริ่มเก็บ archive</div>
            )}
          </div>
        </div>

        <div className="admin-section oracle-section">
          <div className="admin-section-title">Oracle AI อ่านลายเส้นตัวเลข</div>
          <p className="oracle-note">
            อ่านจากหมายเลขที่แต่ละจอมเวทเลือกในทุกงวดที่ถูก archive ไว้ รวมกับกระดานปัจจุบัน เพื่อใช้สรุปนิสัยตอนจบซีซั่น
          </p>
          {seasonProfiles.length ? (
            <div className="oracle-profile-grid">
              {seasonProfiles.slice(0, 8).map((profile) => (
                <div className="oracle-card" key={profile.id}>
                  <div className="oracle-card-head">
                    <strong>{profile.name}</strong>
                    <span>{profile.picks} ครั้ง</span>
                  </div>
                  <div className="oracle-persona">{profile.persona.title}</div>
                  <p>{profile.persona.note}</p>
                  <div className="oracle-metrics">
                    <span>ช่วง {profile.rangeLabel}</span>
                    <span>ท้ายโปรด {profile.favoriteDigit}</span>
                    <span>{profile.repeatCount ? `ซ้ำ ${profile.repeatCount}` : 'ไม่ซ้ำ'}</span>
                  </div>
                  <small>เลขล่าสุด: {profile.numbersLabel}</small>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">ยังไม่มีข้อมูลพอให้อ่าน pattern ต้องมีอย่างน้อย 1 การจารึกก่อน</div>
          )}
        </div>

        <div className="admin-actions">
          <button className="btn btn-secondary" type="button" onClick={onClose}>
            กลับสู่ลานพิธี
          </button>
          <button className="btn btn-danger btn-test-cleanup" type="button" onClick={onPurgeTestData}>
            ล้างข้อมูลทดสอบทั้งหมด
          </button>
          <button className="btn btn-danger" type="button" onClick={onReset}>
            ล้างกระดานสำหรับงวดถัดไป
          </button>
        </div>
        <p className="admin-cleanup-note">
          ปุ่มล้างข้อมูลทดสอบจะล้างทั้งกระดาน พงศาวดาร และสถิติเก่าที่ใช้ทดสอบ โดยไม่เก็บ archive เพิ่ม
        </p>
      </section>
    </div>
  );
}

function AdminLoginModal({ isOpen, password, error, onPasswordChange, onSubmit, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay admin-overlay" onClick={onClose}>
      <section className="admin-login-card" onClick={(event) => event.stopPropagation()}>
        <button className="icon-close" type="button" onClick={onClose} aria-label="ปิดหน้ารหัส Admin">
          ✕
        </button>
        <div className="join-rune">⚙️</div>
        <div className="admin-kicker">ห้องลับผู้คุมวงเวท</div>
        <h2>ยืนยันรหัส Admin</h2>
        <p>กรุณาใส่รหัสก่อนเข้าสู่ Dashboard หลังบ้าน</p>
        <form onSubmit={onSubmit}>
          <div className="input-group">
            <input
              type="password"
              className="name-input"
              value={password}
              onChange={(event) => onPasswordChange(event.target.value)}
              placeholder="กรอกรหัส Admin..."
              autoFocus
              required
            />
          </div>
          {error ? <div className="admin-login-error">{error}</div> : null}
          <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
            เข้าสู่ Dashboard
          </button>
        </form>
      </section>
    </div>
  );
}

function RitualNotice({ notice, onClose }) {
  if (!notice) return null;

  const icon = {
    success: '✦',
    error: '⚠',
    warning: '!',
  }[notice.type] || '!';

  return (
    <div className={`ritual-notice ${notice.type || 'warning'}`} role={notice.type === 'error' ? 'alert' : 'status'} aria-live="polite">
      <div className="ritual-notice-icon">{icon}</div>
      <div className="ritual-notice-copy">
        <strong>{notice.title}</strong>
        <span>{notice.message}</span>
      </div>
      <button type="button" className="ritual-notice-close" onClick={onClose} aria-label="ปิดคำเตือน">
        ✕
      </button>
    </div>
  );
}

function App() {
  const [selections, setSelections] = useState({});
  const [logs, setLogs] = useState(INITIAL_LOGS);
  const [archives, setArchives] = useState([]);
  const [checkins, setCheckins] = useState([]);
  const [drawResults, setDrawResults] = useState([]);
  const [currentUser, setCurrentUser] = useState(getSavedParticipant);
  const [isJoined, setIsJoined] = useState(() => EXPECTED_PARTICIPANT_SET.has(getSavedParticipant()));
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [isAdminLoginOpen, setIsAdminLoginOpen] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [adminLoginError, setAdminLoginError] = useState('');
  const [notice, setNotice] = useState(null);
  const [gateSettings, setGateSettings] = useState(DEFAULT_GATE_SETTINGS);
  const [gateNow, setGateNow] = useState(() => Date.now());
  const canvasRef = useRef(null);

  const claimedCount = Object.keys(selections).length;
  const availableCount = 100 - claimedCount;
  const currentParticipantId = currentUser.trim() ? getParticipantId(currentUser) : '';
  const currentUserSelection = useMemo(() => {
    if (!currentParticipantId) return null;

    const entry = Object.entries(selections).find(([, selection]) => (
      getParticipantId(selection.name || '') === currentParticipantId
    ));

    if (!entry) return null;
    const [number, data] = entry;
    return { number, ...data };
  }, [currentParticipantId, selections]);
  const gateView = useMemo(() => (
    getGateView(gateSettings, gateNow)
  ), [gateNow, gateSettings]);

  const showNotice = useCallback(({ type = 'warning', title, message }) => {
    setNotice({
      id: Date.now(),
      type,
      title,
      message,
    });
  }, []);

  const refreshGateSettings = useCallback(async ({ silent = true } = {}) => {
    try {
      const response = await fetch('/api/gate', {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });

      if (isLocalPreview() && response.status === 404) {
        setGateSettings(DEFAULT_GATE_SETTINGS);
        return;
      }

      const contentType = response.headers.get('content-type') || '';
      if (isLocalPreview() && !contentType.includes('application/json')) {
        setGateSettings(DEFAULT_GATE_SETTINGS);
        return;
      }

      if (!response.ok) {
        throw new Error(`Gate settings failed: ${response.status}`);
      }

      const data = await response.json();
      setGateSettings({ ...DEFAULT_GATE_SETTINGS, ...(data.settings || {}) });
    } catch (error) {
      console.warn('Gate settings listener failed', error);
      if (!silent) {
        showNotice({
          type: 'error',
          title: 'โหลดประตูเวลาไม่สำเร็จ',
          message: 'ระบบจะเปิดลานตามค่าเดิม กรุณาลองใหม่อีกครั้ง',
        });
      }
    }
  }, [showNotice]);

  const refreshCheckins = useCallback(async ({ silent = true } = {}) => {
    if (!adminPassword) return;

    try {
      const response = await fetch('/api/checkins', {
        headers: {
          Accept: 'application/json',
          'x-admin-password': adminPassword,
        },
        cache: 'no-store',
      });

      const contentType = response.headers.get('content-type') || '';
      if (isLocalPreview() && !contentType.includes('application/json')) {
        setCheckins([]);
        return;
      }

      if (response.status === 401) {
        setCheckins([]);
        return;
      }

      if (!response.ok) {
        throw new Error(`Checkins failed: ${response.status}`);
      }

      const data = await response.json();
      setCheckins(data.checkins || []);
    } catch (error) {
      console.warn('Checkin listener failed', error);
      if (!silent) {
        showNotice({
          type: 'error',
          title: 'โหลดบัญชีจอมเวทไม่สำเร็จ',
          message: 'กรุณาลองเปิด Dashboard อีกครั้ง',
        });
      }
    }
  }, [adminPassword, showNotice]);

  const refreshDrawResults = useCallback(async ({ silent = true } = {}) => {
    if (!adminPassword) return;

    try {
      const response = await fetch('/api/results', {
        headers: {
          Accept: 'application/json',
          'x-admin-password': adminPassword,
        },
        cache: 'no-store',
      });

      const contentType = response.headers.get('content-type') || '';
      if (isLocalPreview() && !contentType.includes('application/json')) {
        setDrawResults([]);
        return;
      }

      if (response.status === 401) {
        setDrawResults([]);
        return;
      }

      if (!response.ok) {
        throw new Error(`Draw results failed: ${response.status}`);
      }

      const data = await response.json();
      setDrawResults(data.results || []);
    } catch (error) {
      console.warn('Draw results listener failed', error);
      if (!silent) {
        showNotice({
          type: 'error',
          title: 'โหลดผลงวดไม่สำเร็จ',
          message: 'กรุณาลองเปิด Dashboard อีกครั้ง',
        });
      }
    }
  }, [adminPassword, showNotice]);

  const recordCheckin = useCallback(async (participantCode) => {
    try {
      const response = await fetch('/api/checkins', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ name: participantCode }),
      });

      const contentType = response.headers.get('content-type') || '';
      if (isLocalPreview() && !contentType.includes('application/json')) {
        return;
      }

      if (response.status === 400) {
        showNotice({
          type: 'warning',
          title: 'ไม่พบจอมเวทในบัญชีพิธี',
          message: 'กรุณาตรวจเลขพนักงานกับรายชื่อกิจกรรม MKTXCRC',
        });
        return;
      }

      if (!response.ok) {
        throw new Error(`Checkin write failed: ${response.status}`);
      }
    } catch (error) {
      console.warn('Checkin write failed', error);
      showNotice({
        type: 'warning',
        title: 'บันทึกการเข้าพิธีไม่สำเร็จ',
        message: 'เข้าหน้ากระดานได้ แต่ Admin อาจยังไม่เห็นสถานะล่าสุด',
      });
    }
  }, [showNotice]);

  useEffect(() => {
    if (!notice) return undefined;

    const timeout = window.setTimeout(() => setNotice(null), 4600);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    const interval = window.setInterval(() => setGateNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (motionQuery.matches) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    const stars = [];
    const isCompact = window.innerWidth < 700;
    const count = isCompact ? 34 : 58;
    const maxFps = isCompact ? 18 : 24;
    const frameInterval = 1000 / maxFps;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.25);
    let width = 0;
    let height = 0;
    let animationFrameId;
    let lastFrame = 0;
    let resizeTimeout;

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * pixelRatio);
      canvas.height = Math.floor(height * pixelRatio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

      stars.forEach((star) => {
        star.x = Math.min(star.x, width);
        star.y = Math.min(star.y, height);
      });
    };

    const scheduleResize = () => {
      window.clearTimeout(resizeTimeout);
      resizeTimeout = window.setTimeout(resize, 120);
    };
    window.addEventListener('resize', scheduleResize, { passive: true });
    resize();

    for (let i = 0; i < count; i++) {
      stars.push({
        x: Math.random() * width,
        y: Math.random() * height,
        size: Math.random() * 1.25 + 0.45,
        alpha: Math.random() * 0.72 + 0.18,
        speed: Math.random() * 0.012 + 0.003,
      });
    }

    const draw = (timestamp = 0) => {
      if (document.hidden) {
        animationFrameId = requestAnimationFrame(draw);
        return;
      }

      if (timestamp - lastFrame < frameInterval) {
        animationFrameId = requestAnimationFrame(draw);
        return;
      }

      lastFrame = timestamp;
      ctx.clearRect(0, 0, width, height);
      stars.forEach((star) => {
        star.alpha += star.speed;
        if (star.alpha > 1 || star.alpha < 0) star.speed = -star.speed;
        ctx.fillStyle = `rgba(255, 255, 255, ${Math.max(0.1, star.alpha)})`;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fill();
      });
      animationFrameId = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      window.removeEventListener('resize', scheduleResize);
      window.clearTimeout(resizeTimeout);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  useEffect(() => {
    const initialCheck = window.setTimeout(() => refreshGateSettings(), 0);
    const interval = window.setInterval(() => refreshGateSettings(), 15000);
    return () => {
      window.clearTimeout(initialCheck);
      window.clearInterval(interval);
    };
  }, [refreshGateSettings]);

  useEffect(() => {
    if (!isAdminOpen || !adminPassword) return undefined;

    const initialCheck = window.setTimeout(() => {
      refreshCheckins({ silent: false });
      refreshDrawResults({ silent: false });
    }, 0);
    const interval = window.setInterval(() => {
      refreshCheckins();
      refreshDrawResults();
    }, 15000);

    return () => {
      window.clearTimeout(initialCheck);
      window.clearInterval(interval);
    };
  }, [adminPassword, isAdminOpen, refreshCheckins, refreshDrawResults]);

  useEffect(() => {
    const unsubSel = onSnapshot(selectionsCol, (snap) => {
      const sel = {};
      snap.forEach((document) => {
        sel[document.id] = document.data();
      });
      setSelections(sel);
    }, (error) => {
      console.error('Selection listener failed', error);
      showNotice({
        type: 'error',
        title: 'โหลดหมายเลขไม่สำเร็จ',
        message: 'กรุณารีเฟรชหน้าอีกครั้ง หรือแจ้งผู้ดูแลระบบ',
      });
    });

    const unsubLog = onSnapshot(logsCol, (snap) => {
      const arr = [];
      snap.forEach((document) => arr.push({ id: document.id, ...document.data() }));
      setLogs(arr.length ? arr.sort((a, b) => getLogTime(a) - getLogTime(b)) : INITIAL_LOGS);
    }, (error) => {
      console.error('Log listener failed', error);
      setLogs((prev) => [
        ...prev,
        { id: `error-${Date.now()}`, text: 'โหลดพงศาวดารไม่สำเร็จ กรุณารีเฟรชหน้าอีกครั้ง', type: 'error' },
      ]);
    });

    const unsubArchives = onSnapshot(archivesCol, (snap) => {
      const arr = [];
      snap.forEach((document) => arr.push({ id: document.id, ...document.data() }));
      setArchives(arr.sort((a, b) => getTimeValue(b.createdAt) - getTimeValue(a.createdAt)));
    }, (error) => {
      console.warn('Archive listener failed', error);
      setArchives([]);
    });

    return () => {
      unsubSel();
      unsubLog();
      unsubArchives();
    };
  }, [showNotice]);

  const handleJoin = (e) => {
    e.preventDefault();
    const trimmedUser = normalizeParticipantCode(currentUser);
    if (!trimmedUser) return;

    if (!EXPECTED_PARTICIPANT_SET.has(trimmedUser)) {
      showNotice({
        type: 'warning',
        title: 'ไม่พบจอมเวทในบัญชีพิธี',
        message: 'กรุณาตรวจเลขพนักงานกับรายชื่อกิจกรรม MKTXCRC',
      });
      return;
    }

    setCurrentUser(trimmedUser);
    localStorage.setItem('lottery_currentUser', trimmedUser);
    setIsJoined(true);
    recordCheckin(trimmedUser);
  };

  const handleChangeName = () => {
    localStorage.removeItem('lottery_currentUser');
    setIsJoined(false);
    setCurrentUser('');
  };

  const handleSelectNumber = async (number) => {
    const trimmedUser = normalizeParticipantCode(currentUser);
    if (!trimmedUser) {
      showNotice({
        type: 'warning',
        title: 'ยังไม่ได้ระบุตัวตนจอมเวท',
        message: 'กรุณาระบุตัวตนก่อนเลือกหมายเลข',
      });
      return false;
    }

    if (!gateView.canSelect) {
      showNotice({
        type: 'warning',
        title: gateView.title,
        message: gateView.countdownLabel
          ? `${gateView.message} เปิดใน ${gateView.countdownLabel}`
          : gateView.message,
      });
      return false;
    }

    const participantId = getParticipantId(trimmedUser);
    const hasPicked = Object.values(selections).some((selection) => (
      getParticipantId(selection.name || '') === participantId
    ));
    if (hasPicked) {
      showNotice({
        type: 'warning',
        title: 'จารึกซ้ำไม่ได้',
        message: currentUserSelection
          ? `จอมเวทท่านนี้ผนึกหมายเลข ${currentUserSelection.number} แล้ว`
          : 'จอมเวทท่านนี้ผนึกหมายเลขไปแล้วในรอบนี้',
      });
      return false;
    }

    if (selections[number]) {
      showNotice({
        type: 'warning',
        title: 'หมายเลขนี้ถูกผนึกแล้ว',
        message: `หมายเลข ${number} ถูกผนึกโดยจอมเวท ${selections[number].name || 'ท่านอื่น'}`,
      });
      return false;
    }

    try {
      const numberRef = doc(selectionsCol, String(number));
      const participantRef = doc(db, 'participants', participantId);
      const payload = {
        name: trimmedUser,
        number: String(number),
        participantId,
        timestamp: serverTimestamp(),
      };

      try {
        await runTransaction(db, async (transaction) => {
          const [numberSnap, participantSnap] = await Promise.all([
            transaction.get(numberRef),
            transaction.get(participantRef),
          ]);

          if (participantSnap.exists()) {
            throw new Error('USER_ALREADY_PICKED');
          }

          if (numberSnap.exists()) {
            throw new Error('NUMBER_TAKEN');
          }

          transaction.set(numberRef, payload);
          transaction.set(participantRef, payload);
        });
      } catch (error) {
        if (!isPermissionError(error)) {
          throw error;
        }

        console.warn('Participant write denied; falling back to number-only transaction', error);
        await runTransaction(db, async (transaction) => {
          const numberSnap = await transaction.get(numberRef);

          if (numberSnap.exists()) {
            throw new Error('NUMBER_TAKEN');
          }

          transaction.set(numberRef, payload);
        });
      }

      await addDoc(logsCol, {
        text: `✨ จอมเวท ${trimmedUser} ได้ผนึกหมายเลข ${number} สำเร็จ!`,
        type: 'claimed',
        timestamp: serverTimestamp(),
      }).catch((error) => {
        console.warn('Log write failed after successful selection', error);
      });
      showNotice({
        type: 'success',
        title: 'ผนึกหมายเลขสำเร็จ',
        message: `จอมเวท ${trimmedUser} ได้ผนึกหมายเลข ${number} แล้ว`,
      });
      return true;
    } catch (error) {
      if (error.message === 'USER_ALREADY_PICKED') {
        showNotice({
          type: 'warning',
          title: 'จารึกซ้ำไม่ได้',
          message: currentUserSelection
            ? `จอมเวทท่านนี้ผนึกหมายเลข ${currentUserSelection.number} แล้ว`
            : 'จอมเวทท่านนี้ผนึกหมายเลขไปแล้วในรอบนี้',
        });
      } else if (error.message === 'NUMBER_TAKEN') {
        showNotice({
          type: 'warning',
          title: 'ช้าไปนิดเดียว',
          message: `หมายเลข ${number} ถูกผนึกไปก่อนแล้ว กรุณาเลือกเลขอื่น`,
        });
      } else {
        console.error(error);
        showNotice({
          type: 'error',
          title: 'ผนึกหมายเลขไม่สำเร็จ',
          message: 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง',
        });
      }
      return false;
    }
  };

  const handleOpenAdminLogin = () => {
    setAdminLoginError('');
    setIsAdminLoginOpen(true);
  };

  const handleAdminLogin = async (event) => {
    event.preventDefault();

    try {
      const response = await fetch('/api/admin-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPassword }),
      });

      if (response.status === 401) {
        setAdminLoginError('รหัสผ่านไม่ถูกต้อง');
        return;
      }

      if (isLocalPreview() && response.status === 404) {
        console.warn('Local Vite dev server does not serve Vercel API routes; opening Admin Dashboard in local preview mode.');
        setAdminLoginError('');
        setIsAdminLoginOpen(false);
        setIsAdminOpen(true);
        return;
      }

      if (!response.ok) {
        throw new Error(`Admin check failed: ${response.status}`);
      }

      setAdminLoginError('');
      setIsAdminLoginOpen(false);
      setIsAdminOpen(true);
      refreshCheckins({ silent: true });
      refreshDrawResults({ silent: true });
    } catch (error) {
      console.error(error);
      setAdminLoginError('ตรวจรหัสไม่ได้ กรุณาลองใหม่อีกครั้ง');
    }
  };

  const handleGateUpdate = async (nextSettings) => {
    if (!adminPassword) {
      setIsAdminOpen(false);
      setIsAdminLoginOpen(true);
      return;
    }

    try {
      const response = await fetch('/api/gate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPassword, ...nextSettings }),
      });

      const contentType = response.headers.get('content-type') || '';
      if (isLocalPreview() && !contentType.includes('application/json')) {
        showNotice({
          type: 'warning',
          title: 'ตั้งเวลาต้องใช้ระบบ Deploy',
          message: 'หน้า local เปิด Dashboard ได้ แต่การตั้งเวลาเปิดปิดจริงต้องทำผ่าน Vercel API',
        });
        return;
      }

      if (response.status === 401) {
        showNotice({
          type: 'error',
          title: 'รหัส Admin ไม่ถูกต้อง',
          message: 'กรุณาตรวจสอบรหัสแล้วลองใหม่อีกครั้ง',
        });
        return;
      }

      if (response.status === 400) {
        showNotice({
          type: 'warning',
          title: 'ตั้งเวลาไม่สำเร็จ',
          message: 'กรุณาตรวจว่าเวลาเปิดต้องมาก่อนเวลาปิด',
        });
        return;
      }

      if (isLocalPreview() && response.status === 404) {
        showNotice({
          type: 'warning',
          title: 'ตั้งเวลาต้องใช้ระบบ Deploy',
          message: 'หน้า local เปิด Dashboard ได้ แต่การตั้งเวลาเปิดปิดจริงต้องทำผ่าน Vercel API',
        });
        return;
      }

      if (!response.ok) {
        throw new Error(`Gate update failed: ${response.status}`);
      }

      const data = await response.json();
      setGateSettings({ ...DEFAULT_GATE_SETTINGS, ...(data.settings || {}) });
      showNotice({
        type: 'success',
        title: 'บันทึกประตูเวลาแล้ว',
        message: 'สถานะเปิดปิดลานพิธีถูกอัปเดตเรียบร้อย',
      });
    } catch (error) {
      console.error(error);
      showNotice({
        type: 'error',
        title: 'บันทึกประตูเวลาไม่สำเร็จ',
        message: 'กรุณาตรวจค่า Admin หรือ Firebase แล้วลองใหม่',
      });
    }
  };

  const handleDrawResultSave = async (resultInput) => {
    if (!adminPassword) {
      setIsAdminOpen(false);
      setIsAdminLoginOpen(true);
      return;
    }

    const payload = {
      drawDate: resultInput.drawDate,
      twoDigit: String(resultInput.twoDigit || '').replace(/\D/g, '').slice(0, 2),
      firstPrize: String(resultInput.firstPrize || '').replace(/\D/g, '').slice(0, 6),
      note: String(resultInput.note || '').trim(),
    };

    if (!payload.drawDate || payload.twoDigit.length !== 2 || (payload.firstPrize && payload.firstPrize.length !== 6)) {
      showNotice({
        type: 'warning',
        title: 'บันทึกผลงวดไม่สำเร็จ',
        message: 'กรุณาใส่วันที่งวด เลขท้าย 2 ตัว และรางวัลที่ 1 ต้องเป็น 6 หลักถ้ากรอก',
      });
      return;
    }

    try {
      const response = await fetch('/api/results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPassword, ...payload }),
      });

      const contentType = response.headers.get('content-type') || '';
      if (isLocalPreview() && !contentType.includes('application/json')) {
        showNotice({
          type: 'warning',
          title: 'บันทึกผลงวดต้องใช้ระบบ Deploy',
          message: 'หน้า local เปิด Dashboard ได้ แต่การบันทึกผลงวดจริงต้องทำผ่าน Vercel API',
        });
        return;
      }

      if (response.status === 401) {
        showNotice({
          type: 'error',
          title: 'รหัส Admin ไม่ถูกต้อง',
          message: 'กรุณาตรวจสอบรหัสแล้วลองใหม่อีกครั้ง',
        });
        return;
      }

      if (response.status === 400) {
        showNotice({
          type: 'warning',
          title: 'รูปแบบผลงวดไม่ถูกต้อง',
          message: 'วันที่ต้องเป็นวันที่งวด และเลขท้ายต้องเป็น 2 หลัก',
        });
        return;
      }

      if (!response.ok) {
        throw new Error(`Draw result save failed: ${response.status}`);
      }

      const data = await response.json();
      setDrawResults((previous) => {
        const next = [
          data.result,
          ...previous.filter((result) => result.drawDate !== data.result.drawDate),
        ];
        return next.sort((a, b) => String(b.drawDate).localeCompare(String(a.drawDate)));
      });
      showNotice({
        type: 'success',
        title: 'บันทึกผลงวดแล้ว',
        message: `เลขท้าย 2 ตัว ${payload.twoDigit} ถูกเก็บเป็นสถิติเรียบร้อย`,
      });
    } catch (error) {
      console.error(error);
      showNotice({
        type: 'error',
        title: 'บันทึกผลงวดไม่สำเร็จ',
        message: 'กรุณาตรวจค่า Admin หรือ Firebase แล้วลองใหม่',
      });
    }
  };

  const handleReset = async () => {
    const confirmed = window.confirm('ยืนยันล้างกระดานสำหรับงวดถัดไปหรือไม่? ระบบจะเก็บสถิติงวดนี้ไว้ก่อนล้าง');
    if (!confirmed) return;

    if (!adminPassword) {
      setIsAdminOpen(false);
      setIsAdminLoginOpen(true);
      return;
    }

    try {
      const response = await fetch('/api/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPassword }),
      });

      if (response.status === 401) {
        showNotice({
          type: 'error',
          title: 'รหัส Admin ไม่ถูกต้อง',
          message: 'กรุณาตรวจสอบรหัสแล้วลองใหม่อีกครั้ง',
        });
        return;
      }

      if (isLocalPreview() && response.status === 404) {
        showNotice({
          type: 'warning',
          title: 'ล้างกระดานต้องใช้ระบบ Deploy',
          message: 'หน้า local เปิด Dashboard ได้ แต่การล้างกระดานต้องทำผ่าน Vercel ที่มี API หลังบ้าน',
        });
        return;
      }

      if (!response.ok) {
        throw new Error(`Reset failed: ${response.status}`);
      }

      showNotice({
        type: 'success',
        title: 'ล้างกระดานสำเร็จ',
        message: 'เก็บสถิติงวดเดิมแล้ว พร้อมเริ่มงวดใหม่',
      });
      setIsAdminOpen(false);
    } catch (e) {
      console.error(e);
      showNotice({
        type: 'error',
        title: 'ล้างกระดานไม่สำเร็จ',
        message: 'กรุณาตรวจค่า Admin หรือ Firebase แล้วลองใหม่',
      });
    }
  };

  const handlePurgeTestData = async () => {
    const confirmed = window.confirm('ยืนยันล้างข้อมูลทดสอบทั้งหมดหรือไม่? ระบบจะล้างทั้งกระดาน พงศาวดาร และสถิติเก่า โดยไม่เก็บ archive เพิ่ม');
    if (!confirmed) return;

    if (!adminPassword) {
      setIsAdminOpen(false);
      setIsAdminLoginOpen(true);
      return;
    }

    try {
      const response = await fetch('/api/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPassword, mode: 'purge-test-data' }),
      });

      if (response.status === 401) {
        showNotice({
          type: 'error',
          title: 'รหัส Admin ไม่ถูกต้อง',
          message: 'กรุณาตรวจสอบรหัสแล้วลองใหม่อีกครั้ง',
        });
        return;
      }

      if (isLocalPreview() && response.status === 404) {
        showNotice({
          type: 'warning',
          title: 'ล้างข้อมูลทดสอบต้องใช้ระบบ Deploy',
          message: 'หน้า local เปิด Dashboard ได้ แต่การล้างข้อมูลจริงต้องทำผ่าน Vercel ที่มี API หลังบ้าน',
        });
        return;
      }

      if (!response.ok) {
        throw new Error(`Test data purge failed: ${response.status}`);
      }

      showNotice({
        type: 'success',
        title: 'ล้างข้อมูลทดสอบสำเร็จ',
        message: 'ล้างกระดาน พงศาวดาร และสถิติเก่าแล้ว พร้อมเริ่มข้อมูลจริง',
      });
      setIsAdminOpen(false);
    } catch (e) {
      console.error(e);
      showNotice({
        type: 'error',
        title: 'ล้างข้อมูลทดสอบไม่สำเร็จ',
        message: 'กรุณาตรวจค่า Admin หรือ Firebase แล้วลองใหม่',
      });
    }
  };

  return (
    <>
      <canvas id="starfield" ref={canvasRef}></canvas>
      <div id="nebula-left" className="nebula"></div>
      <div id="nebula-right" className="nebula"></div>

      <header>
        <h1>🔮 มนตราเสี่ยงทาย 🔮</h1>
        <p>กิจกรรมทำนายตัวเลข 2 หลักเพื่อสะสมพลังโชคชะตาแห่ง MKTXCRC สายมู</p>
      </header>

      <main className={!isJoined ? 'container join-container' : 'ritual-shell'}>
        {!isJoined ? (
          <div className="modal-content join-card" style={{ animation: 'none', position: 'relative' }}>
            <div className="join-rune">✦</div>
            <h2>เข้าสู่ลานพิธี</h2>
            <p className="join-instruction">กรุณาใส่แค่รหัสพนักงานเท่านั้น<br />เพื่อสิทธิ์ในการผนึกหมายเลข</p>
            <form onSubmit={handleJoin}>
              <div className="input-group">
                <input
                  type="text"
                  className="name-input"
                  value={currentUser}
                  onChange={(e) => setCurrentUser(e.target.value)}
                  placeholder="กรอกรหัสพนักงาน..."
                  maxLength={30}
                  required
                />
              </div>
              <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
                เข้าสู่พิธีผนึกหมายเลข
              </button>
            </form>
          </div>
        ) : (
          <>
            <RitualTopPanels
              currentUser={currentUser}
              logs={logs}
              claimedCount={claimedCount}
              availableCount={availableCount}
            />
            <StoneBoard
              selections={selections}
              onSelect={handleSelectNumber}
              currentUser={currentUser}
              currentUserSelection={currentUserSelection}
              gateView={gateView}
              onWarn={showNotice}
            />
            <div className="ritual-footer-actions">
              <button className="btn-magic exit-ritual-btn" type="button" onClick={handleChangeName}>
                🚪 ออกจากลานพิธี / เปลี่ยนชื่อ
              </button>
            </div>
          </>
        )}
      </main>

      <button
        className="admin-reset-btn"
        type="button"
        onClick={handleOpenAdminLogin}
        title="Admin Dashboard"
        aria-label="เปิด Dashboard หลังบ้าน"
      >
        ⚙️
      </button>

      <AdminDashboard
        isOpen={isAdminOpen}
        onClose={() => setIsAdminOpen(false)}
        selections={selections}
        logs={logs}
        archives={archives}
        checkins={checkins}
        drawResults={drawResults}
        gateSettings={gateSettings}
        gateView={gateView}
        onGateUpdate={handleGateUpdate}
        onDrawResultSave={handleDrawResultSave}
        onReset={handleReset}
        onPurgeTestData={handlePurgeTestData}
      />
      <AdminLoginModal
        isOpen={isAdminLoginOpen}
        password={adminPassword}
        error={adminLoginError}
        onPasswordChange={setAdminPassword}
        onSubmit={handleAdminLogin}
        onClose={() => setIsAdminLoginOpen(false)}
      />
      <RitualNotice notice={notice} onClose={() => setNotice(null)} />
    </>
  );
}

export default App;
