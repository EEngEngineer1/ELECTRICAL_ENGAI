import { useState } from 'react';
import useStore from '../store/useStore.js';

const SEV = { critical: 'bg-red-600 text-white', major: 'bg-amber-500 text-white', minor: 'bg-slate-400 text-white' };

function FormattedText({ text }) {
  if (!text) return null;
  return text.split('\n').map((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) return <div key={i} className="h-2" />;
    if (trimmed.startsWith('•') || trimmed.startsWith('-') || trimmed.startsWith('–')) {
      return <div key={i} className="flex gap-2 ml-2 mt-0.5"><span className="text-blue-400 shrink-0">•</span><span>{trimmed.replace(/^[•\-–]\s*/, '')}</span></div>;
    }
    if (trimmed.endsWith(':')) {
      return <div key={i} className="font-medium text-slate-700 mt-2 mb-0.5">{trimmed}</div>;
    }
    return <div key={i} className="mt-1">{trimmed}</div>;
  });
}

export default function ProcessControlPanel() {
  const { uploadId, processControl, setProcessControl } = useStore();
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(!!processControl);
  const [sections, setSections] = useState([true, true, true]);
  const [exporting, setExporting] = useState(false);

  const toggle = (i) => setSections(s => s.map((v, j) => j === i ? !v : v));

  const run = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/analyse/processcontrol', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setProcessControl(data);
      setExpanded(true);
    } catch (err) {
      alert('Process control analysis failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const exportReport = async () => {
    setExporting(true);
    try {
      const res = await fetch('/api/crossref/export/processcontrol', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadId })
      });
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'ElecDocs-Process-Control-Report.docx';
      a.click();
    } catch (err) {
      alert('Export failed: ' + err.message);
    } finally {
      setExporting(false);
    }
  };

  const result = processControl;
  const loops = result?.controlLoops || [];
  const safety = result?.safetyAnalysis || [];
  const gaps = result?.safetyGapSummary || [];

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="px-4 py-3 flex items-center justify-between border-b">
        <h2 className="text-sm font-semibold text-slate-700">Process Control Analysis</h2>
        {!expanded ? (
          <button onClick={run} disabled={!uploadId || loading}
            title={!uploadId ? 'Upload a schematic first' : ''}
            className="px-4 py-1.5 bg-indigo-600 text-white rounded text-sm font-medium disabled:opacity-40 hover:bg-indigo-700">
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Analysing — this may take 1-3 minutes...
              </span>
            ) : 'Analyse Process Control'}
          </button>
        ) : (
          <button onClick={() => setExpanded(!expanded)} className="text-xs text-slate-400 hover:text-slate-600">
            {expanded ? 'Collapse' : 'Expand'}
          </button>
        )}
      </div>

      {expanded && result && (
        <div className="p-4 space-y-3">
          {/* Section 1: Overview */}
          <div>
            <button onClick={() => toggle(0)} className="flex items-center gap-2 w-full text-left text-sm font-medium text-slate-700 hover:text-slate-900 pb-1 border-b border-slate-200">
              <span className="text-xs">{sections[0] ? '▼' : '▶'}</span> Plain English Overview
            </button>
            {sections[0] && (
              <div className="mt-2 text-xs text-slate-600 leading-relaxed bg-slate-50 rounded p-3" style={{ fontFamily: 'Segoe UI, Calibri, sans-serif' }}>
                <FormattedText text={result.overview} />
              </div>
            )}
          </div>

          {/* Section 2: Control Loops */}
          <div>
            <button onClick={() => toggle(1)} className="flex items-center gap-2 w-full text-left text-sm font-medium text-slate-700 hover:text-slate-900 pb-1 border-b border-slate-200">
              <span className="text-xs">{sections[1] ? '▼' : '▶'}</span> Control Loop Breakdown ({loops.length})
            </button>
            {sections[1] && (
              <div className="mt-2 space-y-3">
                {loops.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No formal control loops were identified in this schematic.</p>
                ) : loops.map((loop, i) => (
                  <div key={i} className="border rounded-lg p-2.5 bg-slate-50">
                    <div className="font-mono text-xs font-semibold text-indigo-700">{loop.loopId}</div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-xs text-slate-600">
                      <div>Process Variable: <span className="font-medium text-slate-800">{loop.processVariable}</span></div>
                      <div>Loop Type: <span className="font-medium text-slate-800">{loop.loopType}</span></div>
                      <div>Sensor: <span className="font-medium">{loop.sensor?.tag} ({loop.sensor?.signalType} {loop.sensor?.range})</span></div>
                      <div>Setpoint: <span className="font-medium">{loop.setpoint || 'Not shown'}</span></div>
                      <div>Controller: <span className="font-medium">{loop.controller?.ref} ({loop.controller?.type})</span></div>
                      <div>Final Element: <span className="font-medium">{loop.finalElement?.tag} — {loop.finalElement?.action}</span></div>
                    </div>
                    {loop.notes && <p className="text-xs text-amber-600 mt-1">{loop.notes}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section 3: Safety Analysis */}
          <div>
            <button onClick={() => toggle(2)} className="flex items-center gap-2 w-full text-left text-sm font-medium text-slate-700 hover:text-slate-900 pb-1 border-b border-slate-200">
              <span className="text-xs">{sections[2] ? '▼' : '▶'}</span> Safety Failure Analysis ({safety.length})
            </button>
            {sections[2] && (
              <div className="mt-2 space-y-3">
                {gaps.length > 0 && (
                  <div className="border-2 border-red-300 bg-red-50 rounded-lg p-3">
                    <h4 className="text-xs font-medium text-red-700 mb-1">Safety Gaps Identified</h4>
                    {gaps.map((g, i) => (
                      <p key={i} className="text-xs text-red-600">! {g}</p>
                    ))}
                  </div>
                )}
                {safety.map((s, i) => (
                  <div key={i} className="flex items-start gap-3 text-xs border-b pb-2">
                    <span className="font-mono font-medium w-44 shrink-0">{s.ref}</span>
                    <div className="flex-1">
                      <p className="text-slate-700">{s.failureMode}</p>
                      <p className="text-slate-500">{s.consequence}</p>
                      <p className="text-slate-500">Mitigation: {s.mitigation || 'None visible'}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium shrink-0 ${SEV[s.severity] || ''}`}>{s.severity}</span>
                    {s.safetyGap && <span className="text-red-600 font-bold shrink-0">GAP</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Export */}
          <button onClick={exportReport} disabled={exporting}
            className="px-3 py-1.5 bg-slate-700 text-white rounded text-xs font-medium disabled:opacity-40 hover:bg-slate-800">
            {exporting ? 'Exporting...' : 'Export Process Control Report'}
          </button>
        </div>
      )}
    </div>
  );
}
