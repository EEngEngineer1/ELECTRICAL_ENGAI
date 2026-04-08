import { useState, useMemo } from 'react';
import useStore from '../store/useStore.js';

const PALETTE = ['#2563eb', '#dc2626', '#16a34a', '#9333ea', '#ea580c', '#0891b2', '#ca8a04', '#e11d48'];
const csvExport = (rows, headers) => {
  const csv = [headers.join(','), ...rows.map(r => headers.map(h => `"${(r[h] ?? '').toString().replace(/"/g, '""')}"`).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'components.csv'; a.click();
};

export default function ComponentTable() {
  const { components, setCurrentPage } = useStore();
  const [filter, setFilter] = useState({ type: '', manufacturer: '' });
  const [selected, setSelected] = useState(null);

  if (!components || components.length === 0) return null;

  const manufacturers = [...new Set(components.map(c => c.manufacturer).filter(Boolean))];
  const mfrColour = Object.fromEntries(manufacturers.map((m, i) => [m, PALETTE[i % PALETTE.length]]));
  const types = [...new Set(components.map(c => c.type).filter(Boolean))];

  const filtered = components.filter(c =>
    (!filter.type || c.type === filter.type) &&
    (!filter.manufacturer || c.manufacturer === filter.manufacturer)
  );

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="px-4 py-3 border-b flex items-center justify-between">
        <h2 className="font-semibold text-slate-700">Components ({filtered.length})</h2>
        <button onClick={() => csvExport(filtered, ['designation','description','type','manufacturer','partNumber','rating','location'])}
          className="text-xs text-blue-600 hover:underline">Export CSV</button>
      </div>

      {/* Manufacturer legend */}
      <div className="px-4 py-2 flex flex-wrap gap-2 border-b">
        {manufacturers.map(m => (
          <span key={m} className="flex items-center gap-1 text-xs">
            <span className="w-3 h-3 rounded" style={{ backgroundColor: mfrColour[m] }} />
            {m}
          </span>
        ))}
      </div>

      {/* Filters */}
      <div className="px-4 py-2 flex gap-2 border-b">
        <select value={filter.type} onChange={e => setFilter(f => ({ ...f, type: e.target.value }))}
          className="text-xs border rounded px-2 py-1">
          <option value="">All Types</option>
          {types.map(t => <option key={t}>{t}</option>)}
        </select>
        <select value={filter.manufacturer} onChange={e => setFilter(f => ({ ...f, manufacturer: e.target.value }))}
          className="text-xs border rounded px-2 py-1">
          <option value="">All Manufacturers</option>
          {manufacturers.map(m => <option key={m}>{m}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto max-h-96">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 sticky top-0">
            <tr>
              <th className="px-3 py-2 text-left"></th>
              <th className="px-3 py-2 text-left">Designation</th>
              <th className="px-3 py-2 text-left">Description</th>
              <th className="px-3 py-2 text-left">Type</th>
              <th className="px-3 py-2 text-left">Manufacturer</th>
              <th className="px-3 py-2 text-left">Part No.</th>
              <th className="px-3 py-2 text-left">Rating</th>
              <th className="px-3 py-2 text-left">Pages</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c, i) => (
              <tr key={i} onClick={() => setSelected(selected === i ? null : i)}
                className="border-t hover:bg-slate-50 cursor-pointer">
                <td className="w-1" style={{ backgroundColor: mfrColour[c.manufacturer] || '#e2e8f0' }} />
                <td className="px-3 py-2 font-mono">{c.designation}</td>
                <td className="px-3 py-2">{c.description}</td>
                <td className="px-3 py-2">{c.type}</td>
                <td className="px-3 py-2">{c.manufacturer}</td>
                <td className="px-3 py-2 font-mono text-xs">{c.partNumber}</td>
                <td className="px-3 py-2">{c.rating}</td>
                <td className="px-3 py-2">
                  {(c.pages || []).map(p => (
                    <button key={p} onClick={(e) => { e.stopPropagation(); setCurrentPage(p); }}
                      className="text-blue-600 hover:underline mr-1">{p}</button>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Slide-out detail panel */}
      {selected !== null && filtered[selected] && (
        <div className="border-t p-4 bg-slate-50 space-y-2">
          <div className="flex justify-between">
            <h3 className="font-semibold">{filtered[selected].designation}</h3>
            <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600">Close</button>
          </div>
          <p className="text-sm">{filtered[selected].description}</p>
          <p className="text-sm">Location: {filtered[selected].location}</p>
          <p className="text-sm">Connections: {(filtered[selected].connections || []).join(', ')}</p>
          {filtered[selected].notes && <p className="text-sm text-amber-600">Notes: {filtered[selected].notes}</p>}
          {filtered[selected].partNumber && (
            <a href={`https://www.google.com/search?q=${encodeURIComponent(filtered[selected].partNumber + ' datasheet')}`}
              target="_blank" rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:underline">Search datasheet</a>
          )}
        </div>
      )}
    </div>
  );
}
