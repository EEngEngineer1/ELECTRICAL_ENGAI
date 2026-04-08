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
  setSuggestedQuestions: (q) => set({ suggestedQuestions: q }),

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
    uploading: false, extracting: false, analysing: false
  })
}));

export default useStore;
