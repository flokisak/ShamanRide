import CryptoJS from 'crypto-js';

// Generate a room-specific encryption key
export const generateRoomKey = (roomName: string, salt: string = 'shamanride_chat_salt'): string => {
  return CryptoJS.PBKDF2(roomName, salt, {
    keySize: 256 / 32,
    iterations: 1000
  }).toString();
};

// Encrypt a message
export const encryptMessage = (message: string, key: string): string => {
  try {
    const encrypted = CryptoJS.AES.encrypt(message, key).toString();
    return encrypted;
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt message');
  }
};

// Decrypt a message
export const decryptMessage = (encryptedMessage: string, key: string): string => {
  try {
    const bytes = CryptoJS.AES.decrypt(encryptedMessage, key);
    const decrypted = bytes.toString(CryptoJS.enc.Utf8);
    if (!decrypted) {
      throw new Error('Decryption failed - invalid key or corrupted data');
    }
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt message');
  }
};

// Encrypt sensitive message data (for storage)
export const encryptMessageData = (data: any, key: string): string => {
  try {
    const jsonString = JSON.stringify(data);
    return encryptMessage(jsonString, key);
  } catch (error) {
    console.error('Message data encryption error:', error);
    throw new Error('Failed to encrypt message data');
  }
};

// Decrypt sensitive message data
export const decryptMessageData = (encryptedData: string, key: string): any => {
  try {
    const decryptedString = decryptMessage(encryptedData, key);
    return JSON.parse(decryptedString);
  } catch (error) {
    console.error('Message data decryption error:', error);
    throw new Error('Failed to decrypt message data');
  }
};

// Hash sensitive data for storage (one-way)
export const hashData = (data: string): string => {
  return CryptoJS.SHA256(data).toString();
};

// Verify data integrity
export const verifyIntegrity = (data: string, hash: string): boolean => {
  return CryptoJS.SHA256(data).toString() === hash;
};

// Generate a secure random key for end-to-end encryption
export const generateSecureKey = (): string => {
  return CryptoJS.lib.WordArray.random(256/8).toString();
};
