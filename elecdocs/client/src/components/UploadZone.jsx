import { useState, useCallback } from 'react';
import useStore from '../store/useStore.js';

const API = '/api/upload';

export default function UploadZone({ type = 'schematic' }) {
  const [dragOver, setDragOver] = useState(false);
  const { uploading, setUploading, setUploadData, uploadId, addReqId, setSuggestedQuestions } = useStore();
  const [reqType, setReqType] = useState('FDS');

  const handleFile = useCallback(async (file) => {
    if (!file) return;
    const maxSize = 200 * 1024 * 1024;
    if (file.size > maxSize) {
      alert(`File too large (${(file.size / 1024 / 1024).toFixed(0)}MB). Maximum is 200MB.`);
      return;
    }
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      if (type === 'schematic') {
        const res = await fetch(`${API}/schematic`, { method: 'POST', body: formData });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setUploadData(data);

        // Fetch suggested questions
        try {
          const sugRes = await fetch('/api/analyse/suggestions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uploadId: data.uploadId })
          });
          const sugData = await sugRes.json();
          if (sugData.questions) setSuggestedQuestions(sugData.questions);
        } catch { /* non-critical */ }
      } else {
        formData.append('type', reqType);
        if (uploadId) formData.append('uploadId', uploadId);
        const res = await fetch(`${API}/requirements`, { method: 'POST', body: formData });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        addReqId(data.reqId, data.type);
      }
    } catch (err) {
      alert(`Upload failed: ${err.message}`);
    } finally {
      setUploading(false);
    }
  }, [type, reqType, uploadId, setUploading, setUploadData, addReqId, setSuggestedQuestions]);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  }, [handleFile]);

  const onElectronOpen = useCallback(async () => {
    if (window.__ELECTRON__ && window.electronAPI) {
      const ext = type === 'schematic' ? ['pdf'] : ['pdf', 'docx'];
      const path = await window.electronAPI.openFileDialog([{ name: 'Documents', extensions: ext }]);
      if (path) {
        // For Electron, send file path to backend
        const res = await fetch(`${API}/${type === 'schematic' ? 'schematic' : 'requirements'}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filePath: path, type: reqType, uploadId })
        });
        const data = await res.json();
        if (type === 'schematic') setUploadData(data);
        else addReqId(data.reqId, data.type);
      }
    }
  }, [type, reqType, uploadId, setUploadData, addReqId]);

  const acceptTypes = type === 'schematic' ? '.pdf' : '.pdf,.docx';
  const label = type === 'schematic' ? 'Upload Schematic (PDF)' : 'Upload Requirements (PDF/DOCX)';

  return (
    <div className="space-y-3">
      {type === 'requirements' && (
        <div className="flex gap-2">
          <button onClick={() => setReqType('URS')}
            className={`px-3 py-1 rounded text-sm font-medium ${reqType === 'URS' ? 'bg-blue-600 text-white' : 'bg-slate-200'}`}>
            URS
          </button>
          <button onClick={() => setReqType('FDS')}
            className={`px-3 py-1 rounded text-sm font-medium ${reqType === 'FDS' ? 'bg-blue-600 text-white' : 'bg-slate-200'}`}>
            FDS
          </button>
        </div>
      )}

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
          dragOver ? 'border-blue-500 bg-blue-50' : 'border-slate-300 hover:border-slate-400'
        }`}
        onClick={() => {
          if (window.__ELECTRON__) { onElectronOpen(); return; }
          document.getElementById(`file-input-${type}`).click();
        }}
      >
        {uploading ? (
          <div className="flex items-center justify-center gap-2">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-slate-600">Processing...</span>
          </div>
        ) : (
          <>
            <p className="text-slate-600 font-medium">{label}</p>
            <p className="text-sm text-slate-400 mt-1">Drag and drop or click to browse</p>
          </>
        )}
      </div>

      <input
        id={`file-input-${type}`}
        type="file"
        accept={acceptTypes}
        className="hidden"
        onChange={(e) => handleFile(e.target.files[0])}
      />
    </div>
  );
}
