/**
 * FlowCore Backend - API Endpoint Testleri
 *
 * NOT: jest.mock() çağrısı dosyanın üstüne hoisted edilir.
 * Bu nedenle factory dışındaki const/let değişkenler erişilemez olur.
 * Tüm mock nesneler factory'nin İÇİNDE tanımlanmalıdır.
 */

// ── Firebase modülünü mock'la ─────────────────────────────────────────────────
jest.mock('../src/config/firebase', () => {
  // Chainable Firestore sorgu referansı
  function makeRef() {
    const ref = {
      get: jest.fn().mockResolvedValue({ docs: [] }),
      add: jest.fn().mockResolvedValue({ id: 'mock-doc-id' }),
      set: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
    };
    ref.where = jest.fn().mockReturnValue(ref);
    ref.orderBy = jest.fn().mockReturnValue(ref);
    ref.limit = jest.fn().mockReturnValue(ref);
    ref.doc = jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue({
        exists: true,
        id: 'mock-doc-id',
        data: () => ({
          userId: 'test-uid',
          uid: 'test-uid',
          name: 'Test Kullanıcı',
          email: 'test@flowcore.com',
          phone: '05001234567',
          companyName: 'Test A.Ş.',
          notes: '',
          photoUrl: null,
          description: 'Açıklama',
          clientId: 'cid1',
          clientName: 'Müşteri',
          budget: 10000,
          deadline: { toDate: () => new Date('2025-06-01') },
          status: 'Active',
          title: 'Görev',
          priority: 'High',
          dueDate: { toDate: () => new Date('2025-06-01') },
          projectId: 'pid1',
          projectName: 'Proje',
          amount: 5000,
          paymentDate: null,
          createdAt: { toDate: () => new Date('2024-01-01') },
          updatedAt: { toDate: () => new Date('2024-01-01') },
        }),
      }),
      set: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
    });
    return ref;
  }

  return {
    initializeFirebase: jest.fn(),
    getFirestore: jest.fn(() => ({ collection: jest.fn(() => makeRef()) })),
    getAuth: jest.fn(() => ({
      createUser: jest.fn().mockResolvedValue({ uid: 'new-uid-123' }),
      updateUser: jest.fn().mockResolvedValue({}),
      verifyIdToken: jest.fn().mockResolvedValue({ uid: 'test-uid', email: 'test@flowcore.com', name: 'Test' }),
      revokeRefreshTokens: jest.fn().mockResolvedValue({}),
      generatePasswordResetLink: jest.fn().mockResolvedValue('https://reset.example.com'),
    })),
    getStorage: jest.fn(() => ({
      bucket: jest.fn(() => ({
        file: jest.fn(() => ({
          createWriteStream: jest.fn(() => {
            // Node.js built-in stream - require is allowed inside factory
            const { PassThrough } = require('stream');
            const s = new PassThrough();
            setImmediate(() => s.emit('finish'));
            return s;
          }),
          makePublic: jest.fn().mockResolvedValue({}),
        })),
        name: 'test-bucket',
      })),
    })),
    admin: {},
  };
});

// ── authenticate middleware'i bypass et ───────────────────────────────────────
jest.mock('../src/middleware/authenticate', () => ({
  authenticate: jest.fn((req, _res, next) => {
    req.user = { uid: 'test-uid', email: 'test@flowcore.com', name: 'Test' };
    next();
  }),
}));

// ── Test araçları ─────────────────────────────────────────────────────────────
const request = require('supertest');
const app = require('../src/index');
const A = { Authorization: 'Bearer test-token' };

// ═══════════════════════════════════════════════════════════════════════════════
describe('🏥 Sağlık Kontrolü', () => {
  test('GET /health → 200 OK', async () => {
    const r = await request(app).get('/health');
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('OK');
  });

  test('GET /api → endpoint haritası', async () => {
    const r = await request(app).get('/api');
    expect(r.status).toBe(200);
    expect(r.body.endpoints).toBeDefined();
  });

  test('Bilinmeyen route → 404', async () => {
    const r = await request(app).get('/api/bilinmiyor');
    expect(r.status).toBe(404);
    expect(r.body.code).toBe('NOT_FOUND');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('🔐 Auth – Kayıt (POST /api/auth/register)', () => {
  test('Geçerli → 201', async () => {
    const r = await request(app).post('/api/auth/register').send({
      name: 'Ali Veli', email: 'ali@test.com', phone: '050', password: 'test12',
    });
    expect(r.status).toBe(201);
    expect(r.body.user).toHaveProperty('uid');
  });

  test('Geçersiz e-posta → 422', async () => {
    const r = await request(app).post('/api/auth/register').send({
      name: 'Ali', email: 'bozuk', phone: '050', password: 'test12',
    });
    expect(r.status).toBe(422);
  });

  test('Şifre < 6 karakter → 422', async () => {
    const r = await request(app).post('/api/auth/register').send({
      name: 'Ali', email: 'ali@test.com', phone: '050', password: '12',
    });
    expect(r.status).toBe(422);
  });

  test('Ad eksik → 422', async () => {
    const r = await request(app).post('/api/auth/register').send({
      email: 'ali@test.com', phone: '050', password: 'test12',
    });
    expect(r.status).toBe(422);
  });
});

// ───────────────────────────────────────────────────────────────────────────────
describe('🔐 Auth – Profil (GET/PUT /api/auth/profile)', () => {
  test('GET profil → 200', async () => {
    const r = await request(app).get('/api/auth/profile').set(A);
    expect(r.status).toBe(200);
    expect(r.body.user).toHaveProperty('uid');
  });

  test('PUT profil → 200', async () => {
    const r = await request(app).put('/api/auth/profile').set(A)
      .send({ name: 'Yeni', phone: '051' });
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────────────────
describe('🔐 Auth – Çıkış & Şifre Sıfırlama', () => {
  test('POST logout → 200', async () => {
    const r = await request(app).post('/api/auth/logout').set(A);
    expect(r.status).toBe(200);
  });

  test('POST reset-password (e-posta var) → 200', async () => {
    const r = await request(app).post('/api/auth/reset-password').send({ email: 'a@b.com' });
    expect(r.status).toBe(200);
  });

  test('POST reset-password (e-posta yok) → 422', async () => {
    const r = await request(app).post('/api/auth/reset-password').send({});
    expect(r.status).toBe(422);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('👥 Clients – CRUD', () => {
  const c = { name: 'Ahmet', email: 'a@a.com', companyName: 'A.Ş.', phone: '050', notes: '' };

  test('GET liste → 200', async () => {
    const r = await request(app).get('/api/clients').set(A);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.clients)).toBe(true);
  });

  test('POST geçerli → 201', async () => {
    const r = await request(app).post('/api/clients').set(A).send(c);
    expect(r.status).toBe(201);
    expect(r.body.client).toHaveProperty('id');
  });

  test('POST e-posta yok → 422', async () => {
    const r = await request(app).post('/api/clients').set(A).send({ name: 'Ali' });
    expect(r.status).toBe(422);
  });

  test('POST isim yok → 422', async () => {
    const r = await request(app).post('/api/clients').set(A).send({ email: 'a@a.com' });
    expect(r.status).toBe(422);
  });

  test('PUT güncelle → 200', async () => {
    const r = await request(app).put('/api/clients/mock-doc-id').set(A).send(c);
    expect(r.status).toBe(200);
  });

  test('DELETE sil → 200', async () => {
    const r = await request(app).delete('/api/clients/mock-doc-id').set(A);
    expect(r.status).toBe(200);
  });

  test('GET :id/projects → 200', async () => {
    const r = await request(app).get('/api/clients/mock-doc-id/projects').set(A);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.projects)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('📁 Projects – CRUD', () => {
  const p = {
    name: 'Site', description: 'Açık', clientId: 'c1', clientName: 'Müşteri',
    budget: 5000, deadline: new Date(Date.now() + 30 * 86400000).toISOString(), status: 'Active',
  };

  test('GET liste → 200', async () => {
    const r = await request(app).get('/api/projects').set(A);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.projects)).toBe(true);
  });

  test('GET ?status=Active → 200', async () => {
    expect((await request(app).get('/api/projects?status=Active').set(A)).status).toBe(200);
  });

  test('GET ?clientId=c1 → 200', async () => {
    expect((await request(app).get('/api/projects?clientId=c1').set(A)).status).toBe(200);
  });

  test('POST geçerli → 201', async () => {
    const r = await request(app).post('/api/projects').set(A).send(p);
    expect(r.status).toBe(201);
    expect(r.body.project).toHaveProperty('id');
  });

  test('POST geçersiz status → 422', async () => {
    const r = await request(app).post('/api/projects').set(A).send({ ...p, status: 'Yanlış' });
    expect(r.status).toBe(422);
  });

  test('POST bütçe yok → 422', async () => {
    const { budget, ...rest } = p;
    expect((await request(app).post('/api/projects').set(A).send(rest)).status).toBe(422);
  });

  test('POST bozuk tarih → 422', async () => {
    const r = await request(app).post('/api/projects').set(A).send({ ...p, deadline: 'yanlis' });
    expect(r.status).toBe(422);
  });

  test('PUT → 200', async () => {
    const r = await request(app).put('/api/projects/mock-doc-id').set(A).send(p);
    expect(r.status).toBe(200);
  });

  test('DELETE → 200', async () => {
    const r = await request(app).delete('/api/projects/mock-doc-id').set(A);
    expect(r.status).toBe(200);
  });

  test('GET :id/tasks → 200', async () => {
    const r = await request(app).get('/api/projects/mock-doc-id/tasks').set(A);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.tasks)).toBe(true);
  });

  test('GET :id/payments → 200', async () => {
    const r = await request(app).get('/api/projects/mock-doc-id/payments').set(A);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.payments)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('✅ Tasks – CRUD + Kanban', () => {
  const t = {
    title: 'Görev', description: '', priority: 'High', status: 'Todo',
    dueDate: new Date(Date.now() + 7 * 86400000).toISOString(),
    projectId: 'p1', projectName: 'Proje',
  };

  test('GET liste → 200', async () => {
    const r = await request(app).get('/api/tasks').set(A);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.tasks)).toBe(true);
  });

  test('GET ?projectId → 200', async () => {
    expect((await request(app).get('/api/tasks?projectId=p1').set(A)).status).toBe(200);
  });

  test('POST geçerli → 201', async () => {
    const r = await request(app).post('/api/tasks').set(A).send(t);
    expect(r.status).toBe(201);
    expect(r.body.task).toHaveProperty('id');
  });

  test('POST geçersiz öncelik → 422', async () => {
    const r = await request(app).post('/api/tasks').set(A).send({ ...t, priority: 'SuperHigh' });
    expect(r.status).toBe(422);
  });

  test('POST başlık boş → 422', async () => {
    const r = await request(app).post('/api/tasks').set(A).send({ ...t, title: '' });
    expect(r.status).toBe(422);
  });

  test('POST projectId boş → 422', async () => {
    const r = await request(app).post('/api/tasks').set(A).send({ ...t, projectId: '' });
    expect(r.status).toBe(422);
  });

  test("PATCH status ('In Progress') → 200", async () => {
    const r = await request(app).patch('/api/tasks/mock-doc-id/status').set(A)
      .send({ status: 'In Progress' });
    expect(r.status).toBe(200);
  });

  test("PATCH status ('Completed') → 200", async () => {
    const r = await request(app).patch('/api/tasks/mock-doc-id/status').set(A)
      .send({ status: 'Completed' });
    expect(r.status).toBe(200);
  });

  test('PATCH status geçersiz → 422', async () => {
    const r = await request(app).patch('/api/tasks/mock-doc-id/status').set(A)
      .send({ status: 'YanlisDurum' });
    expect(r.status).toBe(422);
  });

  test('DELETE → 200', async () => {
    const r = await request(app).delete('/api/tasks/mock-doc-id').set(A);
    expect(r.status).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('💰 Payments – CRUD + mark-paid', () => {
  const py = {
    clientId: 'c1', clientName: 'Müş', projectId: 'p1', projectName: 'Pro',
    amount: 5000, dueDate: new Date(Date.now() + 14 * 86400000).toISOString(), status: 'Pending',
  };

  test('GET liste → 200, summary var', async () => {
    const r = await request(app).get('/api/payments').set(A);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.payments)).toBe(true);
    expect(r.body.summary).toHaveProperty('totalAmount');
    expect(r.body.summary).toHaveProperty('paidAmount');
    expect(r.body.summary).toHaveProperty('pendingAmount');
  });

  test('GET ?status=Pending → 200', async () => {
    expect((await request(app).get('/api/payments?status=Pending').set(A)).status).toBe(200);
  });

  test('POST geçerli → 201', async () => {
    const r = await request(app).post('/api/payments').set(A).send(py);
    expect(r.status).toBe(201);
    expect(r.body.payment).toHaveProperty('id');
  });

  test('POST amount=0 → 422', async () => {
    const r = await request(app).post('/api/payments').set(A).send({ ...py, amount: 0 });
    expect(r.status).toBe(422);
  });

  test('POST geçersiz status → 422', async () => {
    const r = await request(app).post('/api/payments').set(A).send({ ...py, status: 'Bekliyor' });
    expect(r.status).toBe(422);
  });

  test('POST bozuk tarih → 422', async () => {
    const r = await request(app).post('/api/payments').set(A).send({ ...py, dueDate: 'yanlis' });
    expect(r.status).toBe(422);
  });

  test('PATCH mark-paid → 200', async () => {
    const r = await request(app).patch('/api/payments/mock-doc-id/mark-paid').set(A).send({});
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
  });

  test('PATCH mark-paid (tarihle) → 200', async () => {
    const r = await request(app).patch('/api/payments/mock-doc-id/mark-paid').set(A)
      .send({ paymentDate: new Date().toISOString() });
    expect(r.status).toBe(200);
  });

  test('DELETE → 200', async () => {
    const r = await request(app).delete('/api/payments/mock-doc-id').set(A);
    expect(r.status).toBe(200);
  });
});
