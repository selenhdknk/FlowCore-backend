/**
 * FlowCore Backend - Kimlik Doğrulama Middleware
 * 
 * Firebase ID Token doğrulaması yapar.
 * Flutter uygulaması, Firebase Authentication ile giriş yaptıktan sonra
 * her istekte Authorization: Bearer <idToken> başlığını gönderir.
 */

const { getAuth } = require('../config/firebase');

/**
 * Firebase ID Token'ı doğrulayan middleware.
 * req.user objesine doğrulanmış kullanıcı bilgilerini ekler.
 */
async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Yetkilendirme başlığı eksik veya geçersiz.',
        code: 'MISSING_AUTH_HEADER',
      });
    }

    const idToken = authHeader.split('Bearer ')[1];

    if (!idToken) {
      return res.status(401).json({
        success: false,
        message: 'Token bulunamadı.',
        code: 'MISSING_TOKEN',
      });
    }

    // Firebase ID Token doğrula
    const decodedToken = await getAuth().verifyIdToken(idToken);

    // Kullanıcı bilgilerini request nesnesine ekle
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      name: decodedToken.name,
    };

    next();
  } catch (error) {
    console.error('Token doğrulama hatası:', error.code, error.message);

    if (error.code === 'auth/id-token-expired') {
      return res.status(401).json({
        success: false,
        message: 'Oturum süresi dolmuş. Lütfen tekrar giriş yapın.',
        code: 'TOKEN_EXPIRED',
      });
    }

    if (error.code === 'auth/argument-error' || error.code === 'auth/invalid-id-token') {
      return res.status(401).json({
        success: false,
        message: 'Geçersiz kimlik doğrulama token\'ı.',
        code: 'INVALID_TOKEN',
      });
    }

    return res.status(401).json({
      success: false,
      message: 'Kimlik doğrulaması başarısız oldu.',
      code: 'AUTH_FAILED',
    });
  }
}

module.exports = { authenticate };
