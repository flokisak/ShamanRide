# 🚗 ShamanRide - Complete Taxi Dispatch & Fleet Management System

[![Version](https://img.shields.io/badge/version-1.0.0-brightgreen.svg)](https://github.com/your-repo/shamanride)
[![Status](https://img.shields.io/badge/status-production--ready-success.svg)](https://github.com/your-repo/shamanride)

ShamanRide is a comprehensive, enterprise-grade taxi dispatch and fleet management platform designed for modern taxi companies. Built with React, TypeScript, and Supabase, it provides everything needed to efficiently manage rides, drivers, vehicles, and operations in real-time.

## 🎯 What ShamanRide Does

ShamanRide revolutionizes taxi dispatch operations by providing a complete ecosystem for managing every aspect of your taxi business. From the moment a customer calls to payment completion, ShamanRide handles it all with intelligent automation, real-time tracking, and powerful analytics.

### 🚗 **Core Ride Dispatch System**
- **Intelligent Ride Assignment**: Automatically assigns the best available vehicle based on location, vehicle type, and driver availability
- **Real-time GPS Tracking**: Live vehicle location monitoring with route optimization
- **Dynamic Pricing**: Automatic fare calculation with customizable tariffs, flat rates, and time-based pricing
- **Route Optimization**: Multi-stop routing with optimized pickup sequences
- **Instant Notifications**: Real-time updates for customers and drivers via SMS and push notifications

### 👥 **Driver Management & Gamification**
- **Driver Profiles**: Comprehensive driver management with contact info, vehicle assignments, and performance tracking
- **Gamification System**: Motivational scoring system with achievements, leaderboards, and performance rewards
- **Driver Scoring**: Automated calculation of driver performance based on fuel efficiency, customer satisfaction, and revenue
- **Achievement System**: Unlockable badges and rewards for exceptional performance
- **Driver Communication**: Real-time chat between dispatchers and drivers with message history

### 📱 **Progressive Web App for Drivers**
- **Mobile-First Interface**: Full-featured PWA that works offline and installs like a native app
- **Push Notifications**: Instant alerts for new rides, status updates, and important messages
- **Ride Acceptance**: One-tap ride acceptance with automatic status updates
- **Navigation Integration**: Seamless integration with Google Maps and Waze for turn-by-turn directions
- **Offline Capability**: Continue working even with poor network connectivity

### 💬 **Communication Hub**
- **Real-time Chat**: Encrypted messaging between dispatchers and drivers
- **Group Communications**: Shift-wide broadcasts and announcements
- **SMS Integration**: Automated customer notifications and driver alerts
- **Message History**: Complete conversation logs with search functionality
- **Multi-platform Messaging**: Support for SMS, WhatsApp, and Telegram

### 📊 **Business Intelligence & Analytics**
- **Revenue Analytics**: Detailed financial reporting with profit/loss analysis
- **Performance Metrics**: Driver efficiency, vehicle utilization, and operational KPIs
- **Fuel Efficiency Tracking**: Monitor fuel consumption and costs across your fleet
- **Customer Insights**: Ride patterns, popular routes, and customer behavior analysis
- **Export Capabilities**: CSV and PDF reports for accounting and business planning

### 🚙 **Fleet Management**
- **Vehicle Inventory**: Complete vehicle database with maintenance schedules and service history
- **Maintenance Tracking**: Automated reminders for service intervals, inspections, and vignette renewals
- **Vehicle Status Monitoring**: Real-time availability tracking (Available, Busy, Break, Out of Service)
- **Fuel Management**: Track fuel types, consumption rates, and costs
- **Vehicle Assignment**: Flexible driver-vehicle pairing with automatic conflict resolution

### 👤 **Customer Management**
- **Customer Database**: Store customer information, preferences, and ride history
- **Ride History**: Complete log of all customer rides with detailed information
- **Customer Notifications**: Automated SMS updates for ride status, ETA, and driver information
- **Feedback System**: Customer satisfaction tracking and review management
- **Frequent Addresses**: Save and reuse common pickup/dropoff locations

### 🏆 **Gamification & Motivation**
- **Driver Leaderboards**: Real-time ranking based on performance metrics
- **Achievement Badges**: Unlockable rewards for milestones and exceptional service
- **Performance Scoring**: Multi-factor scoring system including:
  - Fuel efficiency
  - Customer satisfaction
  - Revenue generation
  - Perfect ride completion
  - Response time
  - Night shift performance
- **Manual Score Adjustments**: Ability to add bonus points or penalties for special circumstances

### 🔒 **Security & Authentication**
- **User Authentication**: Secure login system with role-based access control
- **Encrypted Communications**: End-to-end encryption for sensitive data
- **Data Privacy**: GDPR-compliant data handling and storage
- **Audit Logs**: Complete activity tracking for compliance and troubleshooting
- **Secure API**: RESTful APIs with proper authentication and authorization

### 🌐 **Multi-language Support**
- **Czech & English**: Full localization support
- **RTL Support**: Ready for additional languages with right-to-left text
- **Cultural Adaptation**: Localized pricing, date formats, and business logic

### 📈 **Data Management & Sync**
- **Cloud Synchronization**: Real-time sync with Supabase cloud database
- **Offline Mode**: Continue operations during network outages with automatic sync
- **Data Export/Import**: Backup and restore capabilities
- **Local Storage Fallback**: Graceful degradation when cloud services are unavailable
- **Automatic Backups**: Scheduled data backups and recovery procedures

## 🏗️ **Technical Architecture**

### **Frontend (Dispatcher Interface)**
- **React 19** with TypeScript for type-safe development
- **Tailwind CSS 4.0** for modern, responsive UI
- **Vite** for fast development and optimized production builds
- **Leaflet Maps** for interactive GPS tracking and route visualization
- **Socket.io** for real-time bidirectional communication

### **Mobile PWA (Driver App)**
- **Progressive Web App** with offline capabilities
- **Service Workers** for background sync and push notifications
- **Web Notifications API** for browser alerts
- **Geolocation API** for GPS tracking
- **Screen Wake Lock** to keep displays active during rides

### **Backend & Infrastructure**
- **Supabase** PostgreSQL database with real-time subscriptions
- **Row Level Security** for database-level access control
- **Socket.io Server** for real-time messaging and updates
- **RESTful APIs** for external integrations
- **File Storage** for documents, images, and backups

### **Integrations**
- **Google Maps API** for geocoding and directions
- **SMS Gateways** for automated messaging
- **PDF Generation** for reports and receipts
- **CSV Export** for data analysis
- **Push Notification Services** for mobile alerts

## 🚀 **Key Features & Capabilities**

### **For Dispatchers**
- **Dashboard Overview**: Real-time view of all vehicles, active rides, and system status
- **Ride Assignment**: Intelligent vehicle selection with multiple options
- **Customer Communication**: Direct SMS sending to customers
- **Driver Coordination**: Real-time chat and status monitoring
- **Analytics Access**: Comprehensive business intelligence tools
- **System Configuration**: Tariff management, user administration, and settings

### **For Drivers**
- **Ride Notifications**: Instant alerts for new ride assignments
- **Navigation Assistance**: Integrated maps with optimized routes
- **Status Updates**: Easy status changes (Available, Busy, Break, etc.)
- **Earnings Tracking**: Real-time earnings and performance monitoring
- **Communication**: Direct chat with dispatchers
- **Gamification**: Achievement tracking and leaderboard visibility

### **For Management**
- **Financial Reports**: Revenue analysis and profitability tracking
- **Fleet Analytics**: Vehicle utilization and maintenance insights
- **Driver Performance**: Individual and team performance metrics
- **Customer Insights**: Ride patterns and customer behavior analysis
- **Operational Efficiency**: System usage statistics and optimization opportunities

## 📋 **Installation & Setup**

### **Prerequisites**
- Node.js 18+ and npm
- Supabase account and project
- Google Maps API key
- SMS Gateway (optional)

### **Quick Start**
```bash
# Clone repository
git clone <repository-url>
cd shamanride

# Install dependencies
npm install

# Configure environment
cp .env.example .env.local
# Edit .env.local with your API keys

# Start development server
npm run dev

# For full stack (with backend)
npm run dev:full
```

### **Production Deployment**
```bash
# Build for production
npm run build

# Deploy to your hosting platform
npm run preview
```

### **Driver App Setup**
```bash
cd driver-app
npm install
npm run dev
```

## 🎯 **Use Cases & Industries**

ShamanRide is designed for:
- **Taxi Companies**: Complete dispatch and fleet management
- **Ride-sharing Services**: Driver coordination and customer management
- **Corporate Transportation**: Business travel and employee transport
- **Airport Transfers**: Scheduled pickup/dropoff services
- **Tour Operators**: Multi-stop tour routing and management
- **Delivery Services**: Last-mile delivery coordination
- **Medical Transport**: Emergency and non-emergency patient transport

## 📞 **Support & Documentation**

- **📧 Email**: support@shamanride.com
- **🐛 Issues**: [GitHub Issues](https://github.com/your-repo/shamanride/issues)
- **📖 Documentation**: [Wiki](https://github.com/your-repo/shamanride/wiki)
- **💬 Community**: Join our Discord/Slack community

## 📄 **License**

See [LICENSE](LICENSE) for more information.

---

**🎊 ShamanRide v1.0 - The Complete Taxi Dispatch Solution** 🚗✨🏆