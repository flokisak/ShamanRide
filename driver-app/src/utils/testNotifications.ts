// Test notification function for debugging
import { notifyUser, initializeNotifications } from '../utils/notifications';

export const testNotifications = async () => {
  console.log('🧪 Starting notification tests...');
  
  // Initialize notifications first
  await initializeNotifications();
  
  // Test ride notification
  console.log('🧪 Testing ride notification...');
  await notifyUser('ride', {
    title: 'Testovací jízda',
    body: 'Toto je testovací notifikace pro novou jízdu'
  });
  
  // Wait 2 seconds
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Test message notification
  console.log('🧪 Testing message notification...');
  await notifyUser('message', {
    title: 'Testovací zpráva',
    body: 'Toto je testovací notifikace pro novou zprávu'
  });
  
  // Wait 2 seconds
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Test general notification
  console.log('🧪 Testing general notification...');
  await notifyUser('general', {
    title: 'Testovací upozornění',
    body: 'Toto je testovací notifikace pro obecné upozornění'
  });
  
  console.log('🧪 Notification tests completed');
};