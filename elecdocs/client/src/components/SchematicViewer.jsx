import { useState } from 'react';
import useStore from '../store/useStore.js';

function buildDpiOptions(dpiMax, dpiUsed) {
  const min = 96;
  const step = Math.floor((dpiMax - min) / 3);
  return [
    { label: 'Auto (recommended)', sublabel: `${dpiUsed} DPI — best quality for this drawing`, value: null },
    { label: 'Standard', sublabel: `${min + step} DPI — fast, readable for most drawings`, value: min + step },
    { label: 'High', sublabel: `${min + (step * 2)} DPI — better for dense or detailed drawings`, value: min + (step * 2) },
    { label: 'Maximum', sublabel: `${dpiMax} DPI — highest detail this drawing can support`, value: dpiMax }
  ];
}

export default function SchematicViewer() {
  const { pageImages, currentPage, setCurrentPage, pageCount, zoom, setZoom, dpiUsed, dpiMax, pageFormat, uploadId, updateDpi } = useStore();
  const [rerendering, setRerendering] = useState(false);
  const [selectedDpi, setSelectedDpi] = useState(null);

  if (pageImages.length === 0) return null;

  const dpiOptions = buildDpiOptions(dpiMax, dpiUsed);

  const changeDpi = async (dpiValue) => {
    setSelectedDpi(dpiValue);
    if (dpiValue === null && selectedDpi === null) return;
    setRerendering(true);
    try {
      const res = await fetch('/api/upload/rerasterise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadId, dpi: dpiValue })
      });
      const data = await res.json();
      if (data.pageImages) updateDpi(data.dpiUsed, data.pageImages);
    } catch (err) {
      console.error('Re-render failed:', err);
    } finally {
      setRerendering(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-slate-700">Schematic Viewer</h2>
        <span className="text-xs text-slate-400">{pageFormat} | {dpiUsed} DPI</span>
      </div>

      {/* DPI Controls */}
      <div className="flex gap-2 items-center">
        <span className="text-xs text-slate-500" title="Higher detail captures finer text and wiring on complex drawings. Auto selects the best option automatically.">DPI:</span>
        {dpiOptions.map((opt) => (
          <button
            key={opt.label}
            onClick={() => changeDpi(opt.value)}
            title={opt.sublabel}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              (selectedDpi === opt.value) || (selectedDpi === null && opt.value === null)
                ? 'bg-blue-600 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Page navigation */}
      <div className="flex items-center gap-3">
        <button onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
          disabled={currentPage <= 1}
          className="px-2 py-1 text-sm bg-slate-100 rounded disabled:opacity-40">
          Prev
        </button>
        <span className="text-sm text-slate-600">
          Page <input type="number" min={1} max={pageCount} value={currentPage}
            onChange={(e) => setCurrentPage(Math.max(1, Math.min(pageCount, parseInt(e.target.value) || 1)))}
            className="w-12 text-center border rounded mx-1"
          /> of {pageCount}
        </span>
        <button onClick={() => setCurrentPage(Math.min(pageCount, currentPage + 1))}
          disabled={currentPage >= pageCount}
          className="px-2 py-1 text-sm bg-slate-100 rounded disabled:opacity-40">
          Next
        </button>

        <div className="ml-auto flex gap-1">
          {[0.5, 0.75, 1, 1.25, 1.5].map(z => (
            <button key={z} onClick={() => setZoom(z)}
              className={`px-2 py-1 text-xs rounded ${zoom === z ? 'bg-blue-600 text-white' : 'bg-slate-100'}`}>
              {z * 100}%
            </button>
          ))}
        </div>
      </div>

      {/* Image display */}
      <div className="overflow-auto border rounded bg-slate-100 max-h-[600px]">
        {rerendering ? (
          <div className="flex items-center justify-center h-64 gap-2">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-slate-500">Re-rendering at {selectedDpi || dpiUsed} DPI...</span>
          </div>
        ) : (
          <img
            src={`data:image/jpeg;base64,${pageImages[currentPage - 1]}`}
            alt={`Schematic page ${currentPage}`}
            style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}
            className="max-w-none"
          />
        )}
      </div>
    </div>
  );
}
