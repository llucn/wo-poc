import { useEffect, useRef, useState } from 'react';
import { useAuth } from 'react-oidc-context';
import { useNavigate } from 'react-router-dom';
import { signOut } from '../../app/auth/auth-actions';
import { useAuthUser } from '../../app/auth/use-auth-user';

export function AvatarMenu() {
  const auth = useAuth();
  const navigate = useNavigate();
  const { name, email, initials } = useAuthUser();
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

  const handleProfile = () => {
    setOpen(false);
    navigate('/profile');
  };

  const handleLogout = () => {
    setOpen(false);
    void signOut(auth);
  };

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
        {initials}
      </button>
      {open && (
        <div className="avatar-dropdown" role="menu">
          <div className="avatar-dropdown-info">
            <strong>{name}</strong>
            {email ?? ''}
          </div>
          <button
            type="button"
            className="avatar-dropdown-item"
            role="menuitem"
            onClick={handleProfile}
          >
            Profile
          </button>
          <button
            type="button"
            className="avatar-dropdown-item"
            role="menuitem"
            onClick={handleLogout}
          >
            Logout
          </button>
        </div>
      )}
    </div>
  );
}
