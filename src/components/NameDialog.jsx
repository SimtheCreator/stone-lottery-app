import { useState, useRef, useEffect } from 'react';

function NameDialog({ isOpen, number, onClose, onSubmit }) {
  const [name, setName] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setName('');
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    
    // Add some random delay to simulate "engraving" if we want, but let's just submit
    onSubmit(number, name.trim());
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content stone-texture" onClick={e => e.stopPropagation()}>
        <h2>สลักชื่อลงบนศิลา</h2>
        <p>กรุณากรอกชื่อของคุณเพื่อยืนยันการจองหมายเลข</p>
        
        <div className="selected-number-display gold-text">
          {number}
        </div>
        
        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label htmlFor="nameInput">ชื่อ-นามสกุล / ชื่อเล่น</label>
            <input 
              id="nameInput"
              ref={inputRef}
              type="text" 
              className="name-input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="กรอกชื่อของคุณ..."
              maxLength={30}
              required
            />
          </div>
          
          <div className="button-group">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              ยกเลิก
            </button>
            <button type="submit" className="btn btn-primary">
              ยืนยันการจารึก
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default NameDialog;
