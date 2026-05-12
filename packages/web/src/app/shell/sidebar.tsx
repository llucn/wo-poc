import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { DEMO_MENU, type MenuItem } from './menu-config';

type Props = {
  isNarrow: boolean;
  open: boolean;
  onNavigate: () => void;
};

export function Sidebar({ isNarrow, open, onNavigate }: Props) {
  const className = `sidebar${isNarrow && open ? ' open' : ''}`;
  return (
    <aside className={className} aria-label="Main navigation">
      <div className="sidebar-logo">
        <div className="logo-text">
          <span className="t1">WORK ORDER</span>
          <span className="t2">Operations</span>
        </div>
      </div>
      <nav className="nav">
        {DEMO_MENU.map((group) => (
          <SidebarGroup
            key={group.id}
            item={group}
            isNarrow={isNarrow}
            onNavigate={onNavigate}
          />
        ))}
      </nav>
    </aside>
  );
}

function SidebarGroup({
  item,
  isNarrow,
  onNavigate,
}: {
  item: MenuItem;
  isNarrow: boolean;
  onNavigate: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const className = `nav-group${expanded ? ' expanded' : ''}`;
  return (
    <div className={className}>
      <button
        type="button"
        className="nav-group-header"
        aria-expanded={expanded}
        onClick={() => setExpanded((prev) => !prev)}
      >
        {item.icon}
        <span>{item.label}</span>
        <ChevronIcon />
      </button>
      {expanded && item.children && (
        <div className="nav-group-children">
          {item.children.map((child) => (
            <NavLink
              key={child.id}
              to={child.to ?? '#'}
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
              onClick={() => {
                if (isNarrow) onNavigate();
              }}
            >
              <span>{child.label}</span>
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

function ChevronIcon() {
  return (
    <svg
      className="nav-group-chevron"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}
