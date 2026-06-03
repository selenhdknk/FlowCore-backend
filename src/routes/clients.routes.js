/**
 * FlowCore Backend - Müşteri (Client) Router
 * 
 * Flutter ClientRepository arayüzüyle birebir eşleşen endpoint'ler:
 * 
 * GET    /api/clients            → ClientRepository.getClients()
 * POST   /api/clients            → ClientRepository.addClient()
 * PUT    /api/clients/:id        → ClientRepository.updateClient()
 * DELETE /api/clients/:id        → ClientRepository.deleteClient()
 * GET    /api/clients/:id        → Tek müşteri detayı
 * GET    /api/clients/:id/projects → Müşteriye ait projeler
 * 
 * Tüm endpoint'ler JWT kimlik doğrulaması gerektirir.
 * Her kullanıcı yalnızca kendi oluşturduğu müşterilere erişebilir (userId filtresi).
 */

const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { getFirestore } = require('../config/firebase');
const { authenticate } = require('../middleware/authenticate');

const router = express.Router();
const COLLECTION = 'clients';

// ── Doğrulama Kuralları ───────────────────────────────────────────────────────

const clientValidation = [
  body('name')
    .trim()
    .notEmpty().withMessage('Müşteri adı boş bırakılamaz.')
    .isLength({ max: 100 }).withMessage('Müşteri adı 100 karakterden uzun olamaz.'),
  body('companyName')
    .trim()
    .optional()
    .isLength({ max: 200 }).withMessage('Şirket adı 200 karakterden uzun olamaz.'),
  body('email')
    .trim()
    .isEmail().withMessage('Geçerli bir e-posta adresi giriniz.')
    .normalizeEmail(),
  body('phone')
    .trim()
    .optional(),
  body('notes')
    .trim()
    .optional()
    .isLength({ max: 1000 }).withMessage('Notlar 1000 karakterden uzun olamaz.'),
];

function handleValidationErrors(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({
      success: false,
      message: errors.array()[0].msg,
      errors: errors.array(),
    });
  }
  return null;
}

// ── Tüm route'larda kimlik doğrulaması zorunlu ────────────────────────────────
router.use(authenticate);

// ── Endpoint'ler ──────────────────────────────────────────────────────────────

/**
 * GET /api/clients
 * Flutter: ClientRepository.getClients()
 * 
 * Sorgu parametreleri:
 *   ?search=ahmet   → isimde/şirkette arama
 *   ?limit=50       → sayfalama (varsayılan: 100)
 * 
 * Returns: { success, clients: [{ id, name, companyName, email, phone, notes, createdAt }] }
 */
router.get('/', async (req, res, next) => {
  try {
    const { search, limit = 100 } = req.query;
    const db = getFirestore();

    let query = db.collection(COLLECTION)
      .where('userId', '==', req.user.uid)
      .orderBy('createdAt', 'desc')
      .limit(parseInt(limit));

    const snapshot = await query.get();

    let clients = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      // Timestamp nesnelerini ISO string'e dönüştür (Flutter DateTime.parse uyumlu)
      createdAt: doc.data().createdAt?.toDate?.()?.toISOString() || doc.data().createdAt,
    }));

    // İsim/şirket araması (Firestore text search desteklemediği için client-side)
    if (search) {
      const q = search.toLowerCase();
      clients = clients.filter(c =>
        c.name?.toLowerCase().includes(q) ||
        c.companyName?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q)
      );
    }

    res.json({
      success: true,
      count: clients.length,
      clients,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/clients/:id
 * Tek müşteri detayı
 */
router.get('/:id', param('id').notEmpty(), async (req, res, next) => {
  try {
    const doc = await getFirestore()
      .collection(COLLECTION)
      .doc(req.params.id)
      .get();

    if (!doc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Müşteri bulunamadı.',
        code: 'NOT_FOUND',
      });
    }

    // Kullanıcı kendi müşterisine erişiyor mu kontrol et
    if (doc.data().userId !== req.user.uid) {
      return res.status(403).json({
        success: false,
        message: 'Bu kaynağa erişim yetkiniz yok.',
        code: 'FORBIDDEN',
      });
    }

    const data = doc.data();
    res.json({
      success: true,
      client: {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/clients
 * Flutter: ClientRepository.addClient(ClientModel client)
 * 
 * Body: { name, companyName, email, phone, notes }
 * Returns: { success, client: { id, name, companyName, email, phone, notes, createdAt } }
 */
router.post('/', clientValidation, async (req, res, next) => {
  try {
    const validationError = handleValidationErrors(req, res);
    if (validationError) return;

    const { name, companyName = '', email, phone = '', notes = '' } = req.body;

    const clientData = {
      name,
      companyName,
      email,
      phone,
      notes,
      userId: req.user.uid, // Güvenlik: kullanıcıya bağla
      createdAt: new Date(),
    };

    const docRef = await getFirestore().collection(COLLECTION).add(clientData);

    console.log(`✅ Yeni müşteri eklendi: ${docRef.id} (Kullanıcı: ${req.user.uid})`);

    res.status(201).json({
      success: true,
      message: 'Müşteri başarıyla eklendi.',
      client: {
        id: docRef.id,
        ...clientData,
        createdAt: clientData.createdAt.toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/clients/:id
 * Flutter: ClientRepository.updateClient(ClientModel client)
 * 
 * Body: { name?, companyName?, email?, phone?, notes? }
 * Returns: { success, client }
 */
router.put('/:id', clientValidation, async (req, res, next) => {
  try {
    const validationError = handleValidationErrors(req, res);
    if (validationError) return;

    const db = getFirestore();
    const docRef = db.collection(COLLECTION).doc(req.params.id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Müşteri bulunamadı.',
        code: 'NOT_FOUND',
      });
    }

    // Sahiplik kontrolü
    if (doc.data().userId !== req.user.uid) {
      return res.status(403).json({
        success: false,
        message: 'Bu kaynağı güncelleme yetkiniz yok.',
        code: 'FORBIDDEN',
      });
    }

    const { name, companyName, email, phone, notes } = req.body;
    const updateData = { updatedAt: new Date() };
    if (name !== undefined) updateData.name = name;
    if (companyName !== undefined) updateData.companyName = companyName;
    if (email !== undefined) updateData.email = email;
    if (phone !== undefined) updateData.phone = phone;
    if (notes !== undefined) updateData.notes = notes;

    await docRef.update(updateData);

    const updatedDoc = await docRef.get();
    const data = updatedDoc.data();

    res.json({
      success: true,
      message: 'Müşteri güncellendi.',
      client: {
        id: updatedDoc.id,
        ...data,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/clients/:id
 * Flutter: ClientRepository.deleteClient(String id)
 * 
 * Returns: { success, message }
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const db = getFirestore();
    const docRef = db.collection(COLLECTION).doc(req.params.id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Müşteri bulunamadı.',
        code: 'NOT_FOUND',
      });
    }

    if (doc.data().userId !== req.user.uid) {
      return res.status(403).json({
        success: false,
        message: 'Bu kaynağı silme yetkiniz yok.',
        code: 'FORBIDDEN',
      });
    }

    await docRef.delete();

    console.log(`🗑️ Müşteri silindi: ${req.params.id}`);

    res.json({
      success: true,
      message: 'Müşteri başarıyla silindi.',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/clients/:id/projects
 * Flutter: ProjectRepository.getProjectsForClientStream(String clientId)
 * 
 * Bir müşteriye ait tüm projeleri döndürür.
 */
router.get('/:id/projects', async (req, res, next) => {
  try {
    const db = getFirestore();

    // Önce müşterinin bu kullanıcıya ait olduğunu doğrula
    const clientDoc = await db.collection(COLLECTION).doc(req.params.id).get();
    if (!clientDoc.exists || clientDoc.data().userId !== req.user.uid) {
      return res.status(404).json({
        success: false,
        message: 'Müşteri bulunamadı.',
        code: 'NOT_FOUND',
      });
    }

    const snapshot = await db.collection('projects')
      .where('userId', '==', req.user.uid)
      .where('clientId', '==', req.params.id)
      .get();

    const projects = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      deadline: doc.data().deadline?.toDate?.()?.toISOString() || doc.data().deadline,
    }));

    res.json({
      success: true,
      count: projects.length,
      projects,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
