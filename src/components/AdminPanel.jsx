import { Link } from 'react-router-dom';

function AdminPanel({ selections, onReset }) {
  const selectionEntries = Object.entries(selections).sort((a, b) => a[0].localeCompare(b[0]));
  const count = selectionEntries.length;

  return (
    <div className="app-container">
      <div className="admin-container stone-texture" style={{ padding: '2rem', marginTop: '2rem' }}>
        <div className="admin-header">
          <div>
            <h2 className="glowing-text" style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Admin Panel</h2>
            <p>ระบบจัดการหลังบ้าน: มีผู้เข้าร่วมแล้ว {count} / 100 คน</p>
          </div>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <Link to="/" className="btn btn-secondary" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
              กลับไปหน้าหลัก
            </Link>
            <button className="btn btn-danger" onClick={onReset}>
              ล้างข้อมูลทั้งหมด (Reset)
            </button>
          </div>
        </div>

        {count === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#888' }}>
            ยังไม่มีผู้เข้าร่วม
          </div>
        ) : (
          <div className="admin-list">
            {selectionEntries.map(([number, data]) => (
              <div key={number} className="admin-card stone-texture">
                <span className="number gold-text">{number}</span>
                <span className="name">{data.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminPanel;
