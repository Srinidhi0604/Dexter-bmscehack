import { Routes, Route, NavLink, useLocation } from 'react-router-dom'
import { Home, MapPin, Target, Zap, Activity } from 'lucide-react'
import Welcome from './pages/Welcome.jsx'
import Location from './pages/Location.jsx'
import Calibration from './pages/Calibration.jsx'
import Inference from './pages/Inference.jsx'
import Visualization from './pages/Visualization.jsx'
import LandingPage from './pages/LandingPage.jsx'

const NAV = [
  { to: '/dashboard',             label: 'Welcome',       icon: Home },
  { to: '/dashboard/location',     label: 'Location',      icon: MapPin },
  { to: '/dashboard/calibration',  label: 'Calibration',   icon: Target },
  { to: '/dashboard/inference',    label: 'Inference',     icon: Zap },
  { to: '/dashboard/visualization',label: 'Visualization', icon: Activity },
]

export default function App() {
  const location = useLocation();

  if (location.pathname === '/' || location.pathname === '/landing') {
    return (
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/landing" element={<LandingPage />} />
      </Routes>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="sidebar-logo-title">TrafficLab</div>
          <div className="sidebar-logo-sub">ANALYTICS ENGINE</div>
          <div className="sidebar-version">v1.1.0</div>
        </div>

        <nav className="sidebar-nav">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/dashboard'}
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            >
              <Icon size={18} className="nav-icon" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="status-dot">API Connected</div>
        </div>
      </aside>

      <main className="main-content">
        <header className="page-header d-flex align-center justify-between">
          <div>
            <div className="page-title">
              {NAV.find(n => n.to === location.pathname)?.label || 'Dashboard'}
            </div>
            <div className="page-subtitle">TrafficLab Workspace</div>
          </div>
          <div className="user-profile">
            <span className="user-avatar">TL</span>
          </div>
        </header>
        <div className="page-body">
          <Routes>
            <Route path="/dashboard"               element={<Welcome />} />
            <Route path="/dashboard/location"      element={<Location />} />
            <Route path="/dashboard/calibration"   element={<Calibration />} />
            <Route path="/dashboard/inference"     element={<Inference />} />
            <Route path="/dashboard/visualization" element={<Visualization />} />
          </Routes>
        </div>
      </main>
    </div>
  )
}
