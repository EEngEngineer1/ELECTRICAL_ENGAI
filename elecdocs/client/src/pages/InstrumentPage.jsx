import useStore from '../store/useStore.js';
import UploadZone from '../components/UploadZone.jsx';
import InstrumentationTable from '../components/InstrumentationTable.jsx';

export default function InstrumentPage() {
  const { uploadId, requirements, instruments, setInstruments, reqIds } = useStore();

  const generateInstruments = async () => {
    if (reqIds.length === 0) return;
    try {
      const res = await fetch('/api/instruments/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadId, reqIds })
      });
      const data = await res.json();
      setInstruments(data);
    } catch (err) {
      alert('Generation failed: ' + err.message);
    }
  };

  const verifyInstruments = async () => {
    try {
      const res = await fetch('/api/instruments/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadId, reqIds })
      });
      const data = await res.json();
      setInstruments(data);
    } catch (err) {
      alert('Verification failed: ' + err.message);
    }
  };

  const exportReport = async () => {
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
    }
  };

  return (
    <div className="space-y-6">
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
          <button onClick={generateInstruments} disabled={reqIds.length === 0}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-40">
            Generate Instrumentation List
          </button>
          <button onClick={verifyInstruments} disabled={!instruments}
            className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium disabled:opacity-40">
            Verify Coverage
          </button>
          <button onClick={exportReport} disabled={!instruments}
            className="px-4 py-2 bg-slate-600 text-white rounded-lg text-sm font-medium disabled:opacity-40">
            Export Report
          </button>
        </div>
      </div>

      <InstrumentationTable />
    </div>
  );
}
