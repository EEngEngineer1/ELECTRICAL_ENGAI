import { useState } from 'react';
import useStore from '../store/useStore.js';
import ComplianceMatrix from '../components/ComplianceMatrix.jsx';

const PROGRESS_STEPS = [
  'Parsing requirements...',
  'Checking requirements against schematic...',
  'Comparing field devices to requirements...',
  'Identifying conflicts and generating suggestions...',
  'Merging results...'
];

export default function CrossRefPage() {
  const {
    uploadId, reqIds, complianceMatrix, setComplianceMatrix,
    analysing, setAnalysing, fieldDevices, components,
    instruments, ioSignals, getPayload
  } = useStore();
  const [progressStep, setProgressStep] = useState(0);

  const canAnalyse = uploadId && reqIds.length > 0;
  const storeFD = fieldDevices?.fieldDevices || fieldDevices || [];
  const storeComp = components || [];
  const storeInst = instruments?.instruments || instruments || [];
  const storeIO = ioSignals || [];

  const runAnalysis = async () => {
    setAnalysing(true);
    setProgressStep(0);

    const stepInterval = setInterval(() => {
      setProgressStep(prev => Math.min(prev + 1, PROGRESS_STEPS.length - 1));
    }, 15000);

    try {
      const res = await fetch('/api/crossref/analyse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...getPayload() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setComplianceMatrix(data);
    } catch (err) {
      alert('Analysis failed: ' + err.message);
    } finally {
      clearInterval(stepInterval);
      setAnalysing(false);
    }
  };

  return (
    <div className="space-y-5 overflow-y-auto h-full pr-2">
      <div className="flex items-center gap-4">
        <h2 className="text-lg font-semibold text-slate-700">Compliance Cross-Reference</h2>
        <button onClick={runAnalysis} disabled={!canAnalyse || analysing}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-40">
          {analysing ? 'Analysing...' : 'Run Analysis'}
        </button>
        {!canAnalyse && (
          <p className="text-sm text-slate-400">Upload a schematic and at least one requirements document first</p>
        )}
      </div>

      {/* Pre-analysis: show what data is available */}
      {!complianceMatrix && !analysing && (
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Available Data for Cross-Reference</h3>
          <div className="grid grid-cols-4 gap-3">
            <DataCard label="Components" count={storeComp.length} ok={storeComp.length > 0} />
            <DataCard label="I/O Signals" count={storeIO.length} ok={storeIO.length > 0} />
            <DataCard label="Field Devices" count={storeFD.length} ok={storeFD.length > 0} />
            <DataCard label="Instruments (FDS/URS)" count={storeInst.length} ok={storeInst.length > 0} />
          </div>

          {(storeFD.length > 0 || storeComp.length > 0) && (
            <div className="mt-4 grid grid-cols-2 gap-4">
              {storeFD.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-slate-600 mb-2">Field Devices ({storeFD.length})</h4>
                  <div className="max-h-48 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 sticky top-0">
                        <tr>
                          <th className="px-2 py-1 text-left">Tag</th>
                          <th className="px-2 py-1 text-left">Type</th>
                          <th className="px-2 py-1 text-left">Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        {storeFD.map((d, i) => (
                          <tr key={i} className="border-t">
                            <td className="px-2 py-1 font-mono">{d.tagNumber || d.tag || ''}</td>
                            <td className="px-2 py-1">{d.deviceType || d.type || ''}</td>
                            <td className="px-2 py-1">{d.description || ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {storeInst.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-slate-600 mb-2">Instruments from FDS/URS ({storeInst.length})</h4>
                  <div className="max-h-48 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 sticky top-0">
                        <tr>
                          <th className="px-2 py-1 text-left">Tag</th>
                          <th className="px-2 py-1 text-left">Type</th>
                          <th className="px-2 py-1 text-left">Description</th>
                          <th className="px-2 py-1 text-left">Source</th>
                        </tr>
                      </thead>
                      <tbody>
                        {storeInst.map((inst, i) => (
                          <tr key={i} className="border-t">
                            <td className="px-2 py-1 font-mono">{inst.tagNumber || inst.tag || ''}</td>
                            <td className="px-2 py-1">{inst.instrumentType || inst.type || ''}</td>
                            <td className="px-2 py-1">{inst.description || ''}</td>
                            <td className="px-2 py-1">{inst.sourceDocRef || ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {storeFD.length === 0 && storeComp.length === 0 && (
            <p className="text-xs text-slate-400 mt-3">
              No extracted data yet. Go to the Analyse page to upload a schematic and extract components/devices first.
            </p>
          )}
        </div>
      )}

      {/* Progress bar */}
      {analysing && (
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-slate-600">{PROGRESS_STEPS[progressStep]}</span>
          </div>
          <div className="w-full bg-slate-200 rounded-full h-2">
            <div className="bg-blue-500 h-2 rounded-full transition-all duration-1000"
              style={{ width: `${((progressStep + 1) / PROGRESS_STEPS.length) * 100}%` }} />
          </div>
        </div>
      )}

      <ComplianceMatrix />
    </div>
  );
}

function DataCard({ label, count, ok }) {
  return (
    <div className={`border rounded-lg p-2 ${ok ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-200'}`}>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-lg font-bold ${ok ? 'text-green-700' : 'text-slate-400'}`}>{count}</p>
    </div>
  );
}
