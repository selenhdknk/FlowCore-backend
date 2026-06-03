/**
 * FlowCore Backend - Firebase Admin SDK Başlatıcı
 * 
 * Bu modül Firebase Admin SDK'yı başlatır ve tüm servisler için
 * tek bir bağlantı noktası sağlar.
 */

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

let firebaseApp;

/**
 * Firebase Admin SDK'yı başlatır.
 * Önce serviceAccountKey.json dosyasını arar, yoksa ortam değişkenlerini kullanır.
 */
function initializeFirebase() {
  if (admin.apps.length > 0) {
    return admin.apps[0];
  }

  let credential;
  const keyFilePath = path.join(__dirname, '../../config/serviceAccountKey.json');
  const pluralKeyFilePath = path.join(__dirname, '../../config/servicesAccountKey.json');
  const envKeyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS 
    ? path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS) 
    : null;

  let chosenPath = null;
  if (fs.existsSync(keyFilePath)) {
    chosenPath = keyFilePath;
  } else if (fs.existsSync(pluralKeyFilePath)) {
    chosenPath = pluralKeyFilePath;
  } else if (envKeyPath && fs.existsSync(envKeyPath)) {
    chosenPath = envKeyPath;
  }

  if (chosenPath) {
    // Yöntem 1: Servis hesabı JSON dosyası
    const serviceAccount = require(chosenPath);
    credential = admin.credential.cert(serviceAccount);
    console.log(`✅ Firebase: ${path.basename(chosenPath)} dosyasından başlatıldı.`);
  } else if (process.env.FIREBASE_PROJECT_ID) {
    // Yöntem 2: Ortam değişkenleri
    credential = admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    });
    console.log('✅ Firebase: Ortam değişkenlerinden başlatıldı.');
  } else {
    // Yöntem 3: Google Cloud ortamındaki uygulama varsayılanları
    credential = admin.credential.applicationDefault();
    console.log('✅ Firebase: Application Default Credentials ile başlatıldı.');
  }

  firebaseApp = admin.initializeApp({
    credential,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  });

  return firebaseApp;
}

// Firebase servislerini dışa aktar
const getFirestore = () => admin.firestore();
const getAuth = () => admin.auth();
const getStorage = () => admin.storage();

module.exports = {
  initializeFirebase,
  getFirestore,
  getAuth,
  getStorage,
  admin,
};
