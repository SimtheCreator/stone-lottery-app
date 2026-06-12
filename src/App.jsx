import { useEffect, useMemo, useRef, useState } from 'react';
import { addDoc, doc, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore';
import { archivesCol, db, logsCol, selectionsCol } from './firebase';
import StoneBoard from './components/StoneBoard';

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

const isPermissionError = (error) => (
  error?.code === 'permission-denied'
  || error?.message?.toLowerCase().includes('permission')
  || error?.message?.toLowerCase().includes('insufficient')
);

const formatDateTime = (value) => {
  const millis = getTimeValue(value);
  if (!millis) return 'รอเวลาจากระบบ';

  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(millis));
};

function RitualTopPanels({ currentUser, logs, claimedCount, availableCount }) {
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
            <li>หนึ่งจอมเวทย์เลือกเลขได้ <strong>1 หมายเลขเด็ด</strong> เท่านั้นในแต่ละรอบ</li>
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
          {logs.map((log) => (
            <div
              key={log.id}
              className={`log-item ${log.type === 'claimed' ? 'claimed-log' : ''}`}
            >
              {log.text}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function AdminDashboard({ isOpen, onClose, selections, logs, archives, onReset }) {
  const claimedEntries = useMemo(() => (
    Object.entries(selections)
      .map(([number, data]) => ({ number, ...data }))
      .sort((a, b) => getTimeValue(b.timestamp) - getTimeValue(a.timestamp))
  ), [selections]);

  const claimedCount = claimedEntries.length;
  const availableCount = 100 - claimedCount;
  const latestClaim = claimedEntries[0];

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
            <span>จองสำเร็จ</span>
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
                  <small>{log.text}</small>
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

        <div className="admin-actions">
          <button className="btn btn-secondary" type="button" onClick={onClose}>
            กลับสู่ลานพิธี
          </button>
          <button className="btn btn-danger" type="button" onClick={onReset}>
            ล้างกระดานสำหรับงวดถัดไป
          </button>
        </div>
      </section>
    </div>
  );
}

function App() {
  const [selections, setSelections] = useState({});
  const [logs, setLogs] = useState(INITIAL_LOGS);
  const [archives, setArchives] = useState([]);
  const [currentUser, setCurrentUser] = useState('');
  const [isJoined, setIsJoined] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const canvasRef = useRef(null);

  const claimedCount = Object.keys(selections).length;
  const availableCount = 100 - claimedCount;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const stars = [];
    const count = 100;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', resize);
    resize();

    for (let i = 0; i < count; i++) {
      stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 1.5 + 0.5,
        alpha: Math.random(),
        speed: Math.random() * 0.02 + 0.005,
      });
    }

    let animationFrameId;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
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
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  useEffect(() => {
    const savedUser = localStorage.getItem('lottery_currentUser');
    if (savedUser) {
      setCurrentUser(savedUser);
      setIsJoined(true);
    }
  }, []);

  useEffect(() => {
    const unsubSel = onSnapshot(selectionsCol, (snap) => {
      const sel = {};
      snap.forEach((document) => {
        sel[document.id] = document.data();
      });
      setSelections(sel);
    }, (error) => {
      console.error('Selection listener failed', error);
      alert('ไม่สามารถโหลดข้อมูลหมายเลขได้ กรุณารีเฟรชหน้าอีกครั้ง');
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
  }, []);

  const handleJoin = (e) => {
    e.preventDefault();
    const trimmedUser = currentUser.trim();
    if (trimmedUser) {
      setCurrentUser(trimmedUser);
      localStorage.setItem('lottery_currentUser', trimmedUser);
      setIsJoined(true);
    }
  };

  const handleChangeName = () => {
    localStorage.removeItem('lottery_currentUser');
    setIsJoined(false);
    setCurrentUser('');
  };

  const handleSelectNumber = async (number) => {
    const trimmedUser = currentUser.trim();
    if (!trimmedUser) {
      alert('กรุณาระบุชื่อก่อนเลือกหมายเลข');
      return false;
    }

    const participantId = getParticipantId(trimmedUser);
    const hasPicked = Object.values(selections).some((selection) => (
      getParticipantId(selection.name || '') === participantId
    ));
    if (hasPicked) {
      alert('คุณได้จองหมายเลขไปแล้ว ไม่สามารถเลือกซ้ำได้ครับ');
      return false;
    }

    if (selections[number]) {
      alert('หมายเลขนี้ถูกเลือกไปแล้วครับ');
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
        text: `✨ จอมเวทย์ ${trimmedUser} ได้ผนึกหมายเลข ${number} สำเร็จ!`,
        type: 'claimed',
        timestamp: serverTimestamp(),
      }).catch((error) => {
        console.warn('Log write failed after successful selection', error);
      });
      return true;
    } catch (error) {
      if (error.message === 'USER_ALREADY_PICKED') {
        alert('คุณได้จองหมายเลขไปแล้ว ไม่สามารถเลือกซ้ำได้ครับ');
      } else if (error.message === 'NUMBER_TAKEN') {
        alert('หมายเลขนี้ถูกเลือกไปแล้วครับ');
      } else {
        console.error(error);
        alert('เกิดข้อผิดพลาดในการจองหมายเลข กรุณาลองใหม่อีกครั้ง');
      }
      return false;
    }
  };

  const handleReset = async () => {
    const confirmed = window.confirm('ยืนยันล้างกระดานสำหรับงวดถัดไปหรือไม่? ระบบจะเก็บสถิติงวดนี้ไว้ก่อนล้าง');
    if (!confirmed) return;

    const pwd = prompt('กรุณาใส่รหัสผ่าน Admin เพื่อล้างข้อมูล');
    if (pwd === null) return;

    try {
      const response = await fetch('/api/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwd }),
      });

      if (response.status === 401) {
        alert('รหัสผ่านไม่ถูกต้อง');
        return;
      }

      if (!response.ok) {
        throw new Error(`Reset failed: ${response.status}`);
      }

      alert('✨ เก็บสถิติและล้างศิลาจารึกสำเร็จ พร้อมเริ่มงวดใหม่!');
      setIsAdminOpen(false);
    } catch (e) {
      console.error(e);
      alert('เกิดข้อผิดพลาดในการล้างข้อมูล');
    }
  };

  return (
    <>
      <canvas id="starfield" ref={canvasRef}></canvas>
      <div id="nebula-left" className="nebula"></div>
      <div id="nebula-right" className="nebula"></div>

      <header>
        <h1>🔮 มนตราเสี่ยงทาย 🔮</h1>
        <p>กิจกรรมทำนายตัวเลข 2 หลักเพื่อสะสมพลังโชคชะตาแห่ง MKT สายมู</p>
      </header>

      <main className={!isJoined ? 'container join-container' : 'ritual-shell'}>
        {!isJoined ? (
          <div className="modal-content join-card" style={{ animation: 'none', position: 'relative' }}>
            <div className="join-rune">✦</div>
            <h2>เข้าสู่ลานพิธี</h2>
            <p className="join-instruction">กรุณาระบุชื่อของท่านจอมเวทย์<br />เพื่อสิทธิ์ในการจองหมายเลข</p>
            <form onSubmit={handleJoin}>
              <div className="input-group">
                <input
                  type="text"
                  className="name-input"
                  value={currentUser}
                  onChange={(e) => setCurrentUser(e.target.value)}
                  placeholder="กรอกชื่อของคุณ..."
                  maxLength={30}
                  required
                />
              </div>
              <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
                เข้าร่วมพิธีจองหมายเลข
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
        onClick={() => setIsAdminOpen(true)}
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
        onReset={handleReset}
      />
    </>
  );
}

export default App;
