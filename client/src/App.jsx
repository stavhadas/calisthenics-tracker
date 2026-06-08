import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import DashboardPage from './pages/DashboardPage';
import ActivitiesPage from './pages/ActivitiesPage';
import LevelPage from './pages/LevelPage';
import ExercisesPage from './pages/ExercisesPage';
import ProgressPage from './pages/ProgressPage';
import GarminStatus from './components/GarminStatus';

function NavItem({ to, label, icon, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
          isActive
            ? 'bg-white/10 text-white'
            : 'text-white/60 hover:text-white hover:bg-white/5'
        }`
      }
    >
      <span className="text-base">{icon}</span>
      {label}
    </NavLink>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-[#0f1117] text-gray-100">
        <div className="flex flex-col md:flex-row min-h-screen">
          {/* Sidebar */}
          <aside className="md:w-56 md:min-h-screen bg-[#161b27] border-r border-white/5 flex flex-col">
            <div className="px-5 py-5 border-b border-white/5">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center text-white font-bold text-sm">CT</div>
                <div>
                  <p className="text-sm font-semibold text-white leading-tight">Calisthenics</p>
                  <p className="text-xs text-white/40 leading-tight">Tracker</p>
                </div>
              </div>
            </div>

            <nav className="flex md:flex-col gap-1 p-3 overflow-x-auto md:overflow-visible">
              <NavItem to="/" label="Dashboard" icon="🏠" end />
              <NavItem to="/levels" label="Levels" icon="📊" />
              <NavItem to="/activities" label="Activities" icon="⚡" />
              <NavItem to="/exercises" label="Exercises" icon="🏋️" />
              <NavItem to="/progress" label="Progress" icon="📈" />
            </nav>

            <div className="mt-auto p-3 border-t border-white/5 hidden md:block">
              <GarminStatus />
            </div>
          </aside>

          {/* Mobile garmin status */}
          <div className="md:hidden bg-[#161b27] border-b border-white/5 px-4 py-2">
            <GarminStatus />
          </div>

          {/* Main content */}
          <main className="flex-1 overflow-auto">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
              <Routes>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/levels" element={<LevelPage />} />
                <Route path="/activities" element={<ActivitiesPage />} />
                <Route path="/exercises" element={<ExercisesPage />} />
                <Route path="/progress" element={<ProgressPage />} />
              </Routes>
            </div>
          </main>
        </div>
      </div>
    </BrowserRouter>
  );
}
