import { Routes, Route, NavLink, useLocation } from 'react-router-dom'
import { Home, MapPin, Target, Zap, Activity, Brain, FileBarChart, Repeat, Droplets, Circle, AlertTriangle } from 'lucide-react'
import Welcome from './pages/Welcome.jsx'
import Location from './pages/Location.jsx'
import Calibration from './pages/Calibration.jsx'
import Inference from './pages/Inference.jsx'
import Visualization from './pages/Visualization.jsx'
import AIAnalytics from './pages/AIAnalytics.jsx'
import JunctionReport from './pages/JunctionReport.jsx'
import BehaviorPatterns from './pages/BehaviorPatterns.jsx'
import FloodDetection from './pages/FloodDetection.jsx'
import PotholeDetection from './pages/PotholeDetection.jsx'
import DisasterRerouting from './pages/DisasterRerouting.jsx'
import LandingPage from './pages/LandingPage.jsx'

const NAV_PIPELINE = [
  { to: '/dashboard',                    label: 'Welcome',          icon: Home },
  { to: '/dashboard/location',           label: 'Location',         icon: MapPin },
  { to: '/dashboard/calibration',        label: 'Calibration',      icon: Target },
  { to: '/dashboard/inference',          label: 'Inference',        icon: Zap },
  { to: '/dashboard/visualization',     label: 'Visualization',    icon: Activity },
]

const NAV_ANALYSIS = [
  { to: '/dashboard/ai-analytics',      label: 'AI Analytics',     icon: Brain },
  { to: '/dashboard/junction-report',   label: 'Junction Report',  icon: FileBarChart },
  { to: '/dashboard/behavior-patterns', label: 'Behavior Patterns',icon: Repeat },
  { to: '/dashboard/flood-detection',   label: 'Flood Detection',  icon: Droplets },
  { to: '/dashboard/pothole-detection', label: 'Pothole Detection', icon: Circle },
  { to: '/dashboard/disaster-rerouting',label: 'Disaster Rerouting',icon: AlertTriangle },
]

const ALL_NAV = [...NAV_PIPELINE, ...NAV_ANALYSIS]

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
          <div className="sidebar-version">v1.2.0</div>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section-label">Pipeline</div>
          {NAV_PIPELINE.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/dashboard'}
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            >
              <Icon size={16} className="nav-icon" />
              {label}
            </NavLink>
          ))}

          <div className="nav-section-label" style={{ marginTop: 12 }}>Analysis</div>
          {NAV_ANALYSIS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            >
              <Icon size={16} className="nav-icon" />
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
              {ALL_NAV.find(n => n.to === location.pathname)?.label || 'Dashboard'}
            </div>
            <div className="page-subtitle">TrafficLab Workspace</div>
          </div>
          <div className="user-profile">
            <span className="user-avatar">TL</span>
          </div>
        </header>
        <div className="page-body">
          <Routes>
            <Route path="/dashboard"                     element={<Welcome />} />
            <Route path="/dashboard/location"            element={<Location />} />
            <Route path="/dashboard/calibration"         element={<Calibration />} />
            <Route path="/dashboard/inference"           element={<Inference />} />
            <Route path="/dashboard/visualization"       element={<Visualization />} />
            <Route path="/dashboard/ai-analytics"        element={<AIAnalytics />} />
            <Route path="/dashboard/junction-report"     element={<JunctionReport />} />
            <Route path="/dashboard/behavior-patterns"   element={<BehaviorPatterns />} />
            <Route path="/dashboard/flood-detection"     element={<FloodDetection />} />
            <Route path="/dashboard/pothole-detection"   element={<PotholeDetection />} />
            <Route path="/dashboard/disaster-rerouting"  element={<DisasterRerouting />} />
          </Routes>
        </div>
      </main>
    </div>
  )
}
