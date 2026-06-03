# FlowCore Backend API

FlowCore Flutter mobil uygulaması için **Node.js + Express + Firebase Admin SDK** tabanlı REST API backend servisi.

Flutter uygulamasındaki tüm repository arayüzleriyle (`AuthRepository`, `ClientRepository`, `ProjectRepository`, `TaskRepository`, `PaymentRepository`, `StorageService`) **birebir uyumlu** endpoint'ler sunar.

---

## 📁 Proje Yapısı

```
flowcore-backend/
├── src/
│   ├── config/
│   │   └── firebase.js          # Firebase Admin SDK başlatıcı
│   ├── middleware/
│   │   ├── authenticate.js      # Firebase ID Token doğrulama
│   │   └── errorHandler.js      # Merkezi hata yönetimi
│   ├── routes/
│   │   ├── auth.routes.js       # /api/auth/* → AuthRepository
│   │   ├── clients.routes.js    # /api/clients/* → ClientRepository
│   │   ├── projects.routes.js   # /api/projects/* → ProjectRepository
│   │   ├── tasks.routes.js      # /api/tasks/* → TaskRepository
│   │   ├── payments.routes.js   # /api/payments/* → PaymentRepository
│   │   └── storage.routes.js    # /api/storage/* → StorageService
│   └── index.js                 # Ana Express sunucusu
├── config/
│   └── serviceAccountKey.json   # ← BURAYA EKLEYİN (git'e ekleme!)
├── tests/
│   └── api.test.js              # Jest entegrasyon testleri
├── .env.example                 # Ortam değişkeni şablonu
├── .gitignore
└── package.json
```

---

## 🚀 Kurulum ve Başlatma

### 1. Bağımlılıkları Yükle
```bash
cd flowcore-backend
npm install
```

### 2. Firebase Service Account Anahtarını Al
1. [Firebase Console](https://console.firebase.google.com/) → Proje Ayarları → Hizmet Hesapları
2. **"Yeni özel anahtar oluştur"** butonuna tıklayın
3. İndirilen JSON dosyasını `config/serviceAccountKey.json` olarak kaydedin

### 3. Ortam Değişkenlerini Yapılandır
```bash
copy .env.example .env
```
`.env` dosyasını açıp düzenleyin:
```env
PORT=3000
NODE_ENV=development
FIREBASE_STORAGE_BUCKET=your-project.appspot.com
```

### 4. Sunucuyu Başlat
```bash
# Geliştirme (hot reload ile)
npm run dev

# Üretim
npm start
```

---

## 📋 API Endpoint'leri

Tüm korumalı endpoint'ler `Authorization: Bearer <Firebase_ID_Token>` başlığı gerektirir.

### 🔐 Auth (`/api/auth`) → `AuthRepository`
| Method | Endpoint | Flutter Karşılığı |
|--------|----------|-------------------|
| `POST` | `/api/auth/register` | `AuthRepository.register()` |
| `POST` | `/api/auth/login` | `AuthRepository.login()` |
| `GET`  | `/api/auth/profile` | `AuthRepository.getUserDetails()` |
| `PUT`  | `/api/auth/profile` | `AuthRepository.updateProfile()` |
| `POST` | `/api/auth/logout` | `AuthRepository.logout()` |
| `POST` | `/api/auth/reset-password` | `AuthRepository.sendPasswordResetEmail()` |

### 👥 Müşteriler (`/api/clients`) → `ClientRepository`
| Method   | Endpoint | Flutter Karşılığı |
|----------|----------|-------------------|
| `GET`    | `/api/clients` | `ClientRepository.getClients()` |
| `GET`    | `/api/clients/:id` | Tek müşteri |
| `POST`   | `/api/clients` | `ClientRepository.addClient()` |
| `PUT`    | `/api/clients/:id` | `ClientRepository.updateClient()` |
| `DELETE` | `/api/clients/:id` | `ClientRepository.deleteClient()` |
| `GET`    | `/api/clients/:id/projects` | `ProjectRepository.getProjectsForClientStream()` |

### 📁 Projeler (`/api/projects`) → `ProjectRepository`
| Method   | Endpoint | Flutter Karşılığı |
|----------|----------|-------------------|
| `GET`    | `/api/projects` | `ProjectRepository.getProjects()` |
| `GET`    | `/api/projects?clientId=x` | `ProjectRepository.getProjectsForClientStream()` |
| `GET`    | `/api/projects/:id` | Tek proje |
| `POST`   | `/api/projects` | `ProjectRepository.addProject()` |
| `PUT`    | `/api/projects/:id` | `ProjectRepository.updateProject()` |
| `DELETE` | `/api/projects/:id` | `ProjectRepository.deleteProject()` |
| `GET`    | `/api/projects/:id/tasks` | `TaskRepository.getTasksForProjectStream()` |
| `GET`    | `/api/projects/:id/payments` | `PaymentRepository.getPaymentsForProjectStream()` |

### ✅ Görevler (`/api/tasks`) → `TaskRepository`
| Method   | Endpoint | Flutter Karşılığı |
|----------|----------|-------------------|
| `GET`    | `/api/tasks` | `TaskRepository.getTasks()` |
| `GET`    | `/api/tasks?projectId=x` | `TaskRepository.getTasksForProjectStream()` |
| `GET`    | `/api/tasks/:id` | Tek görev |
| `POST`   | `/api/tasks` | `TaskRepository.addTask()` |
| `PUT`    | `/api/tasks/:id` | `TaskRepository.updateTask()` |
| `PATCH`  | `/api/tasks/:id/status` | Kanban sürükle-bırak durum güncelleme |
| `DELETE` | `/api/tasks/:id` | `TaskRepository.deleteTask()` |

### 💰 Ödemeler (`/api/payments`) → `PaymentRepository`
| Method   | Endpoint | Flutter Karşılığı |
|----------|----------|-------------------|
| `GET`    | `/api/payments` | `PaymentRepository.getPayments()` |
| `GET`    | `/api/payments?projectId=x` | `PaymentRepository.getPaymentsForProjectStream()` |
| `GET`    | `/api/payments/:id` | Tek ödeme |
| `POST`   | `/api/payments` | `PaymentRepository.addPayment()` |
| `PUT`    | `/api/payments/:id` | `PaymentRepository.updatePayment()` |
| `PATCH`  | `/api/payments/:id/mark-paid` | Hızlı "Ödendi" işareti |
| `DELETE` | `/api/payments/:id` | `PaymentRepository.deletePayment()` |

### 🖼️ Dosya Yükleme (`/api/storage`) → `StorageService`
| Method | Endpoint | Flutter Karşılığı |
|--------|----------|-------------------|
| `POST` | `/api/storage/profile-picture` | `StorageService.uploadProfilePicture()` |

---

## 🔒 Güvenlik

- **Firebase ID Token Doğrulama**: Her korumalı endpoint, istek başlığındaki Firebase token'ı `firebase-admin` ile doğrular
- **Kaynak Sahipliği**: Her kullanıcı yalnızca kendi verilerine erişebilir (`userId` filtresi)
- **Rate Limiting**: Dakikada 100 istek limiti
- **Helmet**: HTTP güvenlik başlıkları
- **Girdi Doğrulama**: `express-validator` ile tüm body field'ları doğrulanır

---

## 🧪 Testleri Çalıştır

```bash
npm test
```

---

## 📱 Flutter Uygulamasından Kullanım

Flutter uygulamasında bu backend'i kullanmak için yeni bir `ApiRepository` implementasyonu ekleyin:

```dart
// Örnek kullanım
final response = await http.get(
  Uri.parse('http://10.0.2.2:3000/api/clients'), // Android emülatör
  headers: {
    'Authorization': 'Bearer $idToken', // Firebase ID Token
    'Content-Type': 'application/json',
  },
);
```

> Android emülatör için `localhost` yerine `10.0.2.2` kullanın.
> iOS simülatörde `localhost` veya `127.0.0.1` kullanabilirsiniz.
