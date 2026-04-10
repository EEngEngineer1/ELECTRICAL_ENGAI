import { useState } from 'react';
import { Link } from 'react-router-dom';
import useStore from '../store/useStore.js';

const PRIORITY_BG = { safety_critical: 'bg-red-50', mandatory: '', desirable: 'bg-blue-50' };
const csvExport = (rows, headers, filename) => {
  const csv = [headers.join(','), ...rows.map(r => headers.map(h => `"${(r[h] ?? '').toString().replace(/"/g, '""')}"`).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
};

export default function ReverseEngineerPage() {
  const { uploadId, reverseEngineer, setReverseEngineer, getPayload } = useStore();
  const [loading, setLoading] = useState(false);
  const [dataTab, setDataTab] = useState(0);
  const [specTab, setSpecTab] = useState(0);
  const [exporting, setExporting] = useState(false);

  if (!uploadId) {
    return (
      <div className="text-center mt-16">
        <p className="text-slate-500">Upload a schematic on the Analysis page first</p>
        <Link to="/" className="text-blue-600 hover:underline text-sm mt-2 inline-block">Go to Analysis page</Link>
      </div>
    );
  }

  const run = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/reverseengineer/analyse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...getPayload() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setReverseEngineer(data);
    } catch (err) {
      alert('Reverse engineering failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const exportAll = async () => {
    setExporting(true);
    try {
      const res = await fetch('/api/reverseengineer/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...getPayload() })
      });
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'ElecDocs-Reverse-Engineer-Report.docx';
      a.click();
    } catch (err) {
      alert('Export failed: ' + err.message);
    } finally {
      setExporting(false);
    }
  };

  const r = reverseEngineer;
  const sd = r?.structuredData || {};

  const renderInferred = (text) => {
    if (!text) return null;
    const parts = text.split(/(\[INFERRED\])/g);
    return parts.map((part, i) =>
      part === '[INFERRED]'
        ? <span key={i} className="italic text-amber-600 text-xs font-medium">[INFERRED]</span>
        : <span key={i}>{part}</span>
    );
  };

  const FormattedText = ({ text }) => {
    if (!text) return null;
    // Split by [INFERRED] first, then format each segment
    return text.split('\n').map((line, i) => {
      const trimmed = line.trim();
      if (!trimmed) return <div key={i} className="h-2" />;
      if (trimmed.startsWith('•') || trimmed.startsWith('-') || trimmed.startsWith('–')) {
        const content = trimmed.replace(/^[•\-–]\s*/, '');
        return <div key={i} className="flex gap-2 ml-2 mt-0.5"><span className="text-indigo-400 shrink-0">•</span><span>{renderInferred(content)}</span></div>;
      }
      if (trimmed.endsWith(':')) {
        return <div key={i} className="font-medium text-slate-700 mt-2.5 mb-0.5">{trimmed}</div>;
      }
      return <div key={i} className="mt-1">{renderInferred(trimmed)}</div>;
    });
  };

  const DATA_TABS = ['Equipment Register', 'Loop Schedule', 'Cable/Signal Schedule'];
  const SPEC_TABS = ['Suggested URS', 'Suggested FDS'];

  return (
    <div className="space-y-4 overflow-y-auto h-full pr-2">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-700">Reverse Engineering</h2>
        <div className="flex gap-2">
          <button onClick={run} disabled={loading}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium disabled:opacity-40 hover:bg-indigo-700">
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Analysing — this may take 1-3 minutes...
              </span>
            ) : 'Run Reverse Engineering Analysis'}
          </button>
          {r && (
            <button onClick={exportAll} disabled={exporting}
              className="px-4 py-2 bg-slate-700 text-white rounded-lg text-xs font-medium disabled:opacity-40">
              {exporting ? 'Exporting...' : 'Export All as Word'}
            </button>
          )}
        </div>
      </div>

      {loading && (
        <div className="bg-white rounded-lg shadow p-6 text-center">
          <div className="w-8 h-8 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-500">Reverse engineering the schematic — this may take 1-3 minutes...</p>
        </div>
      )}

      {r && (
        <>
          {/* Panel 1: System Description */}
          <div className="bg-white rounded-lg shadow p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">System Description</h3>
            <div className="bg-slate-50 rounded p-3 text-xs text-slate-600 leading-relaxed" style={{ fontFamily: 'Segoe UI, Calibri, sans-serif' }}>
              <FormattedText text={r.systemDescription} />
            </div>
          </div>

          {/* Panel 2: Structured Data */}
          <div className="bg-white rounded-lg shadow">
            <div className="flex border-b">
              {DATA_TABS.map((t, i) => (
                <button key={t} onClick={() => setDataTab(i)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 ${dataTab === i ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500'}`}>
                  {t}
                </button>
              ))}
            </div>
            <div className="p-4">
              {dataTab === 0 && (
                <>
                  <div className="flex justify-end mb-2">
                    <button onClick={() => csvExport(sd.equipmentRegister || [], ['tag','description','type','manufacturer','location','ioRef'], 'equipment-register.csv')}
                      className="text-xs text-blue-600 hover:underline">Export CSV</button>
                  </div>
                  <DataTable data={sd.equipmentRegister || []}
                    cols={[['tag','Tag'],['description','Description'],['type','Type'],['manufacturer','Manufacturer'],['location','Location'],['ioRef','I/O Ref']]} />
                </>
              )}
              {dataTab === 1 && (
                <>
                  <div className="flex justify-end mb-2">
                    <button onClick={() => csvExport(sd.loopSchedule || [], ['loopNumber','description','processVariable','transmitterTag','controllerRef','finalElementTag'], 'loop-schedule.csv')}
                      className="text-xs text-blue-600 hover:underline">Export CSV</button>
                  </div>
                  <DataTable data={sd.loopSchedule || []}
                    cols={[['loopNumber','Loop'],['description','Description'],['processVariable','Variable'],['transmitterTag','Transmitter'],['controllerRef','Controller'],['finalElementTag','Final Element']]} />
                </>
              )}
              {dataTab === 2 && (
                <>
                  <div className="flex justify-end mb-2">
                    <button onClick={() => csvExport(sd.cableSchedule || [], ['fromTag','fromTerminal','cableRef','toTag','toTerminal','signalType','notes'], 'cable-schedule.csv')}
                      className="text-xs text-blue-600 hover:underline">Export CSV</button>
                  </div>
                  <DataTable data={sd.cableSchedule || []}
                    cols={[['fromTag','From'],['fromTerminal','Terminal'],['cableRef','Cable'],['toTag','To'],['toTerminal','Terminal'],['signalType','Signal'],['notes','Notes']]} />
                </>
              )}
            </div>
          </div>

          {/* Panel 3: Design Intent */}
          <div className="bg-white rounded-lg shadow p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Design Intent</h3>
            <div className="bg-slate-50 rounded p-3 text-xs text-slate-600 leading-relaxed" style={{ fontFamily: 'Segoe UI, Calibri, sans-serif' }}>
              <FormattedText text={r.designIntent} />
            </div>
          </div>

          {/* Panel 4: Suggested Specification */}
          <div className="bg-white rounded-lg shadow">
            <div className="flex border-b">
              {SPEC_TABS.map((t, i) => (
                <button key={t} onClick={() => setSpecTab(i)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 ${specTab === i ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500'}`}>
                  {t}
                </button>
              ))}
            </div>

            {/* Disclaimer */}
            <div className="mx-4 mt-4 p-3 bg-amber-50 border border-amber-300 rounded-lg">
              <p className="text-xs text-amber-800 font-medium leading-relaxed">
                AI-generated draft — requires review and approval by a qualified engineer before use as a formal project document.
              </p>
            </div>

            <div className="p-4">
              {specTab === 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-3 py-2 text-left">Req ID</th>
                        <th className="px-3 py-2 text-left">Requirement</th>
                        <th className="px-3 py-2 text-left">Classification</th>
                        <th className="px-3 py-2 text-left">Priority</th>
                        <th className="px-3 py-2 text-left">Evidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(r.suggestedSpec?.urs || []).map((req, i) => (
                        <tr key={i} className={`border-t ${PRIORITY_BG[req.priority] || ''}`}>
                          <td className="px-3 py-2 font-mono">{req.reqId}</td>
                          <td className="px-3 py-2">{req.text}</td>
                          <td className="px-3 py-2">{req.classification}</td>
                          <td className="px-3 py-2">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                              req.priority === 'safety_critical' ? 'bg-red-600 text-white' :
                              req.priority === 'desirable' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100'
                            }`}>{req.priority}</span>
                          </td>
                          <td className="px-3 py-2 text-slate-500">{req.evidence}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {specTab === 1 && (
                <div className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap" style={{ fontFamily: 'Segoe UI, Calibri, sans-serif' }}>
                  {renderInferred(r.suggestedSpec?.fds || 'No FDS content generated.')}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function DataTable({ data, cols }) {
  if (data.length === 0) return <p className="text-sm text-slate-400">No data available.</p>;
  return (
    <div className="overflow-x-auto max-h-80">
      <table className="w-full text-xs">
        <thead className="bg-slate-50 sticky top-0">
          <tr>{cols.map(([, label]) => <th key={label} className="px-3 py-2 text-left text-xs">{label}</th>)}</tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} className="border-t hover:bg-slate-50">
              {cols.map(([key]) => <td key={key} className="px-3 py-2">{row[key] || ''}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
