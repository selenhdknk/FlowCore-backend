/**
 * FlowCore Backend - Görev (Task) Router
 * 
 * Flutter TaskRepository arayüzüyle birebir eşleşen endpoint'ler:
 * 
 * GET    /api/tasks              → TaskRepository.getTasks()
 * POST   /api/tasks              → TaskRepository.addTask()
 * PUT    /api/tasks/:id          → TaskRepository.updateTask()
 * DELETE /api/tasks/:id          → TaskRepository.deleteTask()
 * GET    /api/tasks/:id          → Tek görev detayı
 * PATCH  /api/tasks/:id/status   → Görev durumu hızlı güncelleme (Kanban sürükle-bırak)
 * 
 * Görev durumları: 'Todo' | 'In Progress' | 'Completed'
 * Görev öncelikleri: 'Low' | 'Medium' | 'High'
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const { getFirestore } = require('../config/firebase');
const { authenticate } = require('../middleware/authenticate');

const router = express.Router();
const COLLECTION = 'tasks';
const VALID_STATUSES = ['Todo', 'In Progress', 'Completed'];
const VALID_PRIORITIES = ['Low', 'Medium', 'High'];

// ── Doğrulama Kuralları ───────────────────────────────────────────────────────

const taskValidation = [
  body('title')
    .trim()
    .notEmpty().withMessage('Görev başlığı boş bırakılamaz.')
    .isLength({ max: 200 }).withMessage('Görev başlığı 200 karakterden uzun olamaz.'),
  body('description')
    .trim()
    .optional()
    .isLength({ max: 2000 }),
  body('priority')
    .isIn(VALID_PRIORITIES)
    .withMessage(`Öncelik şunlardan biri olmalıdır: ${VALID_PRIORITIES.join(', ')}`),
  body('status')
    .isIn(VALID_STATUSES)
    .withMessage(`Durum şunlardan biri olmalıdır: ${VALID_STATUSES.join(', ')}`),
  body('dueDate')
    .isISO8601().withMessage('Bitiş tarihi geçerli bir tarih formatında olmalıdır.'),
  body('projectId')
    .trim()
    .notEmpty().withMessage('Proje seçimi zorunludur.'),
  body('projectName')
    .trim()
    .notEmpty().withMessage('Proje adı zorunludur.'),
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

function formatTask(doc) {
  const data = doc.data ? doc.data() : doc;
  return {
    id: doc.id || data.id,
    title: data.title,
    description: data.description || '',
    priority: data.priority || 'Medium',
    status: data.status || 'Todo',
    dueDate: data.dueDate?.toDate?.()?.toISOString() || data.dueDate,
    projectId: data.projectId,
    projectName: data.projectName,
    userId: data.userId,
    createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
  };
}

// ── Tüm route'larda kimlik doğrulaması zorunlu ────────────────────────────────
router.use(authenticate);

// ── Endpoint'ler ──────────────────────────────────────────────────────────────

/**
 * GET /api/tasks
 * Flutter: TaskRepository.getTasks()
 * 
 * Sorgu parametreleri:
 *   ?status=Todo       → duruma göre filtre
 *   ?priority=High     → önceliğe göre filtre
 *   ?projectId=xxx     → projeye göre filtre (TaskRepository.getTasksForProjectStream)
 *   ?search=ödeme      → başlıkta arama
 * 
 * Returns: { success, count, tasks: [...] }
 */
router.get('/', async (req, res, next) => {
  try {
    const { status, priority, projectId, search, limit = 200 } = req.query;
    const db = getFirestore();

    let queryRef = db.collection(COLLECTION)
      .where('userId', '==', req.user.uid)
      .limit(parseInt(limit));

    if (status && VALID_STATUSES.includes(status)) {
      queryRef = queryRef.where('status', '==', status);
    }

    if (priority && VALID_PRIORITIES.includes(priority)) {
      queryRef = queryRef.where('priority', '==', priority);
    }

    if (projectId) {
      queryRef = queryRef.where('projectId', '==', projectId);
    }

    const snapshot = await queryRef.get();
    let tasks = snapshot.docs.map(formatTask);

    if (search) {
      const q = search.toLowerCase();
      tasks = tasks.filter(t =>
        t.title?.toLowerCase().includes(q) ||
        t.description?.toLowerCase().includes(q) ||
        t.projectName?.toLowerCase().includes(q)
      );
    }

    res.json({
      success: true,
      count: tasks.length,
      tasks,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/tasks/:id
 * Tek görev detayı
 */
router.get('/:id', async (req, res, next) => {
  try {
    const doc = await getFirestore().collection(COLLECTION).doc(req.params.id).get();

    if (!doc.exists) {
      return res.status(404).json({ success: false, message: 'Görev bulunamadı.', code: 'NOT_FOUND' });
    }
    if (doc.data().userId !== req.user.uid) {
      return res.status(403).json({ success: false, message: 'Bu kaynağa erişim yetkiniz yok.', code: 'FORBIDDEN' });
    }

    res.json({ success: true, task: formatTask(doc) });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/tasks
 * Flutter: TaskRepository.addTask(TaskModel task)
 * 
 * Body: { title, description, priority, status, dueDate, projectId, projectName }
 * Returns: { success, task }
 */
router.post('/', taskValidation, async (req, res, next) => {
  try {
    const validationError = handleValidationErrors(req, res);
    if (validationError) return;

    const { title, description = '', priority, status, dueDate, projectId, projectName } = req.body;

    const taskData = {
      title,
      description,
      priority,
      status,
      dueDate: new Date(dueDate),
      projectId,
      projectName,
      userId: req.user.uid,
      createdAt: new Date(),
    };

    const docRef = await getFirestore().collection(COLLECTION).add(taskData);

    console.log(`✅ Yeni görev eklendi: ${docRef.id}`);

    res.status(201).json({
      success: true,
      message: 'Görev başarıyla eklendi.',
      task: {
        id: docRef.id,
        ...taskData,
        dueDate: taskData.dueDate.toISOString(),
        createdAt: taskData.createdAt.toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/tasks/:id
 * Flutter: TaskRepository.updateTask(TaskModel task)
 */
router.put('/:id', taskValidation, async (req, res, next) => {
  try {
    const validationError = handleValidationErrors(req, res);
    if (validationError) return;

    const db = getFirestore();
    const docRef = db.collection(COLLECTION).doc(req.params.id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ success: false, message: 'Görev bulunamadı.', code: 'NOT_FOUND' });
    }
    if (doc.data().userId !== req.user.uid) {
      return res.status(403).json({ success: false, message: 'Bu kaynağı güncelleme yetkiniz yok.', code: 'FORBIDDEN' });
    }

    const { title, description, priority, status, dueDate, projectId, projectName } = req.body;
    const updateData = { updatedAt: new Date() };
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (priority !== undefined) updateData.priority = priority;
    if (status !== undefined) updateData.status = status;
    if (dueDate !== undefined) updateData.dueDate = new Date(dueDate);
    if (projectId !== undefined) updateData.projectId = projectId;
    if (projectName !== undefined) updateData.projectName = projectName;

    await docRef.update(updateData);
    const updatedDoc = await docRef.get();

    res.json({ success: true, message: 'Görev güncellendi.', task: formatTask(updatedDoc) });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/tasks/:id/status
 * Kanban board sürükle-bırak: sadece durumu günceller
 * 
 * Body: { status: 'Todo' | 'In Progress' | 'Completed' }
 * Returns: { success, task }
 */
router.patch('/:id/status', [
  body('status')
    .isIn(VALID_STATUSES)
    .withMessage(`Durum şunlardan biri olmalıdır: ${VALID_STATUSES.join(', ')}`),
], async (req, res, next) => {
  try {
    const validationError = handleValidationErrors(req, res);
    if (validationError) return;

    const db = getFirestore();
    const docRef = db.collection(COLLECTION).doc(req.params.id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ success: false, message: 'Görev bulunamadı.', code: 'NOT_FOUND' });
    }
    if (doc.data().userId !== req.user.uid) {
      return res.status(403).json({ success: false, message: 'Bu kaynağı güncelleme yetkiniz yok.', code: 'FORBIDDEN' });
    }

    await docRef.update({ status: req.body.status, updatedAt: new Date() });
    const updatedDoc = await docRef.get();

    res.json({ success: true, message: 'Görev durumu güncellendi.', task: formatTask(updatedDoc) });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/tasks/:id
 * Flutter: TaskRepository.deleteTask(String id)
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const db = getFirestore();
    const docRef = db.collection(COLLECTION).doc(req.params.id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ success: false, message: 'Görev bulunamadı.', code: 'NOT_FOUND' });
    }
    if (doc.data().userId !== req.user.uid) {
      return res.status(403).json({ success: false, message: 'Bu kaynağı silme yetkiniz yok.', code: 'FORBIDDEN' });
    }

    await docRef.delete();
    console.log(`🗑️ Görev silindi: ${req.params.id}`);

    res.json({ success: true, message: 'Görev başarıyla silindi.' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
