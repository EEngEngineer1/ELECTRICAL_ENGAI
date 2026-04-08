import { useState } from 'react';
import useStore from '../store/useStore.js';
import ComplianceMatrix from '../components/ComplianceMatrix.jsx';

const PROGRESS_STEPS = [
  'Parsing requirements...',
  'Analysing schematic pages...',
  'Running cross-reference...',
  'Generating AI suggestions...'
];

export default function CrossRefPage() {
  const { uploadId, reqIds, complianceMatrix, setComplianceMatrix, analysing, setAnalysing } = useStore();
  const [progressStep, setProgressStep] = useState(0);

  const canAnalyse = uploadId && reqIds.length > 0;

  const runAnalysis = async () => {
    setAnalysing(true);
    setProgressStep(0);

    const stepInterval = setInterval(() => {
      setProgressStep(prev => Math.min(prev + 1, PROGRESS_STEPS.length - 1));
    }, 3000);

    try {
      const res = await fetch('/api/crossref/analyse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadId, reqIds })
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
    <div className="space-y-6">
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
