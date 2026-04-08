import { Routes, Route, NavLink } from 'react-router-dom';
import AnalysePage from './pages/AnalysePage.jsx';
import InstrumentPage from './pages/InstrumentPage.jsx';
import CrossRefPage from './pages/CrossRefPage.jsx';

const navLinks = [
  { to: '/', label: 'Analyse' },
  { to: '/instruments', label: 'Instruments' },
  { to: '/crossref', label: 'Cross-Reference' }
];

export default function App() {
  return (
    <div className="h-screen bg-slate-50 flex flex-col overflow-hidden">
      <header className="bg-slate-900 text-white px-6 py-2.5 flex items-center gap-8 shrink-0">
        <h1 className="text-lg font-bold tracking-tight">ElecDocs</h1>
        <nav className="flex gap-1">
          {navLinks.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `px-4 py-1.5 rounded text-sm font-medium transition-colors ${
                  isActive ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-700'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <span className="ml-auto text-xs text-slate-500">EnerTherm Engineering</span>
      </header>
      <main className="flex-1 p-4 overflow-hidden">
        <Routes>
          <Route path="/" element={<AnalysePage />} />
          <Route path="/instruments" element={<InstrumentPage />} />
          <Route path="/crossref" element={<CrossRefPage />} />
        </Routes>
      </main>
    </div>
  );
}
