import { useState, useCallback } from 'react';
import useStore from '../store/useStore';

const API = '/api';

const FLUID_COLOURS = {
  steam: '#F59E0B', condensate: '#F59E0B', 'cooling water': '#3B82F6', water: '#3B82F6',
  gas: '#10B981', 'process gas': '#10B981', oil: '#14B8A6', 'process liquid': '#14B8A6',
  chemical: '#F87171', unknown: '#9CA3AF'
};
const fluidColour = (service) => {
  const s = (service || '').toLowerCase();
  for (const [k, v] of Object.entries(FLUID_COLOURS)) if (s.includes(k)) return v;
  return '#9CA3AF';
};

const STATUS_COLOURS = { matched: '#22C55E', tag_only: '#F59E0B', description_match: '#F59E0B', missing_from_schematic: '#EF4444', extra_in_schematic: '#3B82F6' };
const REQ_COLOURS = { satisfied: '#22C55E', partial: '#F59E0B', not_satisfied: '#EF4444', not_mentioned: '#9CA3AF' };

function csvExport(headers, rows, filename) {
  const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${String(c || '').replace(/"/g, '""')}"`).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
}

async function readSSE(url, body, onStage, onResult, onError) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) {
    try { const e = await res.json(); onError(e.error || 'Request failed'); } catch { onError(`Request failed (${res.status})`); }
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n'); buf = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const d = JSON.parse(line.slice(6));
        if (d.stage) onStage(d.stage);
        if (d.result) onResult(d.result);
        if (d.error) onError(d.error);
      } catch {}
    }
  }
  // Process remaining buffer after stream ends
  if (buf.startsWith('data: ')) {
    try {
      const d = JSON.parse(buf.slice(6));
      if (d.stage) onStage(d.stage);
      if (d.result) onResult(d.result);
      if (d.error) onError(d.error);
    } catch {}
  }
}

export default function PnidPage() {
  const store = useStore();
  const { pnidId, pnidPageImages, pnidPageCount, pnidDpiUsed, pnidPageFormat, pnidCurrentPage,
    pnidAnalysis, pnidCrossref, pnidUploading, pnidAnalysing, uploadId, reqIds,
    setPnidUploadData, setPnidCurrentPage, setPnidAnalysis, setPnidCrossref, setPnidUploading, setPnidAnalysing } = store;

  const [stage, setStage] = useState('');
  const [error, setError] = useState('');
  const [batchProgress, setBatchProgress] = useState(0);
  const [valveTab, setValveTab] = useState('control');
  const [instrFilter, setInstrFilter] = useState({ variable: '', safety: '' });
  const [exporting, setExporting] = useState(false);

  // Upload
  const handleUpload = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPnidUploading(true); setError('');
    try {
      const fd = new FormData(); fd.append('file', file);
      const res = await fetch(`${API}/pnid/upload`, { method: 'POST', body: fd });
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { throw new Error('Server returned invalid response. Check server console.'); }
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setPnidUploadData(data);
    } catch (err) { setError(err.message); }
    finally { setPnidUploading(false); }
  }, [setPnidUploadData, setPnidUploading]);

  // Analyse
  const runAnalysis = useCallback(async () => {
    if (!pnidId) return;
    setPnidAnalysing(true); setStage('Starting analysis...'); setError(''); setBatchProgress(0);
    await readSSE(`${API}/pnid/analyse`, { pnidId },
      (s) => {
        setStage(s);
        const m = s.match(/pages (\d+) to (\d+) of (\d+)/);
        if (m) setBatchProgress(Math.round(parseInt(m[2]) / parseInt(m[3]) * 100));
      },
      (r) => { setPnidAnalysis(r); setBatchProgress(100); },
      (e) => setError(e)
    );
    setPnidAnalysing(false);
  }, [pnidId, setPnidAnalysis, setPnidAnalysing]);

  // Cross-ref
  const runCrossRef = useCallback(async (withSchematic, withReqs) => {
    setPnidAnalysing(true); setStage('Starting cross-reference...'); setError('');
    const body = { pnidId };
    if (withSchematic && uploadId) body.uploadId = uploadId;
    if (withReqs && reqIds?.length) body.reqIds = reqIds;
    await readSSE(`${API}/pnid/crossref`, body,
      (s) => setStage(s),
      (r) => setPnidCrossref(r),
      (e) => setError(e)
    );
    setPnidAnalysing(false);
  }, [pnidId, uploadId, reqIds, setPnidCrossref, setPnidAnalysing]);

  // Export
  const exportReport = useCallback(async () => {
    setExporting(true);
    try {
      const res = await fetch(`${API}/pnid/export`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pnidId }) });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'ElecDocs-PNID-Report.docx'; a.click();
    } catch (err) { setError(err.message); }
    finally { setExporting(false); }
  }, [pnidId]);

  // Filtered instruments
  const instruments = pnidAnalysis?.instruments || [];
  const filtered = instruments.filter(i => {
    if (instrFilter.variable && i.measuredVariable !== instrFilter.variable) return false;
    if (instrFilter.safety === 'yes' && !i.isSafetyCritical) return false;
    if (instrFilter.safety === 'no' && i.isSafetyCritical) return false;
    return true;
  });
  const variables = [...new Set(instruments.map(i => i.measuredVariable).filter(Boolean))];

  const valves = pnidAnalysis?.valves || [];
  const controlValves = valves.filter(v => v.type === 'control');
  const otherValves = valves.filter(v => v.type !== 'control');

  const schCrossRef = pnidCrossref?.schematicCrossRef;
  const reqCrossRef = pnidCrossref?.requirementsCrossRef;

  return (
    <div className="h-full overflow-y-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-800">P&ID Analysis</h2>
        {pnidAnalysis && (
          <button onClick={exportReport} disabled={exporting}
            className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {exporting ? 'Exporting...' : 'Export P&ID Report'}
          </button>
        )}
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">{error}</div>}

      {/* Upload */}
      {!pnidId && (
        <label className="block border-2 border-dashed border-slate-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-400 transition-colors">
          <input type="file" accept=".pdf" onChange={handleUpload} className="hidden" disabled={pnidUploading} />
          <p className="text-slate-600 font-medium">{pnidUploading ? 'Uploading...' : 'Drop P&ID PDF here or click to browse'}</p>
          <p className="text-slate-400 text-sm mt-1">PDF only</p>
        </label>
      )}

      {/* Viewer */}
      {pnidId && pnidPageImages.length > 0 && (
        <div className="bg-white rounded-lg border p-3">
          <div className="flex items-center gap-3 mb-2 text-sm text-slate-600">
            <span>{pnidPageFormat} | {pnidDpiUsed} DPI | {pnidPageCount} pages</span>
            <div className="flex items-center gap-1 ml-auto">
              <button onClick={() => setPnidCurrentPage(Math.max(1, pnidCurrentPage - 1))} disabled={pnidCurrentPage <= 1}
                className="px-2 py-1 border rounded disabled:opacity-30">&lt;</button>
              <span>{pnidCurrentPage} / {pnidPageCount}</span>
              <button onClick={() => setPnidCurrentPage(Math.min(pnidPageCount, pnidCurrentPage + 1))} disabled={pnidCurrentPage >= pnidPageCount}
                className="px-2 py-1 border rounded disabled:opacity-30">&gt;</button>
            </div>
          </div>
          <img src={`data:image/jpeg;base64,${pnidPageImages[pnidCurrentPage - 1]}`} alt={`Page ${pnidCurrentPage}`}
            className="w-full border rounded" />
        </div>
      )}

      {/* Analyse button */}
      {pnidId && !pnidAnalysis && (
        <div className="text-center">
          <button onClick={runAnalysis} disabled={pnidAnalysing}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50">
            {pnidAnalysing ? 'Analysing...' : 'Run P&ID Analysis'}
          </button>
          {pnidAnalysing && (
            <div className="mt-3">
              <div className="w-64 mx-auto bg-slate-200 rounded-full h-2"><div className="bg-blue-600 h-2 rounded-full transition-all" style={{ width: `${batchProgress}%` }} /></div>
              <p className="text-sm text-slate-500 mt-1">{stage}</p>
            </div>
          )}
        </div>
      )}

      {/* Results */}
      {pnidAnalysis && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-6 gap-2">
            {[['Instruments', pnidAnalysis.summary?.totalInstruments],
              ['Valves', pnidAnalysis.summary?.totalValves],
              ['Equipment', pnidAnalysis.summary?.totalEquipment],
              ['Lines', pnidAnalysis.summary?.totalProcessLines],
              ['Loops', pnidAnalysis.summary?.totalControlLoops],
              ['Interlocks', pnidAnalysis.summary?.totalInterlocks]
            ].map(([label, count]) => (
              <div key={label} className="bg-white rounded border p-3 text-center">
                <div className="text-2xl font-bold text-slate-800">{count || 0}</div>
                <div className="text-xs text-slate-500">{label}</div>
              </div>
            ))}
          </div>

          {/* Panel 1: Instruments */}
          <div className="bg-white rounded-lg border p-4">
            <div className="flex items-center gap-3 mb-3">
              <h3 className="font-semibold text-slate-800">Instrument Register</h3>
              <select value={instrFilter.variable} onChange={e => setInstrFilter(f => ({ ...f, variable: e.target.value }))}
                className="text-sm border rounded px-2 py-1">
                <option value="">All variables</option>
                {variables.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
              <select value={instrFilter.safety} onChange={e => setInstrFilter(f => ({ ...f, safety: e.target.value }))}
                className="text-sm border rounded px-2 py-1">
                <option value="">All</option><option value="yes">Safety critical</option><option value="no">Non-safety</option>
              </select>
              <button onClick={() => csvExport(['Tag','Service','Variable','Function','Mounting','Signal','Safety','Notes'],
                filtered.map(i => [i.tag, i.service, i.measuredVariable, i.function, i.mounting, i.signalType, i.isSafetyCritical?'Yes':'', i.notes]),
                'pnid-instruments.csv')} className="ml-auto text-xs text-blue-600 hover:underline">CSV</button>
            </div>
            <div className="overflow-x-auto max-h-80 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 sticky top-0"><tr>
                  {['Tag','Service','Variable','Function','Mounting','Signal','Safety','Notes'].map(h => <th key={h} className="px-2 py-1.5 text-left font-medium text-slate-600">{h}</th>)}
                </tr></thead>
                <tbody>{filtered.map((i, idx) => (
                  <tr key={idx} className={`border-t ${i.isSafetyCritical ? 'border-l-4 border-l-red-500' : ''}`}>
                    <td className="px-2 py-1 font-mono">{i.tag}</td><td className="px-2 py-1">{i.service}</td>
                    <td className="px-2 py-1">{i.measuredVariable}</td><td className="px-2 py-1">{i.function}</td>
                    <td className="px-2 py-1">{i.mounting}</td><td className="px-2 py-1">{i.signalType}</td>
                    <td className="px-2 py-1">{i.isSafetyCritical && <span className="text-red-600 font-bold">YES</span>}</td>
                    <td className="px-2 py-1 text-xs text-slate-500">{i.notes}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>

          {/* Panel 2: Valves */}
          <div className="bg-white rounded-lg border p-4">
            <div className="flex items-center gap-3 mb-3">
              <h3 className="font-semibold text-slate-800">Valve Register</h3>
              <button onClick={() => setValveTab('control')} className={`text-sm px-3 py-1 rounded ${valveTab === 'control' ? 'bg-blue-100 text-blue-700' : 'text-slate-500'}`}>Control ({controlValves.length})</button>
              <button onClick={() => setValveTab('other')} className={`text-sm px-3 py-1 rounded ${valveTab === 'other' ? 'bg-blue-100 text-blue-700' : 'text-slate-500'}`}>Isolation/On-Off ({otherValves.length})</button>
              <button onClick={() => csvExport(['Tag','Type','Actuator','Fail','Normal','Line','Controller','Notes'],
                valves.map(v => [v.tag, v.type, v.actuatorType, v.failPosition, v.normalPosition, v.line, v.associatedController, v.notes]),
                'pnid-valves.csv')} className="ml-auto text-xs text-blue-600 hover:underline">CSV</button>
            </div>
            <div className="overflow-x-auto max-h-64 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 sticky top-0"><tr>
                  {['Tag','Type','Actuator','Fail Pos','Normal Pos','Line','Controller','Notes'].map(h => <th key={h} className="px-2 py-1.5 text-left font-medium text-slate-600">{h}</th>)}
                </tr></thead>
                <tbody>{(valveTab === 'control' ? controlValves : otherValves).map((v, idx) => (
                  <tr key={idx} className="border-t">
                    <td className="px-2 py-1 font-mono">{v.tag}</td><td className="px-2 py-1">{v.type}</td>
                    <td className="px-2 py-1">{v.actuatorType}</td><td className="px-2 py-1">{v.failPosition}</td>
                    <td className="px-2 py-1">{v.normalPosition}</td><td className="px-2 py-1">{v.line}</td>
                    <td className="px-2 py-1">{v.associatedController}</td><td className="px-2 py-1 text-xs text-slate-500">{v.notes}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>

          {/* Panel 3: Equipment */}
          <div className="bg-white rounded-lg border p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-slate-800">Equipment Register</h3>
              <button onClick={() => csvExport(['Tag','Type','Service','Parameters','Connections','Notes'],
                (pnidAnalysis.equipment||[]).map(e => [e.tag, e.type, e.service, e.keyParameters, (e.connections||[]).join('; '), e.notes]),
                'pnid-equipment.csv')} className="text-xs text-blue-600 hover:underline">CSV</button>
            </div>
            <div className="overflow-x-auto max-h-64 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 sticky top-0"><tr>
                  {['Tag','Type','Service','Parameters','Connections','Notes'].map(h => <th key={h} className="px-2 py-1.5 text-left font-medium text-slate-600">{h}</th>)}
                </tr></thead>
                <tbody>{(pnidAnalysis.equipment||[]).map((e, idx) => (
                  <tr key={idx} className="border-t">
                    <td className="px-2 py-1 font-mono">{e.tag}</td><td className="px-2 py-1">{e.type}</td>
                    <td className="px-2 py-1">{e.service}</td><td className="px-2 py-1">{e.keyParameters}</td>
                    <td className="px-2 py-1 text-xs">{(e.connections||[]).join(', ')}</td><td className="px-2 py-1 text-xs text-slate-500">{e.notes}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>

          {/* Panel 4: Process Lines */}
          <div className="bg-white rounded-lg border p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-slate-800">Process Lines</h3>
              <button onClick={() => csvExport(['Line ID','Fluid','Size','Flow','Instruments','Valves','Notes'],
                (pnidAnalysis.processLines||[]).map(l => [l.lineId, l.fluidService, l.sizeSpec, l.flowDirection, (l.instruments||[]).join('; '), (l.valves||[]).join('; '), l.notes]),
                'pnid-lines.csv')} className="text-xs text-blue-600 hover:underline">CSV</button>
            </div>
            <div className="flex gap-2 mb-2 text-xs flex-wrap">
              {Object.entries(FLUID_COLOURS).filter(([k]) => !['condensate','water','process gas','process liquid'].includes(k)).map(([k, v]) => (
                <span key={k} className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ backgroundColor: v }} />{k}</span>
              ))}
            </div>
            <div className="overflow-x-auto max-h-64 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 sticky top-0"><tr>
                  {['Line ID','Fluid Service','Size/Spec','Flow','Instruments','Valves','Notes'].map(h => <th key={h} className="px-2 py-1.5 text-left font-medium text-slate-600">{h}</th>)}
                </tr></thead>
                <tbody>{(pnidAnalysis.processLines||[]).map((l, idx) => (
                  <tr key={idx} className="border-t" style={{ borderLeft: `4px solid ${fluidColour(l.fluidService)}` }}>
                    <td className="px-2 py-1 font-mono">{l.lineId}</td><td className="px-2 py-1">{l.fluidService}</td>
                    <td className="px-2 py-1">{l.sizeSpec}</td><td className="px-2 py-1">{l.flowDirection}</td>
                    <td className="px-2 py-1 text-xs">{(l.instruments||[]).join(', ')}</td>
                    <td className="px-2 py-1 text-xs">{(l.valves||[]).join(', ')}</td>
                    <td className="px-2 py-1 text-xs text-slate-500">{l.notes}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>

          {/* Panel 5: Control Loops */}
          <div className="bg-white rounded-lg border p-4">
            <h3 className="font-semibold text-slate-800 mb-3">Control Loops</h3>
            {(pnidAnalysis.controlLoops||[]).length === 0 ? <p className="text-sm text-slate-400">No control loops found</p> : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {(pnidAnalysis.controlLoops||[]).map((loop, idx) => (
                  <div key={idx} className="border rounded p-3 bg-slate-50">
                    <div className="font-medium text-slate-800 mb-1">{loop.loopId} — {loop.processVariable}</div>
                    <div className="text-sm text-slate-600 space-y-0.5">
                      <div>Measurement: <span className="font-mono">{loop.measurementElement || 'N/A'}</span></div>
                      <div>Transmitter: <span className="font-mono">{loop.transmitter || 'N/A'}</span></div>
                      <div>Controller: <span className="font-mono">{loop.controller?.tag || 'N/A'}</span> ({loop.controller?.type})</div>
                      <div>Final Element: <span className="font-mono">{loop.finalElement?.tag || 'N/A'}</span> — {loop.finalElement?.type}, {loop.finalElement?.failPosition}</div>
                      <div>Setpoint: {loop.setpointSource}{loop.cascadeFrom ? ` (cascade: ${loop.cascadeFrom})` : ''}</div>
                    </div>
                    {loop.notes && <div className="text-xs text-slate-400 mt-1">{loop.notes}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Panel 6: Interlocks */}
          <div className="bg-white rounded-lg border p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-slate-800">Interlocks & Safety Functions</h3>
              <button onClick={() => csvExport(['ID','Type','Initiator','Trip','Action','SIL','Notes'],
                (pnidAnalysis.interlocks||[]).map(i => [i.interlockId, i.type, i.initiator, i.tripCondition, i.action, i.silRating, i.notes]),
                'pnid-interlocks.csv')} className="text-xs text-blue-600 hover:underline">CSV</button>
            </div>
            <div className="overflow-x-auto max-h-64 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 sticky top-0"><tr>
                  {['ID','Type','Initiator','Trip Condition','Action','SIL','Notes'].map(h => <th key={h} className="px-2 py-1.5 text-left font-medium text-slate-600">{h}</th>)}
                </tr></thead>
                <tbody>{[...(pnidAnalysis.interlocks||[])].sort((a,b) => (a.type==='SIF'||a.type==='ESD'?0:1) - (b.type==='SIF'||b.type==='ESD'?0:1)).map((i, idx) => (
                  <tr key={idx} className="border-t">
                    <td className="px-2 py-1 font-mono">{i.interlockId}</td>
                    <td className="px-2 py-1">
                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium text-white ${i.type==='SIF'||i.type==='ESD' ? 'bg-red-500' : 'bg-amber-500'}`}>{i.type}</span>
                    </td>
                    <td className="px-2 py-1">{i.initiator}</td><td className="px-2 py-1">{i.tripCondition}</td>
                    <td className="px-2 py-1">{i.action}</td><td className="px-2 py-1">{i.silRating}</td>
                    <td className="px-2 py-1 text-xs text-slate-500">{i.notes}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>

          {/* Cross-Reference Section */}
          {(uploadId || reqIds?.length > 0) && (
            <div className="bg-white rounded-lg border p-4">
              <h3 className="font-semibold text-slate-800 mb-3">Cross-Reference</h3>
              <div className="flex gap-2 mb-4">
                {uploadId && <button onClick={() => runCrossRef(true, false)} disabled={pnidAnalysing}
                  className="px-4 py-2 bg-slate-700 text-white rounded text-sm hover:bg-slate-800 disabled:opacity-50">
                  Cross-Ref Schematic</button>}
                {reqIds?.length > 0 && <button onClick={() => runCrossRef(false, true)} disabled={pnidAnalysing}
                  className="px-4 py-2 bg-slate-700 text-white rounded text-sm hover:bg-slate-800 disabled:opacity-50">
                  Cross-Ref Requirements</button>}
                {uploadId && reqIds?.length > 0 && <button onClick={() => runCrossRef(true, true)} disabled={pnidAnalysing}
                  className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50">
                  Run Both</button>}
              </div>
              {pnidAnalysing && <p className="text-sm text-slate-500">{stage}</p>}

              {/* Schematic Cross-Ref Results */}
              {schCrossRef && (
                <div className="mb-4">
                  <h4 className="font-medium text-slate-700 mb-2">Schematic Cross-Reference</h4>
                  <div className="flex gap-3 mb-2 text-xs">
                    {Object.entries(STATUS_COLOURS).map(([k, v]) => (
                      <span key={k} className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ backgroundColor: v }} />{k.replace(/_/g, ' ')}</span>
                    ))}
                  </div>
                  {schCrossRef.summary && (
                    <p className="text-sm font-medium text-slate-700 mb-2">
                      {schCrossRef.summary.matched || 0} of {schCrossRef.summary.total || 0} P&ID instruments confirmed in electrical schematic
                      ({schCrossRef.summary.total ? Math.round((schCrossRef.summary.matched || 0) / schCrossRef.summary.total * 100) : 0}%)
                    </p>
                  )}
                  <div className="overflow-x-auto max-h-64 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-100 sticky top-0"><tr>
                        {['P&ID Tag','Description','Schematic Match','Status','Discrepancy','Safety'].map(h => <th key={h} className="px-2 py-1.5 text-left font-medium text-slate-600">{h}</th>)}
                      </tr></thead>
                      <tbody>{[...(schCrossRef.matches||[])].sort((a,b) => {
                        if (a.isSafetyCritical && a.matchStatus==='missing_from_schematic') return -1;
                        if (b.isSafetyCritical && b.matchStatus==='missing_from_schematic') return 1;
                        return 0;
                      }).map((m, idx) => (
                        <tr key={idx} className="border-t" style={{ borderLeft: `4px solid ${STATUS_COLOURS[m.matchStatus] || '#9CA3AF'}` }}>
                          <td className="px-2 py-1 font-mono">{m.pnidTag}</td><td className="px-2 py-1">{m.pnidDescription}</td>
                          <td className="px-2 py-1 font-mono">{m.schematicTag}</td>
                          <td className="px-2 py-1"><span className="px-1.5 py-0.5 rounded text-xs text-white" style={{ backgroundColor: STATUS_COLOURS[m.matchStatus] || '#9CA3AF' }}>{(m.matchStatus||'').replace(/_/g, ' ')}</span></td>
                          <td className="px-2 py-1 text-xs">{m.discrepancy}</td>
                          <td className="px-2 py-1">{m.isSafetyCritical && <span className="text-red-600 font-bold">YES</span>}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Requirements Cross-Ref Results */}
              {reqCrossRef && (
                <div>
                  <h4 className="font-medium text-slate-700 mb-2">Requirements Cross-Reference</h4>
                  <div className="overflow-x-auto max-h-64 overflow-y-auto mb-3">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-100 sticky top-0"><tr>
                        {['P&ID Tag','Req Ref','Requirement','Status','Discrepancy','Safety'].map(h => <th key={h} className="px-2 py-1.5 text-left font-medium text-slate-600">{h}</th>)}
                      </tr></thead>
                      <tbody>{(reqCrossRef.pnidVsRequirements||[]).map((r, idx) => (
                        <tr key={idx} className="border-t" style={{ borderLeft: `4px solid ${REQ_COLOURS[r.status] || '#9CA3AF'}` }}>
                          <td className="px-2 py-1 font-mono">{r.pnidTag}</td><td className="px-2 py-1">{r.requirementRef}</td>
                          <td className="px-2 py-1 text-xs">{(r.requirementText||'').substring(0, 80)}</td>
                          <td className="px-2 py-1"><span className="px-1.5 py-0.5 rounded text-xs text-white" style={{ backgroundColor: REQ_COLOURS[r.status] || '#9CA3AF' }}>{r.status}</span></td>
                          <td className="px-2 py-1 text-xs">{r.discrepancy}</td>
                          <td className="px-2 py-1">{r.isSafetyCritical && <span className="text-red-600 font-bold">YES</span>}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                  {(reqCrossRef.requirementsNotInPnid||[]).length > 0 && (
                    <>
                      <h4 className="font-medium text-slate-700 mb-2">Requirements Not Addressed in P&ID</h4>
                      <div className="overflow-x-auto max-h-48 overflow-y-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-slate-100 sticky top-0"><tr>
                            {['Req Ref','Requirement','Classification','Gap'].map(h => <th key={h} className="px-2 py-1.5 text-left font-medium text-slate-600">{h}</th>)}
                          </tr></thead>
                          <tbody>{[...(reqCrossRef.requirementsNotInPnid||[])].sort((a,b) => (a.classification==='safety'?-1:0) - (b.classification==='safety'?-1:0)).map((r, idx) => (
                            <tr key={idx} className={`border-t ${r.classification==='safety' ? 'border-l-4 border-l-red-500 bg-red-50' : ''}`}>
                              <td className="px-2 py-1">{r.requirementRef}</td>
                              <td className="px-2 py-1 text-xs">{(r.requirementText||'').substring(0, 80)}</td>
                              <td className="px-2 py-1">
                                {r.classification==='safety' && <span className="px-1.5 py-0.5 rounded text-xs font-bold text-white bg-red-600">SAFETY GAP</span>}
                                {r.classification!=='safety' && <span className="text-xs text-slate-500">{r.classification}</span>}
                              </td>
                              <td className="px-2 py-1 text-xs">{r.gap}</td>
                            </tr>
                          ))}</tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
