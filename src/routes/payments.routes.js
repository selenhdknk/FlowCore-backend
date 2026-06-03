/**
 * FlowCore Backend - Ödeme (Payment) Router
 * 
 * Flutter PaymentRepository arayüzüyle birebir eşleşen endpoint'ler:
 * 
 * GET    /api/payments        → PaymentRepository.getPayments()
 * POST   /api/payments        → PaymentRepository.addPayment()
 * PUT    /api/payments/:id    → PaymentRepository.updatePayment()
 * DELETE /api/payments/:id    → PaymentRepository.deletePayment()
 * GET    /api/payments/:id    → Tek ödeme detayı
 * PATCH  /api/payments/:id/mark-paid → Hızlı ödendi işareti
 * 
 * Ödeme durumları: 'Paid' | 'Pending' | 'Overdue'
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const { getFirestore } = require('../config/firebase');
const { authenticate } = require('../middleware/authenticate');

const router = express.Router();
const COLLECTION = 'payments';
const VALID_STATUSES = ['Paid', 'Pending', 'Overdue'];

// ── Doğrulama Kuralları ───────────────────────────────────────────────────────

const paymentValidation = [
  body('clientId')
    .trim()
    .notEmpty().withMessage('Müşteri seçimi zorunludur.'),
  body('clientName')
    .trim()
    .notEmpty().withMessage('Müşteri adı zorunludur.'),
  body('projectId')
    .trim()
    .notEmpty().withMessage('Proje seçimi zorunludur.'),
  body('projectName')
    .trim()
    .notEmpty().withMessage('Proje adı zorunludur.'),
  body('amount')
    .isFloat({ min: 0.01 }).withMessage('Tutar 0\'dan büyük olmalıdır.'),
  body('dueDate')
    .isISO8601().withMessage('Vade tarihi geçerli bir tarih formatında olmalıdır.'),
  body('status')
    .isIn(VALID_STATUSES)
    .withMessage(`Durum şunlardan biri olmalıdır: ${VALID_STATUSES.join(', ')}`),
  body('paymentDate')
    .optional({ nullable: true })
    .isISO8601().withMessage('Ödeme tarihi geçerli bir tarih formatında olmalıdır.'),
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

function formatPayment(doc) {
  const data = doc.data ? doc.data() : doc;
  return {
    id: doc.id || data.id,
    clientId: data.clientId,
    clientName: data.clientName,
    projectId: data.projectId,
    projectName: data.projectName,
    amount: data.amount || 0,
    dueDate: data.dueDate?.toDate?.()?.toISOString() || data.dueDate,
    paymentDate: data.paymentDate?.toDate?.()?.toISOString() || null,
    status: data.status || 'Pending',
    userId: data.userId,
    createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
  };
}

// ── Tüm route'larda kimlik doğrulaması zorunlu ────────────────────────────────
router.use(authenticate);

// ── Endpoint'ler ──────────────────────────────────────────────────────────────

/**
 * GET /api/payments
 * Flutter: PaymentRepository.getPayments()
 * 
 * Sorgu parametreleri:
 *   ?status=Pending    → duruma göre filtre
 *   ?clientId=xxx      → müşteriye göre filtre
 *   ?projectId=xxx     → projeye göre filtre (PaymentRepository.getPaymentsForProjectStream)
 *   ?search=ahmet      → müşteri/proje adında arama
 * 
 * Returns: { success, count, payments: [...] }
 */
router.get('/', async (req, res, next) => {
  try {
    const { status, clientId, projectId, search, limit = 200 } = req.query;
    const db = getFirestore();

    let queryRef = db.collection(COLLECTION)
      .where('userId', '==', req.user.uid)
      .orderBy('dueDate', 'asc')
      .limit(parseInt(limit));

    if (status && VALID_STATUSES.includes(status)) {
      queryRef = queryRef.where('status', '==', status);
    }

    if (clientId) {
      queryRef = queryRef.where('clientId', '==', clientId);
    }

    if (projectId) {
      queryRef = queryRef.where('projectId', '==', projectId);
    }

    const snapshot = await queryRef.get();
    let payments = snapshot.docs.map(formatPayment);

    if (search) {
      const q = search.toLowerCase();
      payments = payments.filter(p =>
        p.clientName?.toLowerCase().includes(q) ||
        p.projectName?.toLowerCase().includes(q)
      );
    }

    // Toplamlar (özet bilgi)
    const totalAmount = payments.reduce((sum, p) => sum + p.amount, 0);
    const paidAmount = payments
      .filter(p => p.status === 'Paid')
      .reduce((sum, p) => sum + p.amount, 0);
    const pendingAmount = payments
      .filter(p => p.status === 'Pending' || p.status === 'Overdue')
      .reduce((sum, p) => sum + p.amount, 0);

    res.json({
      success: true,
      count: payments.length,
      summary: {
        totalAmount,
        paidAmount,
        pendingAmount,
      },
      payments,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/payments/:id
 * Tek ödeme detayı
 */
router.get('/:id', async (req, res, next) => {
  try {
    const doc = await getFirestore().collection(COLLECTION).doc(req.params.id).get();

    if (!doc.exists) {
      return res.status(404).json({ success: false, message: 'Ödeme bulunamadı.', code: 'NOT_FOUND' });
    }
    if (doc.data().userId !== req.user.uid) {
      return res.status(403).json({ success: false, message: 'Bu kaynağa erişim yetkiniz yok.', code: 'FORBIDDEN' });
    }

    res.json({ success: true, payment: formatPayment(doc) });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/payments
 * Flutter: PaymentRepository.addPayment(PaymentModel payment)
 * 
 * Body: { clientId, clientName, projectId, projectName, amount, dueDate, paymentDate?, status }
 * Returns: { success, payment }
 */
router.post('/', paymentValidation, async (req, res, next) => {
  try {
    const validationError = handleValidationErrors(req, res);
    if (validationError) return;

    const { clientId, clientName, projectId, projectName, amount, dueDate, paymentDate, status } = req.body;

    const paymentData = {
      clientId,
      clientName,
      projectId,
      projectName,
      amount: parseFloat(amount),
      dueDate: new Date(dueDate),
      paymentDate: paymentDate ? new Date(paymentDate) : null,
      status,
      userId: req.user.uid,
      createdAt: new Date(),
    };

    const docRef = await getFirestore().collection(COLLECTION).add(paymentData);

    console.log(`✅ Yeni ödeme eklendi: ${docRef.id} (${amount} TL)`);

    res.status(201).json({
      success: true,
      message: 'Ödeme başarıyla eklendi.',
      payment: {
        id: docRef.id,
        ...paymentData,
        dueDate: paymentData.dueDate.toISOString(),
        paymentDate: paymentData.paymentDate?.toISOString() || null,
        createdAt: paymentData.createdAt.toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/payments/:id
 * Flutter: PaymentRepository.updatePayment(PaymentModel payment)
 */
router.put('/:id', paymentValidation, async (req, res, next) => {
  try {
    const validationError = handleValidationErrors(req, res);
    if (validationError) return;

    const db = getFirestore();
    const docRef = db.collection(COLLECTION).doc(req.params.id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ success: false, message: 'Ödeme bulunamadı.', code: 'NOT_FOUND' });
    }
    if (doc.data().userId !== req.user.uid) {
      return res.status(403).json({ success: false, message: 'Bu kaynağı güncelleme yetkiniz yok.', code: 'FORBIDDEN' });
    }

    const { clientId, clientName, projectId, projectName, amount, dueDate, paymentDate, status } = req.body;
    const updateData = { updatedAt: new Date() };
    if (clientId !== undefined) updateData.clientId = clientId;
    if (clientName !== undefined) updateData.clientName = clientName;
    if (projectId !== undefined) updateData.projectId = projectId;
    if (projectName !== undefined) updateData.projectName = projectName;
    if (amount !== undefined) updateData.amount = parseFloat(amount);
    if (dueDate !== undefined) updateData.dueDate = new Date(dueDate);
    if (paymentDate !== undefined) updateData.paymentDate = paymentDate ? new Date(paymentDate) : null;
    if (status !== undefined) updateData.status = status;

    await docRef.update(updateData);
    const updatedDoc = await docRef.get();

    res.json({ success: true, message: 'Ödeme güncellendi.', payment: formatPayment(updatedDoc) });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/payments/:id/mark-paid
 * Bir ödemeyi hızlıca "Ödendi" olarak işaretle.
 * 
 * Body: { paymentDate? } (verilmezse bugünün tarihi kullanılır)
 * Returns: { success, payment }
 */
router.patch('/:id/mark-paid', async (req, res, next) => {
  try {
    const db = getFirestore();
    const docRef = db.collection(COLLECTION).doc(req.params.id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ success: false, message: 'Ödeme bulunamadı.', code: 'NOT_FOUND' });
    }
    if (doc.data().userId !== req.user.uid) {
      return res.status(403).json({ success: false, message: 'Bu kaynağı güncelleme yetkiniz yok.', code: 'FORBIDDEN' });
    }

    const paymentDate = req.body.paymentDate ? new Date(req.body.paymentDate) : new Date();

    await docRef.update({
      status: 'Paid',
      paymentDate,
      updatedAt: new Date(),
    });

    const updatedDoc = await docRef.get();

    res.json({ success: true, message: 'Ödeme tamamlandı olarak işaretlendi.', payment: formatPayment(updatedDoc) });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/payments/:id
 * Flutter: PaymentRepository.deletePayment(String id)
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const db = getFirestore();
    const docRef = db.collection(COLLECTION).doc(req.params.id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ success: false, message: 'Ödeme bulunamadı.', code: 'NOT_FOUND' });
    }
    if (doc.data().userId !== req.user.uid) {
      return res.status(403).json({ success: false, message: 'Bu kaynağı silme yetkiniz yok.', code: 'FORBIDDEN' });
    }

    await docRef.delete();
    console.log(`🗑️ Ödeme silindi: ${req.params.id}`);

    res.json({ success: true, message: 'Ödeme başarıyla silindi.' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
