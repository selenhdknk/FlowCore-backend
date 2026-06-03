/**
 * FlowCore Backend - Proje Router
 * 
 * Flutter ProjectRepository arayüzüyle birebir eşleşen endpoint'ler:
 * 
 * GET    /api/projects              → ProjectRepository.getProjects()
 * POST   /api/projects              → ProjectRepository.addProject()
 * PUT    /api/projects/:id          → ProjectRepository.updateProject()
 * DELETE /api/projects/:id          → ProjectRepository.deleteProject()
 * GET    /api/projects/:id          → Tek proje detayı
 * GET    /api/projects/:id/tasks    → Projeye ait görevler
 * GET    /api/projects/:id/payments → Projeye ait ödemeler
 * 
 * Proje durumları: 'Active' | 'Pending' | 'Completed'
 */

const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { getFirestore } = require('../config/firebase');
const { authenticate } = require('../middleware/authenticate');

const router = express.Router();
const COLLECTION = 'projects';
const VALID_STATUSES = ['Active', 'Pending', 'Completed'];

// ── Doğrulama Kuralları ───────────────────────────────────────────────────────

const projectValidation = [
  body('name')
    .trim()
    .notEmpty().withMessage('Proje adı boş bırakılamaz.')
    .isLength({ max: 200 }).withMessage('Proje adı 200 karakterden uzun olamaz.'),
  body('description')
    .trim()
    .optional()
    .isLength({ max: 2000 }).withMessage('Açıklama 2000 karakterden uzun olamaz.'),
  body('clientId')
    .trim()
    .notEmpty().withMessage('Müşteri seçimi zorunludur.'),
  body('clientName')
    .trim()
    .notEmpty().withMessage('Müşteri adı zorunludur.'),
  body('budget')
    .isFloat({ min: 0 }).withMessage('Bütçe geçerli bir sayı olmalıdır.'),
  body('deadline')
    .isISO8601().withMessage('Teslim tarihi geçerli bir tarih formatında olmalıdır.'),
  body('status')
    .isIn(VALID_STATUSES)
    .withMessage(`Durum şunlardan biri olmalıdır: ${VALID_STATUSES.join(', ')}`),
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

function formatProject(doc) {
  const data = doc.data ? doc.data() : doc;
  return {
    id: doc.id || data.id,
    name: data.name,
    description: data.description || '',
    clientId: data.clientId,
    clientName: data.clientName,
    budget: data.budget || 0,
    deadline: data.deadline?.toDate?.()?.toISOString() || data.deadline,
    status: data.status || 'Pending',
    userId: data.userId,
    createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
  };
}

// ── Tüm route'larda kimlik doğrulaması zorunlu ────────────────────────────────
router.use(authenticate);

// ── Endpoint'ler ──────────────────────────────────────────────────────────────

/**
 * GET /api/projects
 * Flutter: ProjectRepository.getProjects()
 * 
 * Sorgu parametreleri:
 *   ?status=Active    → duruma göre filtre ('Active', 'Pending', 'Completed')
 *   ?clientId=xxx     → müşteriye göre filtre (ProjectRepository.getProjectsForClientStream)
 *   ?search=web       → proje adında arama
 * 
 * Returns: { success, count, projects: [...] }
 */
router.get('/', async (req, res, next) => {
  try {
    const { status, clientId, search, limit = 100 } = req.query;
    const db = getFirestore();

    let queryRef = db.collection(COLLECTION)
      .where('userId', '==', req.user.uid)
      .limit(parseInt(limit));

    if (status && VALID_STATUSES.includes(status)) {
      queryRef = queryRef.where('status', '==', status);
    }

    if (clientId) {
      queryRef = queryRef.where('clientId', '==', clientId);
    }

    const snapshot = await queryRef.get();
    let projects = snapshot.docs.map(formatProject);

    // İsim araması
    if (search) {
      const q = search.toLowerCase();
      projects = projects.filter(p =>
        p.name?.toLowerCase().includes(q) ||
        p.clientName?.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q)
      );
    }

    res.json({
      success: true,
      count: projects.length,
      projects,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/projects/:id
 * Tek proje detayı
 */
router.get('/:id', async (req, res, next) => {
  try {
    const doc = await getFirestore()
      .collection(COLLECTION)
      .doc(req.params.id)
      .get();

    if (!doc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Proje bulunamadı.',
        code: 'NOT_FOUND',
      });
    }

    if (doc.data().userId !== req.user.uid) {
      return res.status(403).json({
        success: false,
        message: 'Bu kaynağa erişim yetkiniz yok.',
        code: 'FORBIDDEN',
      });
    }

    res.json({
      success: true,
      project: formatProject(doc),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/projects
 * Flutter: ProjectRepository.addProject(ProjectModel project)
 * 
 * Body: { name, description, clientId, clientName, budget, deadline, status }
 * Returns: { success, project }
 */
router.post('/', projectValidation, async (req, res, next) => {
  try {
    const validationError = handleValidationErrors(req, res);
    if (validationError) return;

    const { name, description = '', clientId, clientName, budget, deadline, status } = req.body;

    const projectData = {
      name,
      description,
      clientId,
      clientName,
      budget: parseFloat(budget),
      deadline: new Date(deadline),
      status,
      userId: req.user.uid,
      createdAt: new Date(),
    };

    const docRef = await getFirestore().collection(COLLECTION).add(projectData);

    console.log(`✅ Yeni proje eklendi: ${docRef.id}`);

    res.status(201).json({
      success: true,
      message: 'Proje başarıyla eklendi.',
      project: {
        id: docRef.id,
        ...projectData,
        deadline: projectData.deadline.toISOString(),
        createdAt: projectData.createdAt.toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/projects/:id
 * Flutter: ProjectRepository.updateProject(ProjectModel project)
 */
router.put('/:id', projectValidation, async (req, res, next) => {
  try {
    const validationError = handleValidationErrors(req, res);
    if (validationError) return;

    const db = getFirestore();
    const docRef = db.collection(COLLECTION).doc(req.params.id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ success: false, message: 'Proje bulunamadı.', code: 'NOT_FOUND' });
    }

    if (doc.data().userId !== req.user.uid) {
      return res.status(403).json({ success: false, message: 'Bu kaynağı güncelleme yetkiniz yok.', code: 'FORBIDDEN' });
    }

    const { name, description, clientId, clientName, budget, deadline, status } = req.body;
    const updateData = { updatedAt: new Date() };
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (clientId !== undefined) updateData.clientId = clientId;
    if (clientName !== undefined) updateData.clientName = clientName;
    if (budget !== undefined) updateData.budget = parseFloat(budget);
    if (deadline !== undefined) updateData.deadline = new Date(deadline);
    if (status !== undefined) updateData.status = status;

    await docRef.update(updateData);
    const updatedDoc = await docRef.get();

    res.json({
      success: true,
      message: 'Proje güncellendi.',
      project: formatProject(updatedDoc),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/projects/:id
 * Flutter: ProjectRepository.deleteProject(String id)
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const db = getFirestore();
    const docRef = db.collection(COLLECTION).doc(req.params.id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ success: false, message: 'Proje bulunamadı.', code: 'NOT_FOUND' });
    }

    if (doc.data().userId !== req.user.uid) {
      return res.status(403).json({ success: false, message: 'Bu kaynağı silme yetkiniz yok.', code: 'FORBIDDEN' });
    }

    await docRef.delete();

    console.log(`🗑️ Proje silindi: ${req.params.id}`);

    res.json({ success: true, message: 'Proje başarıyla silindi.' });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/projects/:id/tasks
 * Flutter: TaskRepository.getTasksForProjectStream(String projectId)
 * 
 * Projeye ait tüm görevleri döndürür.
 */
router.get('/:id/tasks', async (req, res, next) => {
  try {
    const db = getFirestore();

    // Projenin bu kullanıcıya ait olduğunu doğrula
    const projectDoc = await db.collection(COLLECTION).doc(req.params.id).get();
    if (!projectDoc.exists || projectDoc.data().userId !== req.user.uid) {
      return res.status(404).json({ success: false, message: 'Proje bulunamadı.', code: 'NOT_FOUND' });
    }

    const snapshot = await db.collection('tasks')
      .where('userId', '==', req.user.uid)
      .where('projectId', '==', req.params.id)
      .get();

    const tasks = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      dueDate: doc.data().dueDate?.toDate?.()?.toISOString() || doc.data().dueDate,
    }));

    res.json({ success: true, count: tasks.length, tasks });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/projects/:id/payments
 * Flutter: PaymentRepository.getPaymentsForProjectStream(String projectId)
 * 
 * Projeye ait tüm ödemeleri döndürür.
 */
router.get('/:id/payments', async (req, res, next) => {
  try {
    const db = getFirestore();

    const projectDoc = await db.collection(COLLECTION).doc(req.params.id).get();
    if (!projectDoc.exists || projectDoc.data().userId !== req.user.uid) {
      return res.status(404).json({ success: false, message: 'Proje bulunamadı.', code: 'NOT_FOUND' });
    }

    const snapshot = await db.collection('payments')
      .where('userId', '==', req.user.uid)
      .where('projectId', '==', req.params.id)
      .orderBy('dueDate', 'asc')
      .get();

    const payments = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      dueDate: doc.data().dueDate?.toDate?.()?.toISOString() || doc.data().dueDate,
      paymentDate: doc.data().paymentDate?.toDate?.()?.toISOString() || null,
    }));

    res.json({ success: true, count: payments.length, payments });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
