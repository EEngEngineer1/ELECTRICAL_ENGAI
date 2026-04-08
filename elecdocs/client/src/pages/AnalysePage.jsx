import useStore from '../store/useStore.js';
import UploadZone from '../components/UploadZone.jsx';
import SchematicViewer from '../components/SchematicViewer.jsx';
import QuestionPanel from '../components/QuestionPanel.jsx';
import ComponentTable from '../components/ComponentTable.jsx';
import IOTable from '../components/IOTable.jsx';
import FieldDeviceTable from '../components/FieldDeviceTable.jsx';

export default function AnalysePage() {
  const { uploadId, extracting, setExtracting, setComponents, setFieldDevices } = useStore();

  const extractAll = async () => {
    setExtracting(true);
    try {
      const [compRes, fdRes] = await Promise.all([
        fetch('/api/extract/components', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uploadId })
        }),
        fetch('/api/extract/fielddevices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uploadId })
        })
      ]);
      const [compData, fdData] = await Promise.all([compRes.json(), fdRes.json()]);
      setComponents(compData);
      setFieldDevices(fdData);
    } catch (err) {
      alert('Extraction failed: ' + err.message);
    } finally {
      setExtracting(false);
    }
  };

  if (!uploadId) {
    return (
      <div className="max-w-xl mx-auto mt-12">
        <h2 className="text-xl font-semibold text-slate-700 mb-4">Upload a Schematic</h2>
        <UploadZone type="schematic" />
      </div>
    );
  }

  return (
    <div className="flex gap-6 h-[calc(100vh-5rem)]">
      {/* Left: Schematic viewer + tables — scrollable */}
      <div className="flex-1 overflow-y-auto space-y-5 pr-2">
        <SchematicViewer />

        <div className="flex gap-3">
          <button onClick={extractAll} disabled={extracting}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-40 hover:bg-blue-700 transition-colors">
            {extracting ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Extracting — this takes about 30-60 seconds...
              </span>
            ) : 'Extract Components & Devices'}
          </button>
        </div>

        <ComponentTable />
        <IOTable />
        <FieldDeviceTable />
      </div>

      {/* Right: Chat panel — fixed sidebar */}
      <div className="w-96 shrink-0 h-full">
        <QuestionPanel />
      </div>
    </div>
  );
}
