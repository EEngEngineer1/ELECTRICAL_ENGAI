import { useState } from 'react';
import useStore from '../store/useStore.js';

const TYPE_COLOURS = { DI: 'bg-blue-100 text-blue-800', DO: 'bg-orange-100 text-orange-800', AI: 'bg-green-100 text-green-800', AO: 'bg-purple-100 text-purple-800', PI: 'bg-cyan-100 text-cyan-800' };

const csvExport = (rows) => {
  const headers = ['tagNumber','description','signalType','range','plcAddress','panel','cableRef'];
  const csv = [headers.join(','), ...rows.map(r => headers.map(h => `"${(r[h]??'').toString().replace(/"/g,'""')}"`).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'io-signals.csv'; a.click();
};

export default function IOTable() {
  const { ioSignals } = useStore();
  const [filter, setFilter] = useState('');

  if (!ioSignals || ioSignals.length === 0) return null;

  const counts = {};
  ioSignals.forEach(s => { counts[s.signalType] = (counts[s.signalType] || 0) + 1; });

  const filtered = filter ? ioSignals.filter(s => s.signalType === filter) : ioSignals;

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="px-4 py-3 border-b flex items-center justify-between">
        <h2 className="font-semibold text-slate-700">I/O Signals ({ioSignals.length})</h2>
        <button onClick={() => csvExport(filtered)} className="text-xs text-blue-600 hover:underline">Export CSV</button>
      </div>

      {/* Summary bar */}
      <div className="px-4 py-2 flex gap-2 border-b">
        <button onClick={() => setFilter('')}
          className={`text-xs px-2 py-1 rounded ${!filter ? 'bg-slate-800 text-white' : 'bg-slate-100'}`}>
          All ({ioSignals.length})
        </button>
        {Object.entries(counts).map(([type, count]) => (
          <button key={type} onClick={() => setFilter(type)}
            className={`text-xs px-2 py-1 rounded ${filter === type ? 'bg-slate-800 text-white' : TYPE_COLOURS[type] || 'bg-slate-100'}`}>
            {type} ({count})
          </button>
        ))}
      </div>

      <div className="overflow-x-auto max-h-80">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 sticky top-0">
            <tr>
              <th className="px-3 py-2 text-left">Tag</th>
              <th className="px-3 py-2 text-left">Description</th>
              <th className="px-3 py-2 text-left">Type</th>
              <th className="px-3 py-2 text-left">Range</th>
              <th className="px-3 py-2 text-left">PLC Address</th>
              <th className="px-3 py-2 text-left">Panel</th>
              <th className="px-3 py-2 text-left">Cable</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s, i) => (
              <tr key={i} className="border-t hover:bg-slate-50">
                <td className="px-3 py-2 font-mono">{s.tagNumber}</td>
                <td className="px-3 py-2">{s.description}</td>
                <td className="px-3 py-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${TYPE_COLOURS[s.signalType] || ''}`}>{s.signalType}</span>
                </td>
                <td className="px-3 py-2">{s.range}</td>
                <td className="px-3 py-2 font-mono text-xs">{s.plcAddress}</td>
                <td className="px-3 py-2">{s.panel}</td>
                <td className="px-3 py-2">{s.cableRef}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
