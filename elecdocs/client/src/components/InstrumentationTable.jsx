import useStore from '../store/useStore.js';

const COVERAGE_BADGE = {
  matched: 'bg-green-100 text-green-800', tag_only: 'bg-amber-100 text-amber-800',
  description_match: 'bg-amber-100 text-amber-800', missing: 'bg-red-100 text-red-800',
  unverified: 'bg-slate-100 text-slate-500', extra_in_schematic: 'bg-blue-100 text-blue-800'
};

export default function InstrumentationTable() {
  const { instruments, fieldDevices } = useStore();
  const instList = instruments?.instruments || [];
  const fdList = fieldDevices?.fieldDevices || [];

  if (instList.length === 0 && fdList.length === 0) {
    return <p className="text-slate-400 text-sm">Upload URS/FDS documents and extract field devices first.</p>;
  }

  const matched = instList.filter(i => i.coverageStatus === 'matched').length;
  const total = instList.length;
  const pct = total > 0 ? Math.round(matched / total * 100) : 0;

  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Left: Instrumentation list */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-4 py-3 border-b">
          <h2 className="font-semibold text-slate-700">Instrumentation List ({total})</h2>
          {total > 0 && (
            <div className="mt-2">
              <div className="flex justify-between text-xs text-slate-500 mb-1">
                <span>{matched} of {total} found in schematic ({pct}%)</span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2">
                <div className="bg-green-500 h-2 rounded-full" style={{ width: `${pct}%` }} />
              </div>
            </div>
          )}
        </div>
        <div className="overflow-x-auto max-h-96">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left">Tag</th>
                <th className="px-3 py-2 text-left">Description</th>
                <th className="px-3 py-2 text-left">Type</th>
                <th className="px-3 py-2 text-left">Source</th>
                <th className="px-3 py-2 text-left">Safety</th>
                <th className="px-3 py-2 text-left">Coverage</th>
              </tr>
            </thead>
            <tbody>
              {instList
                .sort((a, b) => {
                  if (a.isSafetyCritical && a.coverageStatus === 'missing') return -1;
                  if (b.isSafetyCritical && b.coverageStatus === 'missing') return 1;
                  return 0;
                })
                .map((inst, i) => (
                <tr key={i} className={`border-t ${inst.isSafetyCritical && inst.coverageStatus === 'missing' ? 'bg-red-50' : ''}`}>
                  <td className="px-3 py-2 font-mono">{inst.tagNumber}</td>
                  <td className="px-3 py-2">{inst.description}</td>
                  <td className="px-3 py-2">{inst.instrumentType}</td>
                  <td className="px-3 py-2">{inst.sourceDocRef}</td>
                  <td className="px-3 py-2">{inst.isSafetyCritical ? <span className="text-red-600 font-medium">Yes</span> : ''}</td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${COVERAGE_BADGE[inst.coverageStatus] || COVERAGE_BADGE.unverified}`}>
                      {inst.coverageStatus || 'unverified'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Right: Field device list */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-4 py-3 border-b">
          <h2 className="font-semibold text-slate-700">Field Devices ({fdList.length})</h2>
        </div>
        <div className="overflow-x-auto max-h-96">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left">Tag</th>
                <th className="px-3 py-2 text-left">Description</th>
                <th className="px-3 py-2 text-left">Type</th>
                <th className="px-3 py-2 text-left">Signal</th>
                <th className="px-3 py-2 text-left">Location</th>
              </tr>
            </thead>
            <tbody>
              {fdList.map((d, i) => (
                <tr key={i} className="border-t hover:bg-slate-50">
                  <td className="px-3 py-2 font-mono">{d.tagNumber}</td>
                  <td className="px-3 py-2">{d.description}</td>
                  <td className="px-3 py-2">{d.deviceType}</td>
                  <td className="px-3 py-2">{d.signalType}</td>
                  <td className="px-3 py-2">{d.location}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
