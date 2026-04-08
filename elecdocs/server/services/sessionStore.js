const sessions = new Map();

const TTL_MS = (parseInt(process.env.SESSION_TTL_HOURS, 10) || 4) * 60 * 60 * 1000;

/** Creates a new session and returns its data object. */
export function createSession(uploadId) {
  const session = {
    uploadId,
    createdAt: Date.now(),
    pageImages: [],
    extractedText: '',
    dpiUsed: 0,
    dpiMax: 0,
    pageFormat: '',
    pageWidthPt: 0,
    pageHeightPt: 0,
    pageCount: 0,
    fieldDevices: null,
    requirements: new Map(),
    complianceMatrix: null
  };
  sessions.set(uploadId, session);
  return session;
}

/** Retrieves a session by uploadId. Returns null if not found or expired. */
export function getSession(uploadId) {
  const session = sessions.get(uploadId);
  if (!session) return null;
  if (Date.now() - session.createdAt > TTL_MS) {
    sessions.delete(uploadId);
    return null;
  }
  return session;
}

/** Cleans up expired sessions. */
function cleanup() {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.createdAt > TTL_MS) {
      sessions.delete(id);
    }
  }
}

// Run cleanup every 30 minutes
setInterval(cleanup, 30 * 60 * 1000).unref();
