import { useState } from 'react';
import useStore from '../store/useStore.js';

const STATUS_BADGE = {
  met: 'bg-green-100 text-green-800', partial: 'bg-amber-100 text-amber-800',
  not_met: 'bg-red-100 text-red-800', conflict: 'bg-orange-100 text-orange-800'
};
const SEVERITY_PILL = { critical: 'bg-red-600 text-white', major: 'bg-amber-500 text-white', minor: 'bg-slate-400 text-white' };
const COVERAGE_BADGE = {
  matched: 'bg-green-100 text-green-800', tag_only: 'bg-amber-100 text-amber-800',
  description_match: 'bg-amber-100 text-amber-800', missing: 'bg-red-100 text-red-800',
  unverified: 'bg-slate-100 text-slate-500'
};

const TABS = ['Requirements Matrix', 'Instrumentation Coverage', 'Field Devices', 'Conflicts', 'Generate Report'];

export default function ComplianceMatrix() {
  const { complianceMatrix, setCurrentPage } = useStore();
  const [tab, setTab] = useState(0);
  const [evidenceReq, setEvidenceReq] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const { uploadId } = useStore();

  if (!complianceMatrix) return null;

  const matrix = complianceMatrix;
  const reqs = matrix.requirements || [];
  const conflicts = matrix.conflicts || [];
  const ic = matrix.instrumentationCoverage || {};
  const fdc = matrix.fieldDeviceCoverage || {};
  const summary = matrix.summary || {};

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
    <div className="bg-white rounded-lg shadow">
      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-3 p-4 border-b">
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
      <div className="flex border-b">
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setTab(i)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === i ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}>
            {t}
          </button>
        ))}
      </div>

      <div className="p-4">
        {/* Tab 0: Requirements Matrix */}
        {tab === 0 && (
          <div className="flex gap-4">
            <div className="flex-1 overflow-x-auto max-h-96">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left">Req ID</th>
                    <th className="px-3 py-2 text-left">Source</th>
                    <th className="px-3 py-2 text-left">Classification</th>
                    <th className="px-3 py-2 text-left">In Schematic</th>
                    <th className="px-3 py-2 text-left">Severity</th>
                    <th className="px-3 py-2 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {reqs.map((r, i) => (
                    <tr key={i} className="border-t hover:bg-slate-50">
                      <td className="px-3 py-2 font-mono text-xs">{r.reqId}</td>
                      <td className="px-3 py-2">{r.source}</td>
                      <td className="px-3 py-2">{r.classification}</td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[r.metInSchematic] || ''}`}>
                          {r.metInSchematic}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {r.severity && <span className={`px-2 py-0.5 rounded text-xs font-medium ${SEVERITY_PILL[r.severity] || ''}`}>{r.severity}</span>}
                      </td>
                      <td className="px-3 py-2">
                        <button onClick={() => setEvidenceReq(r)} className="text-xs text-blue-600 hover:underline">View Evidence</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Evidence panel */}
            {evidenceReq && (
              <div className="w-80 border-l pl-4 space-y-3">
                <div className="flex justify-between">
                  <h3 className="font-semibold text-sm">{evidenceReq.reqId}</h3>
                  <button onClick={() => setEvidenceReq(null)} className="text-slate-400 text-xs">Close</button>
                </div>
                <p className="text-sm text-slate-600">{evidenceReq.text}</p>
                <div>
                  <h4 className="text-xs font-medium text-slate-500">Evidence</h4>
                  <p className="text-sm">{evidenceReq.evidence || 'No evidence recorded'}</p>
                </div>
                {evidenceReq.aiSuggestion && (
                  <div className="bg-blue-50 p-3 rounded text-sm">
                    <h4 className="text-xs font-medium text-blue-700 mb-1">AI Suggestion</h4>
                    <p>{evidenceReq.aiSuggestion}</p>
                  </div>
                )}
                {evidenceReq.affectedPages?.length > 0 && (
                  <div>
                    <h4 className="text-xs font-medium text-slate-500">Affected Pages</h4>
                    <div className="flex gap-1 mt-1">
                      {evidenceReq.affectedPages.map(p => (
                        <button key={p} onClick={() => setCurrentPage(p)}
                          className="px-2 py-1 text-xs bg-slate-100 rounded hover:bg-slate-200">{p}</button>
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
          <div>
            <div className="mb-3">
              <div className="flex justify-between text-sm text-slate-600 mb-1">
                <span>{ic.matched || 0}/{ic.totalSpecified || 0} found ({ic.coveragePercent || 0}%)</span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2">
                <div className="bg-green-500 h-2 rounded-full" style={{ width: `${ic.coveragePercent || 0}%` }} />
              </div>
            </div>
            {(ic.missingItems || []).filter(m => m.isSafetyCritical).length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded p-3 mb-3">
                <h4 className="text-sm font-medium text-red-700">Safety-Critical Missing Instruments</h4>
                {ic.missingItems.filter(m => m.isSafetyCritical).map((m, i) => (
                  <p key={i} className="text-sm text-red-600">{m.tagNumber}: {m.description} (Ref: {m.clauseRef})</p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Field Devices */}
        {tab === 2 && (
          <div>
            <p className="text-sm text-slate-600 mb-2">
              {fdc.totalInSchematic || 0} devices in schematic, {fdc.tracedToRequirements || 0} traced to requirements
            </p>
            {(fdc.untracedItems || []).length > 0 && (
              <div className="space-y-1">
                <h4 className="text-sm font-medium text-amber-600">Untraced Devices</h4>
                {fdc.untracedItems.map((d, i) => (
                  <p key={i} className="text-sm"><span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded text-xs mr-2">untraced</span>{d.tagNumber}: {d.description}</p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Conflicts */}
        {tab === 3 && (
          <div className="space-y-3">
            {conflicts.sort((a, b) => severityOrder(a.severity) - severityOrder(b.severity)).map((c, i) => (
              <div key={i} className="border rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${SEVERITY_PILL[c.severity] || ''}`}>{c.severity}</span>
                  <span className="font-mono text-sm">{c.conflictId}</span>
                  <span className="text-xs text-slate-500">Reqs: {(c.reqIds || []).join(', ')}</span>
                </div>
                <p className="text-sm mb-2">{c.description}</p>
                {c.aiSuggestion && (
                  <div className="bg-blue-50 p-3 rounded text-sm">
                    <span className="text-xs font-medium text-blue-700">Recommendation: </span>{c.aiSuggestion}
                    <button onClick={() => navigator.clipboard.writeText(c.aiSuggestion)}
                      className="ml-2 text-xs text-blue-600 hover:underline">Copy</button>
                  </div>
                )}
                {c.standardsRefs?.length > 0 && (
                  <div className="flex gap-1 mt-2">
                    {c.standardsRefs.map(s => (
                      <span key={s} className="px-2 py-0.5 bg-slate-100 rounded text-xs">{s}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {conflicts.length === 0 && <p className="text-slate-400 text-sm">No conflicts found.</p>}
          </div>
        )}

        {/* Tab 4: Generate Report */}
        {tab === 4 && (
          <div className="text-center py-8">
            <button onClick={downloadReport} disabled={downloading}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium disabled:opacity-40">
              {downloading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Generating...
                </span>
              ) : 'Generate Gap Report'}
            </button>
            <p className="text-sm text-slate-400 mt-2">Downloads a Word document with all 13 report sections</p>
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
    <div className={`border rounded-lg p-3 ${bg}`}>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-2xl font-bold ${text}`}>{value}</p>
    </div>
  );
}

function severityOrder(s) { return { critical: 0, major: 1, minor: 2 }[s] ?? 3; }
