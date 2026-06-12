import { createPortal } from 'react-dom';

function ConfirmDialog({ isOpen, number, currentUser, onClose, onConfirm }) {
  if (!isOpen) return null;

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <h2>ยืนยันการผนึกหมายเลข</h2>
        <p>ท่านจอมเวท <strong className="gold-text">{currentUser}</strong> ต้องการผนึกหมายเลขนี้ใช่หรือไม่?</p>
        
        <div className="selected-number-display">
          {number}
        </div>
        
        <p style={{ fontSize: '0.85rem', color: '#ff2a5f', marginBottom: '1.5rem' }}>
          * ท่านสามารถเลือกได้เพียง 1 หมายเลขเท่านั้น และไม่สามารถเปลี่ยนได้ในภายหลัง
        </p>

        <div className="button-group">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            ยกเลิก
          </button>
          <button type="button" className="btn btn-primary" onClick={() => onConfirm(number)}>
            ยืนยันการผนึก
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default ConfirmDialog;
