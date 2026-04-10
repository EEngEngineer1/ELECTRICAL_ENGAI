import { useState } from 'react';
import useStore from '../store/useStore.js';

const STATUS_BADGE = {
  met: 'bg-green-100 text-green-800', partial: 'bg-amber-100 text-amber-800',
  not_met: 'bg-red-100 text-red-800', conflict: 'bg-orange-100 text-orange-800'
};
const SEVERITY_PILL = { critical: 'bg-red-600 text-white', major: 'bg-amber-500 text-white', minor: 'bg-slate-400 text-white' };

const TABS = ['Requirements', 'Instrumentation', 'Field Devices', 'Conflicts', 'Export'];

export default function ComplianceMatrix() {
  const { complianceMatrix, setCurrentPage, uploadId } = useStore();
  const [tab, setTab] = useState(0);
  const [evidenceReq, setEvidenceReq] = useState(null);
  const [downloading, setDownloading] = useState(false);

  // Pull extracted data from store as baseline
  const storeFieldDevices = useStore(s => s.fieldDevices);
  const storeInstruments = useStore(s => s.instruments);

  if (!complianceMatrix) return null;

  const matrix = complianceMatrix;
  const reqs = matrix.requirements || [];
  const conflicts = matrix.conflicts || [];
  const summary = matrix.summary || {};

  // Merge: use compliance results if available, otherwise show extracted data
  const ic = matrix.instrumentationCoverage || {};
  const fdc = matrix.fieldDeviceCoverage || {};

  // If compliance didn't produce instrumentation data, build it from store
  const storeFD = storeFieldDevices?.fieldDevices || storeFieldDevices || [];
  const storeInst = storeInstruments?.instruments || storeInstruments || [];

  if (!ic.totalSpecified && storeInst.length > 0) {
    ic.totalSpecified = storeInst.length;
    ic.matchedItems = ic.matchedItems || [];
    ic.missingItems = ic.missingItems || storeInst.map(inst => ({
      tagNumber: inst.tagNumber || inst.tag || '',
      description: inst.description || '',
      isSafetyCritical: inst.isSafetyCritical || false,
      clauseRef: inst.clauseRef || inst.sourceDocRef || '',
      missingReason: 'Coverage not yet verified — run verification on the Instruments page'
    }));
  }

  if (!fdc.totalInSchematic && storeFD.length > 0) {
    fdc.totalInSchematic = storeFD.length;
    fdc.tracedToRequirements = fdc.tracedToRequirements || 0;
    fdc.untraced = fdc.untraced || storeFD.length;
    fdc.tracedItems = fdc.tracedItems || [];
    fdc.untracedItems = fdc.untracedItems || storeFD.map(d => ({
      tagNumber: d.tagNumber || d.tag || '',
      description: d.description || '',
      reason: 'Cross-reference not yet run'
    }));
  }

  const downloadReport = async () => {
    setDownloading(true);
    try {
      const res = await fetch('/api/crossref/export/gapreport', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadId })
      });
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'ElecDocs-Gap-Analysis-Report.docx';
      a.click();
    } catch (err) {
      alert('Export failed: ' + err.message);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow flex flex-col" style={{ maxHeight: 'calc(100vh - 14rem)' }}>
      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-3 p-4 border-b shrink-0">
        <StatCard label="Compliance" value={`${summary.overallCompliancePercent || 0}%`}
          colour={summary.overallCompliancePercent >= 80 ? 'green' : summary.overallCompliancePercent >= 50 ? 'amber' : 'red'} />
        <StatCard label="Critical Conflicts" value={summary.criticalConflicts || 0}
          colour={summary.criticalConflicts > 0 ? 'red' : 'green'} />
        <StatCard label="Missing Instruments" value={ic.missing || 0}
          colour={ic.missing > 0 ? 'amber' : 'green'} />
        <StatCard label="Untraced Devices" value={fdc.untraced || 0}
          colour={fdc.untraced > 0 ? 'amber' : 'green'} />
      </div>

      {/* Tabs */}
      <div className="flex border-b shrink-0">
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setTab(i)}
            className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
              tab === i ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}>
            {t}
          </button>
        ))}
      </div>

      {/* Tab content — scrollable */}
      <div className="flex-1 overflow-y-auto p-4">

        {/* Tab 0: Requirements Matrix */}
        {tab === 0 && (
          <div className="flex gap-4">
            <div className="flex-1 overflow-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 sticky top-0 z-10">
                  <tr>
                    <th className="px-2 py-1.5 text-left">Req ID</th>
                    <th className="px-2 py-1.5 text-left">Source</th>
                    <th className="px-2 py-1.5 text-left">Clause</th>
                    <th className="px-2 py-1.5 text-left w-64">Requirement</th>
                    <th className="px-2 py-1.5 text-left">Class</th>
                    <th className="px-2 py-1.5 text-left">Status</th>
                    <th className="px-2 py-1.5 text-left">Severity</th>
                    <th className="px-2 py-1.5 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {reqs.map((r, i) => (
                    <tr key={i} className={`border-t hover:bg-slate-50 ${r.metInSchematic === 'not_met' ? 'bg-red-50/50' : ''}`}>
                      <td className="px-2 py-1.5 font-mono">{r.reqId}</td>
                      <td className="px-2 py-1.5">{r.source}</td>
                      <td className="px-2 py-1.5">{r.clauseRef}</td>
                      <td className="px-2 py-1.5 max-w-64 truncate" title={r.text}>{r.text}</td>
                      <td className="px-2 py-1.5">{r.classification}</td>
                      <td className="px-2 py-1.5">
                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[r.metInSchematic] || ''}`}>
                          {r.metInSchematic}
                        </span>
                      </td>
                      <td className="px-2 py-1.5">
                        {r.severity && <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${SEVERITY_PILL[r.severity] || ''}`}>{r.severity}</span>}
                      </td>
                      <td className="px-2 py-1.5">
                        <button onClick={() => setEvidenceReq(evidenceReq === r ? null : r)}
                          className="text-blue-600 hover:underline">Details</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Evidence panel */}
            {evidenceReq && (
              <div className="w-80 border-l pl-4 space-y-3 shrink-0 overflow-y-auto">
                <div className="flex justify-between items-start">
                  <h3 className="font-semibold text-sm">{evidenceReq.reqId}</h3>
                  <button onClick={() => setEvidenceReq(null)} className="text-slate-400 text-xs hover:text-slate-600">Close</button>
                </div>
                <div>
                  <h4 className="text-xs font-medium text-slate-500">Requirement</h4>
                  <p className="text-xs text-slate-700 mt-0.5">{evidenceReq.text}</p>
                </div>
                <div>
                  <h4 className="text-xs font-medium text-slate-500">Evidence</h4>
                  <p className="text-xs text-slate-700 mt-0.5">{evidenceReq.evidence || 'No evidence recorded'}</p>
                </div>

                {/* Missing reason */}
                {(evidenceReq.metInSchematic === 'not_met' || evidenceReq.metInSchematic === 'partial') && (
                  <div className="bg-red-50 border border-red-200 rounded p-2">
                    <h4 className="text-xs font-medium text-red-700">Why not found</h4>
                    <p className="text-xs text-red-600 mt-0.5">
                      {evidenceReq.missingReason || `Could not locate evidence for this requirement in the schematic.`}
                    </p>
                  </div>
                )}

                {evidenceReq.aiSuggestion && (
                  <div className="bg-blue-50 p-2 rounded">
                    <h4 className="text-xs font-medium text-blue-700 mb-0.5">AI Suggestion</h4>
                    <p className="text-xs">{evidenceReq.aiSuggestion}</p>
                  </div>
                )}
                {evidenceReq.affectedPages?.length > 0 && (
                  <div>
                    <h4 className="text-xs font-medium text-slate-500">Affected Pages</h4>
                    <div className="flex gap-1 mt-1">
                      {evidenceReq.affectedPages.map(p => (
                        <button key={p} onClick={() => setCurrentPage(p)}
                          className="px-2 py-0.5 text-xs bg-slate-100 rounded hover:bg-slate-200">{p}</button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Tab 1: Instrumentation Coverage */}
        {tab === 1 && (
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs text-slate-600 mb-1">
                <span>{ic.matched || 0}/{ic.totalSpecified || 0} found ({ic.coveragePercent || 0}%)</span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2">
                <div className="bg-green-500 h-2 rounded-full" style={{ width: `${ic.coveragePercent || 0}%` }} />
              </div>
            </div>

            {/* Safety-critical missing */}
            {(ic.missingItems || []).filter(m => m.isSafetyCritical).length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded p-3">
                <h4 className="text-xs font-medium text-red-700 mb-1">Safety-Critical Missing Instruments</h4>
                {ic.missingItems.filter(m => m.isSafetyCritical).map((m, i) => (
                  <div key={i} className="text-xs text-red-600 mt-1">
                    <span className="font-medium">{m.tagNumber}</span>: {m.description} (Ref: {m.clauseRef})
                    {m.missingReason && <p className="text-red-500 ml-4 mt-0.5 italic">{m.missingReason}</p>}
                  </div>
                ))}
              </div>
            )}

            {/* Matched instruments */}
            {(ic.matchedItems || []).length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-green-700 mb-2">Matched Instruments ({ic.matched})</h4>
                <table className="w-full text-xs">
                  <thead className="bg-green-50">
                    <tr>
                      <th className="px-2 py-1 text-left">Tag</th>
                      <th className="px-2 py-1 text-left">Description</th>
                      <th className="px-2 py-1 text-left">Schematic Evidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ic.matchedItems.map((m, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-2 py-1 font-mono">{m.tagNumber}</td>
                        <td className="px-2 py-1">{m.description}</td>
                        <td className="px-2 py-1 text-slate-500">{m.schematicEvidence}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* All missing instruments (non-critical) */}
            {(ic.missingItems || []).filter(m => !m.isSafetyCritical).length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-amber-700 mb-2">Missing Instruments</h4>
                {ic.missingItems.filter(m => !m.isSafetyCritical).map((m, i) => (
                  <div key={i} className="border-b pb-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="bg-red-100 text-red-800 px-1.5 py-0.5 rounded text-xs font-medium">missing</span>
                      <span className="font-mono text-xs">{m.tagNumber}</span>
                      <span className="text-xs text-slate-600">{m.description}</span>
                    </div>
                    {m.missingReason && (
                      <p className="text-xs text-slate-500 mt-1 ml-4 italic">Reason: {m.missingReason}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Field Devices */}
        {tab === 2 && (
          <div className="space-y-4">
            <p className="text-xs text-slate-600">
              {fdc.totalInSchematic || 0} devices in schematic, {fdc.tracedToRequirements || 0} traced to requirements, {fdc.untraced || 0} untraced
            </p>

            {/* Traced devices */}
            {(fdc.tracedItems || []).length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-green-700 mb-2">Traced to Requirements ({fdc.tracedToRequirements})</h4>
                <table className="w-full text-xs">
                  <thead className="bg-green-50">
                    <tr>
                      <th className="px-2 py-1 text-left">Tag</th>
                      <th className="px-2 py-1 text-left">Description</th>
                      <th className="px-2 py-1 text-left">Traced To</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fdc.tracedItems.map((d, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-2 py-1 font-mono">{d.tagNumber}</td>
                        <td className="px-2 py-1">{d.description}</td>
                        <td className="px-2 py-1 text-blue-600">{d.tracedToReq}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Untraced devices */}
            {(fdc.untracedItems || []).length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-amber-700 mb-2">Untraced Devices ({fdc.untraced})</h4>
                {fdc.untracedItems.map((d, i) => (
                  <div key={i} className="border-b pb-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded text-xs font-medium">untraced</span>
                      <span className="font-mono text-xs">{d.tagNumber}</span>
                      <span className="text-xs text-slate-600">{d.description}</span>
                    </div>
                    {d.reason && (
                      <p className="text-xs text-slate-500 mt-1 ml-4 italic">Reason: {d.reason}</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {(fdc.tracedItems || []).length === 0 && (fdc.untracedItems || []).length === 0 && (
              <p className="text-xs text-slate-400">No field device coverage data available.</p>
            )}
          </div>
        )}

        {/* Tab 3: Conflicts */}
        {tab === 3 && (
          <div className="space-y-3">
            {conflicts.sort((a, b) => severityOrder(a.severity) - severityOrder(b.severity)).map((c, i) => (
              <div key={i} className="border rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${SEVERITY_PILL[c.severity] || ''}`}>{c.severity}</span>
                  <span className="font-mono text-xs">{c.conflictId}</span>
                  <span className="text-xs text-slate-500">Reqs: {(c.reqIds || []).join(', ')}</span>
                </div>
                <p className="text-xs mb-2">{c.description}</p>
                {c.aiSuggestion && (
                  <div className="bg-blue-50 p-2 rounded text-xs">
                    <span className="font-medium text-blue-700">Recommendation: </span>{c.aiSuggestion}
                    <button onClick={() => navigator.clipboard.writeText(c.aiSuggestion)}
                      className="ml-2 text-blue-600 hover:underline">Copy</button>
                  </div>
                )}
                {c.standardsRefs?.length > 0 && (
                  <div className="flex gap-1 mt-2">
                    {c.standardsRefs.map(s => (
                      <span key={s} className="px-1.5 py-0.5 bg-slate-100 rounded text-xs">{s}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {conflicts.length === 0 && <p className="text-xs text-slate-400">No conflicts found.</p>}
          </div>
        )}

        {/* Tab 4: Export */}
        {tab === 4 && (
          <div className="text-center py-8">
            <button onClick={downloadReport} disabled={downloading}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-40">
              {downloading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Generating...
                </span>
              ) : 'Generate Gap Report'}
            </button>
            <p className="text-xs text-slate-400 mt-2">Downloads a Word document with all 13 report sections</p>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, colour }) {
  const bg = { green: 'bg-green-50 border-green-200', amber: 'bg-amber-50 border-amber-200', red: 'bg-red-50 border-red-200' }[colour] || '';
  const text = { green: 'text-green-700', amber: 'text-amber-700', red: 'text-red-700' }[colour] || '';
  return (
    <div className={`border rounded-lg p-2 ${bg}`}>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-xl font-bold ${text}`}>{value}</p>
    </div>
  );
}

function severityOrder(s) { return { critical: 0, major: 1, minor: 2 }[s] ?? 3; }
