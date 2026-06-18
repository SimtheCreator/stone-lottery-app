import admin from 'firebase-admin';

const RESULTS_COLLECTION = 'draw_results';
const SELECTIONS_COLLECTION = 'selections';

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

const normalizeText = (value, maxLength = 120) => (
  String(value || '').trim().slice(0, maxLength)
);

const isValidDrawDate = (value) => (
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
);

const isValidTwoDigit = (value) => (
  typeof value === 'string' && /^\d{2}$/.test(value)
);

const isValidFirstPrize = (value) => (
  !value || (typeof value === 'string' && /^\d{6}$/.test(value))
);

const getAdminPassword = (req) => (
  req.headers['x-admin-password'] || req.query?.password || ''
);

const normalizeResult = (document) => {
  const data = document.data();
  return {
    id: document.id,
    drawDate: data.drawDate || document.id,
    twoDigit: data.twoDigit || '',
    firstPrize: data.firstPrize || '',
    note: data.note || '',
    matchedCount: data.matchedCount || 0,
    claimedCount: data.claimedCount || 0,
    matchedParticipants: data.matchedParticipants || [],
    createdAt: timestampToIso(data.createdAt),
    updatedAt: timestampToIso(data.updatedAt),
  };
};

const readCurrentSelections = async (db) => {
  const snapshot = await db.collection(SELECTIONS_COLLECTION).get();
  return snapshot.docs.map((document) => ({
    id: document.id,
    name: document.data().name || '',
    number: document.data().number || document.id,
    timestamp: timestampToIso(document.data().timestamp),
  }));
};

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const resetPassword = getRequiredEnv('RESET_PASSWORD');
    const db = getDb();

    if (req.method === 'GET') {
      if (getAdminPassword(req) !== resetPassword) {
        return res.status(401).json({ error: 'Invalid admin password' });
      }

      const snapshot = await db.collection(RESULTS_COLLECTION)
        .orderBy('drawDate', 'desc')
        .limit(30)
        .get();
      const results = snapshot.docs.map(normalizeResult);

      return res.status(200).json({
        ok: true,
        serverNow: new Date().toISOString(),
        results,
      });
    }

    let body;
    try {
      body = getRequestBody(req.body);
    } catch (error) {
      console.error('Invalid draw result request body', error);
      return res.status(400).json({ error: 'Invalid request body' });
    }

    if (body.password !== resetPassword) {
      return res.status(401).json({ error: 'Invalid admin password' });
    }

    const drawDate = normalizeText(body.drawDate, 10);
    const twoDigit = normalizeText(body.twoDigit, 2);
    const firstPrize = normalizeText(body.firstPrize, 6);
    const note = normalizeText(body.note, 200);

    if (!isValidDrawDate(drawDate) || !isValidTwoDigit(twoDigit) || !isValidFirstPrize(firstPrize)) {
      return res.status(400).json({ error: 'Invalid draw result' });
    }

    const currentSelections = await readCurrentSelections(db);
    const matchedParticipants = currentSelections
      .filter((selection) => String(selection.number).padStart(2, '0') === twoDigit)
      .map((selection) => ({
        name: selection.name,
        number: String(selection.number).padStart(2, '0'),
        timestamp: selection.timestamp,
      }))
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));

    const resultRef = db.collection(RESULTS_COLLECTION).doc(drawDate);
    const existing = await resultRef.get();
    await resultRef.set({
      drawDate,
      twoDigit,
      firstPrize,
      note,
      matchedCount: matchedParticipants.length,
      claimedCount: currentSelections.length,
      matchedParticipants,
      source: 'manual-admin',
      createdAt: existing.exists ? existing.data().createdAt || admin.firestore.FieldValue.serverTimestamp() : admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    const saved = await resultRef.get();
    return res.status(200).json({
      ok: true,
      result: normalizeResult(saved),
    });
  } catch (error) {
    console.error('Draw results error', error);
    return res.status(500).json({ error: 'Server error' });
  }
}
