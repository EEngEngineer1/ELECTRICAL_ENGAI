import { create } from 'zustand';

const useStore = create((set, get) => ({
  // Upload state
  uploadId: null,
  pageImages: [],
  extractedText: '',
  pageCount: 0,
  dpiUsed: 0,
  dpiMax: 0,
  pageFormat: '',
  currentPage: 1,
  zoom: 1,

  // Extraction state
  components: null,
  ioSignals: null,
  fieldDevices: null,
  suggestedQuestions: [],

  // Requirements state
  reqIds: [],
  requirements: [],
  instruments: null,

  // Cross-reference state
  complianceMatrix: null,

  // Chat state
  chatHistory: [],
  isStreaming: false,

  // Process control & reverse engineering
  processControl: null,
  reverseEngineer: null,

  // P&ID state
  pnidId: null,
  pnidPageImages: [],
  pnidExtractedText: '',
  pnidPageCount: 0,
  pnidDpiUsed: 0,
  pnidDpiMax: 0,
  pnidPageFormat: '',
  pnidCurrentPage: 1,
  pnidAnalysis: null,
  pnidCrossref: null,
  pnidUploading: false,
  pnidAnalysing: false,

  // Loading states
  uploading: false,
  extracting: false,
  analysing: false,

  // Actions
  setUploadData: (data) => set({
    uploadId: data.uploadId,
    pageImages: data.pageImages,
    extractedText: data.extractedText,
    pageCount: data.pageCount,
    dpiUsed: data.dpiUsed,
    dpiMax: data.dpiMax,
    pageFormat: data.pageFormat,
    currentPage: 1
  }),

  setCurrentPage: (page) => set({ currentPage: page }),
  setZoom: (zoom) => set({ zoom }),

  setComponents: (data) => set({
    components: data.components,
    ioSignals: data.ioSignals
  }),

  setFieldDevices: (data) => set({ fieldDevices: data }),
  setInstruments: (data) => set({ instruments: data }),
  setComplianceMatrix: (data) => set({ complianceMatrix: data }),
  setProcessControl: (data) => set({ processControl: data }),
  setReverseEngineer: (data) => set({ reverseEngineer: data }),

  // P&ID actions
  setPnidUploadData: (data) => set({
    pnidId: data.pnidId, pnidPageImages: data.pageImages, pnidExtractedText: data.extractedText,
    pnidPageCount: data.pageCount, pnidDpiUsed: data.dpiUsed, pnidDpiMax: data.dpiMax,
    pnidPageFormat: data.pageFormat, pnidCurrentPage: 1
  }),
  setPnidCurrentPage: (p) => set({ pnidCurrentPage: p }),
  setPnidAnalysis: (data) => set({ pnidAnalysis: data }),
  setPnidCrossref: (data) => set({ pnidCrossref: data }),
  setPnidUploading: (v) => set({ pnidUploading: v }),
  setPnidAnalysing: (v) => set({ pnidAnalysing: v }),
  setSuggestedQuestions: (q) => set({ suggestedQuestions: q }),

  // Helper: builds common payload with all extracted data for API calls
  getPayload: () => {
    const s = get();
    return {
      uploadId: s.uploadId,
      fieldDevices: s.fieldDevices?.fieldDevices || s.fieldDevices || [],
      components: s.components || [],
      ioSignals: s.ioSignals || [],
      instruments: s.instruments?.instruments || s.instruments || [],
      reqIds: s.reqIds || []
    };
  },

  addReqId: (reqId, type) => set(state => ({
    reqIds: [...state.reqIds, reqId],
    requirements: [...state.requirements, { reqId, type }]
  })),

  addChatMessage: (msg) => set(state => ({
    chatHistory: [...state.chatHistory, msg]
  })),

  updateLastChat: (text) => set(state => {
    const history = [...state.chatHistory];
    if (history.length > 0) {
      history[history.length - 1] = { ...history[history.length - 1], text };
    }
    return { chatHistory: history };
  }),

  setStreaming: (v) => set({ isStreaming: v }),
  setUploading: (v) => set({ uploading: v }),
  setExtracting: (v) => set({ extracting: v }),
  setAnalysing: (v) => set({ analysing: v }),

  updateDpi: (dpiUsed, pageImages) => set({ dpiUsed, pageImages }),

  reset: () => set({
    uploadId: null, pageImages: [], extractedText: '', pageCount: 0,
    dpiUsed: 0, dpiMax: 0, pageFormat: '', currentPage: 1, zoom: 1,
    components: null, ioSignals: null, fieldDevices: null,
    suggestedQuestions: [], reqIds: [], requirements: [], instruments: null,
    complianceMatrix: null, chatHistory: [], isStreaming: false,
    uploading: false, extracting: false, analysing: false,
    pnidId: null, pnidPageImages: [], pnidExtractedText: '', pnidPageCount: 0,
    pnidDpiUsed: 0, pnidDpiMax: 0, pnidPageFormat: '', pnidCurrentPage: 1,
    pnidAnalysis: null, pnidCrossref: null, pnidUploading: false, pnidAnalysing: false
  })
}));

export default useStore;
