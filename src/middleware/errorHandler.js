/**
 * FlowCore Backend - Hata Yönetimi Middleware
 * 
 * Tüm beklenmedik hataları yakalar ve standart JSON yanıtı döndürür.
 */

function errorHandler(err, req, res, next) {
  console.error('❌ Sunucu Hatası:', err);

  // Firestore hataları
  if (err.code && err.code.startsWith('5')) {
    return res.status(503).json({
      success: false,
      message: 'Veritabanı servisi geçici olarak kullanılamıyor.',
      code: 'DATABASE_ERROR',
    });
  }

  // İstek doğrulama hataları
  if (err.name === 'ValidationError') {
    return res.status(422).json({
      success: false,
      message: err.message,
      code: 'VALIDATION_ERROR',
    });
  }

  // Genel sunucu hatası
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Beklenmedik bir sunucu hatası oluştu.',
    code: err.code || 'INTERNAL_SERVER_ERROR',
  });
}

/**
 * 404 - Route bulunamadı handler
 */
function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    message: `'${req.method} ${req.originalUrl}' endpoint'i bulunamadı.`,
    code: 'NOT_FOUND',
  });
}

module.exports = { errorHandler, notFoundHandler };
