import admin from 'firebase-admin';

const COLLECTIONS_TO_RESET = ['selections', 'participants', 'logs'];
const ARCHIVE_COLLECTION = 'round_archives';
const TEST_COLLECTIONS_TO_PURGE = [...COLLECTIONS_TO_RESET, ARCHIVE_COLLECTION];
const BATCH_SIZE = 500;

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

const deleteCollection = async (db, collectionName) => {
  let deletedCount = 0;

  while (true) {
    const snapshot = await db.collection(collectionName).limit(BATCH_SIZE).get();

    if (snapshot.empty) {
      return deletedCount;
    }

    const batch = db.batch();
    snapshot.docs.forEach((document) => batch.delete(document.ref));
    await batch.commit();

    deletedCount += snapshot.size;

    if (snapshot.size < BATCH_SIZE) {
      return deletedCount;
    }
  }
};

const readCollection = async (db, collectionName) => {
  const snapshot = await db.collection(collectionName).get();
  return snapshot.docs.map((document) => ({
    id: document.id,
    ...document.data(),
  }));
};

const archiveCurrentRound = async (db) => {
  const [selections, logs] = await Promise.all([
    readCollection(db, 'selections'),
    readCollection(db, 'logs'),
  ]);

  if (!selections.length && !logs.length) {
    return null;
  }

  const participants = selections
    .map((selection) => ({
      name: selection.name || '',
      number: selection.number || selection.id,
      timestamp: selection.timestamp || null,
    }))
    .sort((a, b) => String(a.number).localeCompare(String(b.number)));

  const archiveRef = await db.collection(ARCHIVE_COLLECTION).add({
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    claimedCount: participants.length,
    availableCount: Math.max(0, 100 - participants.length),
    selectedNumbers: participants.map((participant) => participant.number),
    participants,
    logs: logs
      .map((log) => ({
        text: log.text || '',
        type: log.type || 'info',
        timestamp: log.timestamp || null,
      }))
      .slice(-150),
  });

  return archiveRef.id;
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  let body;
  try {
    body = getRequestBody(req.body);
  } catch (error) {
    console.error('Invalid reset request body', error);
    return res.status(400).json({ error: 'Invalid request body' });
  }

  try {
    const resetPassword = getRequiredEnv('RESET_PASSWORD');

    if (body.password !== resetPassword) {
      return res.status(401).json({ error: 'Invalid admin password' });
    }

    const db = getDb();
    const isTestPurge = body.mode === 'purge-test-data';
    const archiveId = isTestPurge ? null : await archiveCurrentRound(db);
    const deleted = {};
    const collectionsToDelete = isTestPurge ? TEST_COLLECTIONS_TO_PURGE : COLLECTIONS_TO_RESET;

    for (const collectionName of collectionsToDelete) {
      deleted[collectionName] = await deleteCollection(db, collectionName);
    }

    return res.status(200).json({ ok: true, archiveId, deleted, mode: isTestPurge ? 'purge-test-data' : 'reset-round' });
  } catch (err) {
    console.error('Reset error', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
