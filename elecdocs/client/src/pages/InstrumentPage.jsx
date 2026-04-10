import { useState, useEffect, useRef } from 'react';
import useStore from '../store/useStore.js';
import UploadZone from '../components/UploadZone.jsx';
import InstrumentationTable from '../components/InstrumentationTable.jsx';

function useElapsed(running) {
  const [elapsed, setElapsed] = useState(0);
  const ref = useRef(null);
  useEffect(() => {
    if (running) { setElapsed(0); ref.current = setInterval(() => setElapsed(s => s + 1), 1000); }
    else clearInterval(ref.current);
    return () => clearInterval(ref.current);
  }, [running]);
  return elapsed;
}

export default function InstrumentPage() {
  const { uploadId, requirements, instruments, setInstruments, reqIds, fieldDevices, components, getPayload } = useStore();
  const [generating, setGenerating] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [exporting, setExporting] = useState(false);
  const elapsed = useElapsed(generating || verifying);

  const generateInstruments = async () => {
    if (reqIds.length === 0) return;
    setGenerating(true);
    try {
      const res = await fetch('/api/instruments/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...getPayload() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setInstruments(data);
    } catch (err) {
      alert('Generation failed: ' + err.message);
    } finally {
      setGenerating(false);
    }
  };

  const verifyInstruments = async () => {
    if (!fieldDevices) {
      alert('Field devices not yet extracted. Go to the Analyse page and click "Extract Components & Devices" first.');
      return;
    }
    setVerifying(true);
    try {
      const res = await fetch('/api/instruments/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadId, reqIds, fieldDevices: fieldDevices?.fieldDevices || fieldDevices })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setInstruments(data);
    } catch (err) {
      alert('Verification failed: ' + err.message);
    } finally {
      setVerifying(false);
    }
  };

  const exportReport = async () => {
    setExporting(true);
    try {
      const res = await fetch('/api/crossref/export/instrumentation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadId })
      });
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'ElecDocs-Instrumentation-Report.docx';
      a.click();
    } catch (err) {
      alert('Export failed: ' + err.message);
    } finally {
      setExporting(false);
    }
  };

  const Spinner = () => <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />;
  const timer = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`;

  return (
    <div className="space-y-6 overflow-y-auto h-full pr-2">
      <div className="flex gap-4 items-start">
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-slate-700 mb-3">Requirements Documents</h2>
          <UploadZone type="requirements" />
          {requirements.length > 0 && (
            <div className="mt-3 space-y-1">
              {requirements.map((r, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${r.type === 'URS' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}`}>{r.type}</span>
                  <span className="text-slate-600">{r.reqId}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <button onClick={generateInstruments} disabled={reqIds.length === 0 || generating}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-40">
            {generating ? <span className="flex items-center gap-2"><Spinner /> Generating... {timer}</span> : 'Generate Instrumentation List'}
          </button>
          <button onClick={verifyInstruments} disabled={!instruments || !fieldDevices || verifying}
            title={!fieldDevices ? 'Extract field devices on Analyse page first' : ''}
            className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium disabled:opacity-40">
            {verifying ? <span className="flex items-center gap-2"><Spinner /> Verifying... {timer}</span> : !fieldDevices ? 'Verify (extract devices first)' : 'Verify Coverage'}
          </button>
          <button onClick={exportReport} disabled={!instruments || exporting}
            className="px-4 py-2 bg-slate-600 text-white rounded-lg text-sm font-medium disabled:opacity-40">
            {exporting ? <span className="flex items-center gap-2"><Spinner /> Exporting...</span> : 'Export Report'}
          </button>
        </div>
      </div>

      <InstrumentationTable />
    </div>
  );
}
