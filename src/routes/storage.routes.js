/**
 * FlowCore Backend - Dosya Yükleme (Storage) Router
 * 
 * Flutter StorageService arayüzüyle uyumlu endpoint:
 * 
 * POST /api/storage/profile-picture → StorageService.uploadProfilePicture(userId, file)
 * 
 * Profil fotoğrafı Firebase Storage'a yüklenir ve download URL döndürülür.
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const { getStorage, getFirestore } = require('../config/firebase');
const { authenticate } = require('../middleware/authenticate');

const router = express.Router();

// ── Multer Ayarları (Bellekte tut, doğrudan Storage'a aktar) ─────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB maksimum
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Yalnızca JPEG, PNG veya WebP formatında resim yüklenebilir.'));
    }
  },
});

// ── Tüm route'larda kimlik doğrulaması zorunlu ────────────────────────────────
router.use(authenticate);

// ── Endpoint'ler ──────────────────────────────────────────────────────────────

/**
 * POST /api/storage/profile-picture
 * Flutter: StorageService.uploadProfilePicture(String userId, File file)
 * 
 * Form Data: file (image/jpeg | image/png | image/webp)
 * Returns: { success, photoUrl }
 */
router.post('/profile-picture', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(422).json({
        success: false,
        message: 'Dosya yüklenmedi. "file" alanına resim ekleyin.',
        code: 'MISSING_FILE',
      });
    }

    const uid = req.user.uid;
    const ext = req.file.mimetype === 'image/png' ? 'png' : 
                req.file.mimetype === 'image/webp' ? 'webp' : 'jpg';
    const filePath = `profile_pictures/${uid}.${ext}`;

    // Firebase Storage bucket referansı
    const bucket = getStorage().bucket();
    const fileRef = bucket.file(filePath);

    // Dosyayı Stream olarak yükle
    await new Promise((resolve, reject) => {
      const stream = fileRef.createWriteStream({
        metadata: {
          contentType: req.file.mimetype,
        },
        resumable: false,
      });

      stream.on('error', reject);
      stream.on('finish', resolve);
      stream.end(req.file.buffer);
    });

    // Herkese açık erişim ver
    await fileRef.makePublic();

    // Download URL oluştur
    const photoUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;

    // Firestore'daki kullanıcı profilini güncelle
    await getFirestore()
      .collection('users')
      .doc(uid)
      .update({ photoUrl, updatedAt: new Date() });

    console.log(`✅ Profil resmi yüklendi: ${uid}`);

    res.json({
      success: true,
      message: 'Profil resmi başarıyla yüklendi.',
      photoUrl,
    });
  } catch (error) {
    if (error.message.includes('Only')) {
      return res.status(422).json({
        success: false,
        message: error.message,
        code: 'INVALID_FILE_TYPE',
      });
    }
    next(error);
  }
});

module.exports = router;
