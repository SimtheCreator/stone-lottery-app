import admin from 'firebase-admin';

const SETTINGS_COLLECTION = 'settings';
const GATE_DOCUMENT = 'ritual_gate';
const VALID_MODES = new Set(['auto', 'force-open', 'force-closed']);

let firestoreDb;

const getRequiredEnv = (name) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

const getRequestBody = (body) => {
  if (!body) return {};
  if (typeof body === 'string') return JSON.parse(body);
  return body;
};

const getDb = () => {
  if (!admin.apps.length) {
    const serviceAccount = JSON.parse(getRequiredEnv('FIREBASE_ADMIN_CONFIG'));
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }

  if (!firestoreDb) {
    firestoreDb = admin.firestore();
  }

  return firestoreDb;
};

const timestampToIso = (value) => {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return null;
};

const toFirestoreTimestamp = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid date');
  }
  return admin.firestore.Timestamp.fromDate(date);
};

const normalizeGate = (data = {}) => ({
  mode: VALID_MODES.has(data.mode) ? data.mode : 'force-open',
  openAt: timestampToIso(data.openAt),
  closeAt: timestampToIso(data.closeAt),
  updatedAt: timestampToIso(data.updatedAt),
});

const getGateRef = (db) => db.collection(SETTINGS_COLLECTION).doc(GATE_DOCUMENT);

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const db = getDb();
    const gateRef = getGateRef(db);

    if (req.method === 'GET') {
      const snapshot = await gateRef.get();
      const settings = snapshot.exists ? normalizeGate(snapshot.data()) : normalizeGate();
      return res.status(200).json({
        ok: true,
        serverNow: new Date().toISOString(),
        settings,
      });
    }

    let body;
    try {
      body = getRequestBody(req.body);
    } catch (error) {
      console.error('Invalid gate request body', error);
      return res.status(400).json({ error: 'Invalid request body' });
    }

    const resetPassword = getRequiredEnv('RESET_PASSWORD');
    if (body.password !== resetPassword) {
      return res.status(401).json({ error: 'Invalid admin password' });
    }

    if (!VALID_MODES.has(body.mode)) {
      return res.status(400).json({ error: 'Invalid gate mode' });
    }

    let nextSettings;
    try {
      nextSettings = {
        mode: body.mode,
        openAt: toFirestoreTimestamp(body.openAt),
        closeAt: toFirestoreTimestamp(body.closeAt),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
    } catch (error) {
      console.error('Invalid gate schedule time', error);
      return res.status(400).json({ error: 'Invalid schedule time' });
    }

    if (nextSettings.openAt && nextSettings.closeAt && nextSettings.openAt.toMillis() >= nextSettings.closeAt.toMillis()) {
      return res.status(400).json({ error: 'Open time must be before close time' });
    }

    await gateRef.set(nextSettings, { merge: true });
    const saved = await gateRef.get();
    return res.status(200).json({
      ok: true,
      serverNow: new Date().toISOString(),
      settings: normalizeGate(saved.data()),
    });
  } catch (error) {
    console.error('Gate settings error', error);
    return res.status(500).json({ error: 'Server error' });
  }
}
