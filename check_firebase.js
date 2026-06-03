const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const keyFilePath = path.join(__dirname, 'config/servicesAccountKey.json');
if (!fs.existsSync(keyFilePath)) {
  console.error('File not found:', keyFilePath);
  process.exit(1);
}

try {
  const serviceAccount = require(keyFilePath);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log('Firebase initialized. Attempting Firestore query...');
  
  admin.firestore().collection('clients').limit(1).get()
    .then(snapshot => {
      console.log('✅ Firestore connection success! Found docs count:', snapshot.size);
      return admin.auth().listUsers(1);
    })
    .then(listUsersResult => {
      console.log('✅ Firebase Auth connection success! Found users count:', listUsersResult.users.length);
      process.exit(0);
    })
    .catch(err => {
      console.error('❌ Firebase Operation Failed:', err.message);
      console.error(err);
      process.exit(1);
    });
} catch (e) {
  console.error('❌ Initialization Error:', e);
  process.exit(1);
}
