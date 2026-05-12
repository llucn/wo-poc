import { useEffect, useRef, useState } from 'react';

export function AvatarMenu() {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open]);

  return (
    <div className="topbar-avatar-wrapper" ref={wrapperRef}>
      <button
        type="button"
        className="topbar-avatar"
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        DU
      </button>
      {open && (
        <div className="avatar-dropdown" role="menu">
          <div className="avatar-dropdown-info">
            <strong>Demo User</strong>
            demo@example.com
          </div>
          <button
            type="button"
            className="avatar-dropdown-item"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            Profile
          </button>
          <button
            type="button"
            className="avatar-dropdown-item"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            Logout
          </button>
        </div>
      )}
    </div>
  );
}
