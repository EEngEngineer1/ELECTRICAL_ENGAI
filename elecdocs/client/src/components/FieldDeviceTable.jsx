import { useState } from 'react';
import useStore from '../store/useStore.js';

const DEVICE_COLOURS = {
  Transmitter: 'border-l-teal-500', Valve: 'border-l-amber-500',
  Motor: 'border-l-red-400', Switch: 'border-l-blue-500'
};
const COVERAGE_BADGE = {
  matched: 'bg-green-100 text-green-800', tag_only: 'bg-amber-100 text-amber-800',
  description_match: 'bg-amber-100 text-amber-800', missing: 'bg-red-100 text-red-800',
  unverified: 'bg-slate-100 text-slate-500', extra_in_schematic: 'bg-blue-100 text-blue-800'
};

export default function FieldDeviceTable() {
  const { fieldDevices, setCurrentPage, requirements } = useStore();
  const [selected, setSelected] = useState(null);

  const devices = fieldDevices?.fieldDevices || [];
  if (devices.length === 0) return null;

  const hasReqs = requirements.length > 0;

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="px-4 py-3 border-b">
        <h2 className="font-semibold text-slate-700">Field Devices ({devices.length})</h2>
      </div>

      <div className="overflow-x-auto max-h-96">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 sticky top-0">
            <tr>
              <th className="px-3 py-2 text-left">Tag</th>
              <th className="px-3 py-2 text-left">Description</th>
              <th className="px-3 py-2 text-left">Type</th>
              <th className="px-3 py-2 text-left">Variable</th>
              <th className="px-3 py-2 text-left">Signal</th>
              <th className="px-3 py-2 text-left">Location</th>
              {hasReqs && <th className="px-3 py-2 text-left">Coverage</th>}
              <th className="px-3 py-2 text-left">Pages</th>
            </tr>
          </thead>
          <tbody>
            {devices.map((d, i) => {
              const borderClass = Object.entries(DEVICE_COLOURS).find(([k]) =>
                d.deviceType?.toLowerCase().includes(k.toLowerCase()))?.[1] || 'border-l-slate-300';
              return (
                <tr key={i} onClick={() => setSelected(selected === i ? null : i)}
                  className={`border-t border-l-4 ${borderClass} hover:bg-slate-50 cursor-pointer`}>
                  <td className="px-3 py-2 font-mono">{d.tagNumber}</td>
                  <td className="px-3 py-2">{d.description}</td>
                  <td className="px-3 py-2">{d.deviceType}</td>
                  <td className="px-3 py-2">{d.processVariable}</td>
                  <td className="px-3 py-2">{d.signalType}</td>
                  <td className="px-3 py-2">{d.location}</td>
                  {hasReqs && (
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${COVERAGE_BADGE[d.coverageStatus] || COVERAGE_BADGE.unverified}`}>
                        {d.coverageStatus || 'unverified'}
                      </span>
                    </td>
                  )}
                  <td className="px-3 py-2">
                    {(d.pages || []).map(p => (
                      <button key={p} onClick={(e) => { e.stopPropagation(); setCurrentPage(p); }}
                        className="text-blue-600 hover:underline mr-1">{p}</button>
                    ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selected !== null && devices[selected] && (
        <div className="border-t p-4 bg-slate-50 space-y-1 text-sm">
          <div className="flex justify-between">
            <h3 className="font-semibold">{devices[selected].tagNumber}</h3>
            <button onClick={() => setSelected(null)} className="text-slate-400">Close</button>
          </div>
          <p>{devices[selected].description}</p>
          <p>Area: {devices[selected].area} | Location: {devices[selected].location}</p>
          <p>Signal: {devices[selected].signalType} {devices[selected].signalRange} | Process: {devices[selected].processRange}</p>
          <p>Cable: {devices[selected].cableRef} | Panel: {devices[selected].panelConnection}</p>
          <p>PLC: {devices[selected].plcAddress} | Fail state: {devices[selected].failState || 'N/A'}</p>
        </div>
      )}
    </div>
  );
}
