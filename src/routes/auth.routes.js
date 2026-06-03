/**
 * FlowCore Backend - Kimlik Doğrulama Router
 * 
 * Flutter AuthRepository arayüzüyle birebir eşleşen endpoint'ler:
 * 
 * POST /api/auth/register   → AuthRepository.register()
 * POST /api/auth/login      → AuthRepository.login()
 * GET  /api/auth/profile    → AuthRepository.getUserDetails()
 * PUT  /api/auth/profile    → AuthRepository.updateProfile()
 * POST /api/auth/logout     → AuthRepository.logout()
 * POST /api/auth/reset-password → AuthRepository.sendPasswordResetEmail()
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const { getAuth, getFirestore } = require('../config/firebase');
const { authenticate } = require('../middleware/authenticate');

const router = express.Router();

// ── Doğrulama Kuralları ───────────────────────────────────────────────────────

const registerValidation = [
  body('name')
    .trim()
    .notEmpty().withMessage('Ad soyad boş bırakılamaz.')
    .isLength({ min: 2, max: 100 }).withMessage('Ad soyad 2-100 karakter arasında olmalıdır.'),
  body('email')
    .trim()
    .isEmail().withMessage('Geçerli bir e-posta adresi giriniz.')
    .normalizeEmail(),
  body('phone')
    .trim()
    .notEmpty().withMessage('Telefon numarası boş bırakılamaz.'),
  body('password')
    .isLength({ min: 6 }).withMessage('Şifre en az 6 karakter olmalıdır.'),
];

const loginValidation = [
  body('email')
    .trim()
    .isEmail().withMessage('Geçerli bir e-posta adresi giriniz.')
    .normalizeEmail(),
  body('password')
    .notEmpty().withMessage('Şifre boş bırakılamaz.'),
];

const profileUpdateValidation = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 }).withMessage('Ad soyad 2-100 karakter arasında olmalıdır.'),
  body('phone')
    .optional()
    .trim(),
];

// ── Yardımcı fonksiyonlar ─────────────────────────────────────────────────────

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

// ── Endpoint'ler ──────────────────────────────────────────────────────────────

/**
 * POST /api/auth/register
 * Flutter: AuthRepository.register(name, email, phone, password)
 * 
 * Body: { name, email, phone, password }
 * Returns: { success, user: { uid, name, email, phone } }
 */
router.post('/register', registerValidation, async (req, res, next) => {
  try {
    const validationError = handleValidationErrors(req, res);
    if (validationError) return;

    const { name, email, phone, password } = req.body;

    // Firebase Auth'da kullanıcı oluştur
    const userRecord = await getAuth().createUser({
      email: email.trim(),
      password,
      displayName: name,
    });

    // Firestore'da kullanıcı profili kaydet
    const userData = {
      uid: userRecord.uid,
      name,
      email: email.trim(),
      phone,
      photoUrl: null,
      createdAt: new Date().toISOString(),
    };

    await getFirestore()
      .collection('users')
      .doc(userRecord.uid)
      .set(userData);

    console.log(`✅ Yeni kullanıcı kaydedildi: ${userRecord.uid}`);

    res.status(201).json({
      success: true,
      message: 'Kayıt başarılı.',
      user: {
        uid: userRecord.uid,
        name,
        email: email.trim(),
        phone,
        photoUrl: null,
      },
    });
  } catch (error) {
    if (error.code === 'auth/email-already-exists') {
      return res.status(409).json({
        success: false,
        message: 'Bu e-posta adresi zaten kullanımda.',
        code: 'EMAIL_IN_USE',
      });
    }
    if (error.code === 'auth/invalid-email') {
      return res.status(422).json({
        success: false,
        message: 'Geçersiz e-posta adresi.',
        code: 'INVALID_EMAIL',
      });
    }
    if (error.code === 'auth/weak-password') {
      return res.status(422).json({
        success: false,
        message: 'Şifre çok zayıf.',
        code: 'WEAK_PASSWORD',
      });
    }
    next(error);
  }
});

/**
 * POST /api/auth/login
 * Flutter: AuthRepository.login(email, password)
 * 
 * NOT: Firebase Authentication client-side'da yapılır.
 * Bu endpoint backend doğrulama ve kullanıcı profilini döndürür.
 * Client, Firebase ile giriş yapıp aldığı ID Token'ı buraya gönderir.
 * 
 * Body: { idToken }
 * Returns: { success, user: { uid, name, email, phone, photoUrl } }
 */
router.post('/login', async (req, res, next) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(422).json({
        success: false,
        message: 'idToken gereklidir.',
        code: 'MISSING_TOKEN',
      });
    }

    // Token doğrula
    const decoded = await getAuth().verifyIdToken(idToken);

    // Firestore'dan kullanıcı profili al
    const userDoc = await getFirestore()
      .collection('users')
      .doc(decoded.uid)
      .get();

    let userData;
    if (userDoc.exists) {
      userData = userDoc.data();
    } else {
      // Firestore kaydı yoksa Auth'dan oluştur
      userData = {
        uid: decoded.uid,
        name: decoded.name || 'Kullanıcı',
        email: decoded.email || '',
        phone: '',
        photoUrl: decoded.picture || null,
      };
      await getFirestore().collection('users').doc(decoded.uid).set(userData);
    }

    res.json({
      success: true,
      user: {
        uid: userData.uid,
        name: userData.name,
        email: userData.email,
        phone: userData.phone,
        photoUrl: userData.photoUrl,
      },
    });
  } catch (error) {
    if (error.code === 'auth/id-token-expired') {
      return res.status(401).json({
        success: false,
        message: 'Oturum süresi dolmuş.',
        code: 'TOKEN_EXPIRED',
      });
    }
    next(error);
  }
});

/**
 * GET /api/auth/profile
 * Flutter: AuthRepository.getUserDetails(uid)
 * 
 * Header: Authorization: Bearer <idToken>
 * Returns: { success, user: { uid, name, email, phone, photoUrl } }
 */
router.get('/profile', authenticate, async (req, res, next) => {
  try {
    const userDoc = await getFirestore()
      .collection('users')
      .doc(req.user.uid)
      .get();

    if (!userDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Kullanıcı profili bulunamadı.',
        code: 'USER_NOT_FOUND',
      });
    }

    const userData = userDoc.data();
    res.json({
      success: true,
      user: {
        uid: userData.uid,
        name: userData.name,
        email: userData.email,
        phone: userData.phone,
        photoUrl: userData.photoUrl || null,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/auth/profile
 * Flutter: AuthRepository.updateProfile(UserModel user)
 * 
 * Header: Authorization: Bearer <idToken>
 * Body: { name?, phone?, photoUrl? }
 * Returns: { success, user: { uid, name, email, phone, photoUrl } }
 */
router.put('/profile', authenticate, profileUpdateValidation, async (req, res, next) => {
  try {
    const validationError = handleValidationErrors(req, res);
    if (validationError) return;

    const { name, phone, photoUrl } = req.body;
    const uid = req.user.uid;

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone;
    if (photoUrl !== undefined) updateData.photoUrl = photoUrl;
    updateData.updatedAt = new Date().toISOString();

    // Firestore güncelle
    await getFirestore().collection('users').doc(uid).update(updateData);

    // Firebase Auth displayName güncelle
    if (name) {
      await getAuth().updateUser(uid, { displayName: name });
    }

    // Güncel profili döndür
    const updatedDoc = await getFirestore().collection('users').doc(uid).get();
    const updatedData = updatedDoc.data();

    res.json({
      success: true,
      message: 'Profil güncellendi.',
      user: {
        uid: updatedData.uid,
        name: updatedData.name,
        email: updatedData.email,
        phone: updatedData.phone,
        photoUrl: updatedData.photoUrl || null,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/auth/logout
 * Flutter: AuthRepository.logout()
 * 
 * NOT: Firebase client-side oturumu zaten kapatır.
 * Bu endpoint server-side token iptalini sağlar (opsiyonel ama güvenli).
 * 
 * Header: Authorization: Bearer <idToken>
 * Returns: { success, message }
 */
router.post('/logout', authenticate, async (req, res, next) => {
  try {
    // Kullanıcının tüm oturumlarını iptal et (revoke refresh tokens)
    await getAuth().revokeRefreshTokens(req.user.uid);

    console.log(`✅ Kullanıcı çıkış yaptı: ${req.user.uid}`);

    res.json({
      success: true,
      message: 'Oturum başarıyla kapatıldı.',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/auth/reset-password
 * Flutter: AuthRepository.sendPasswordResetEmail(email)
 * 
 * Body: { email }
 * Returns: { success, message }
 */
router.post('/reset-password', async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(422).json({
        success: false,
        message: 'E-posta adresi gereklidir.',
        code: 'MISSING_EMAIL',
      });
    }

    // Firebase Admin SDK ile şifre sıfırlama linki oluştur
    const link = await getAuth().generatePasswordResetLink(email.trim());

    // Gerçek uygulamada bu link bir e-posta servisiyle (Nodemailer, SendGrid vb.) gönderilir.
    // Şimdilik link'i sadece logluyoruz.
    console.log(`🔑 Şifre sıfırlama linki oluşturuldu: ${link}`);

    res.json({
      success: true,
      message: 'Şifre sıfırlama e-postası gönderildi.',
      // Geliştirme ortamında link döndürülür, production'da döndürülmez
      ...(process.env.NODE_ENV === 'development' && { resetLink: link }),
    });
  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      // Güvenlik: Kullanıcı bulunmasa bile aynı mesajı döndür
      return res.json({
        success: true,
        message: 'Şifre sıfırlama e-postası gönderildi.',
      });
    }
    next(error);
  }
});

module.exports = router;
