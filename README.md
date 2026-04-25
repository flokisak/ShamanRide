# 🚗 ShamanRide - Complete Taxi Dispatch & Fleet Management System

[![Version](https://img.shields.io/badge/version-1.0.0-brightgreen.svg)](https://github.com/your-repo/shamanride)
[![Status](https://img.shields.io/badge/status-production--ready-success.svg)](https://github.com/your-repo/shamanride)
 
 
ShamanRide is a comprehensive, enterprise-grade taxi dispatch and fleet management platform designed for modern taxi companies. Built with React, TypeScript, and Supabase, it provides everything needed to efficiently manage rides, drivers, vehicles, and operations in real-time, featuring an advanced gamification system that motivates drivers through intelligent scoring and achievement rewards.

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
- **Advanced Gamification System**: Multi-factor scoring with real-time leaderboards, achievements, and performance rewards
- **Intelligent Driver Scoring**: Automated calculation based on:
  - **Response Time**: 10 points (≤1 min), 5 points (≤3 min), 2 points (≤5 min) for ride acceptance
  - **Fuel Efficiency**: Optimized fuel consumption tracking
  - **Customer Satisfaction**: Service quality and feedback metrics
  - **Revenue Performance**: Earnings and utilization metrics
  - **Perfect Rides**: Rides accepted within 1 minute AND completed without cancellation
- **Achievement System**: Unlockable badges including "Dokonalý řidič" and "Bleskový reakční čas"
- **Driver Communication**: Real-time chat between dispatchers and drivers with message history

### 📱 **Progressive Web App for Drivers**
- **Mobile-First Interface**: Full-featured PWA that works offline and installs like a native app
- **Push Notifications**: Instant alerts for new rides, status updates, and important messages
- **Smart Ride Acceptance**: One-tap acceptance with automatic response time scoring
- **Navigation Integration**: Seamless integration with Google Maps and Waze for turn-by-turn directions
- **Offline Capability**: Continue working even with poor network connectivity
- **Built-in Gamification**:
  - Real-time score tracking with acceptance time metrics
  - Achievement notifications and progress tracking
  - Personal leaderboard and performance insights
  - Response time optimization for maximum gamification points

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

### 🏆 **Advanced Gamification & Motivation**
- **Real-time Driver Leaderboards**: Live ranking based on comprehensive performance metrics
- **Achievement Badges**: Unlockable rewards for exceptional performance:
  - 🏆 **Dokonalý řidič**: 90%+ rides accepted within 1 minute AND completed without cancellation
  - ⚡ **Bleskový reakční čas**: 80+ points in acceptance time scoring
  - 🚗 **Šetřílek**: Outstanding fuel efficiency (80+ points)
  - 👥 **Oblíbenec**: High customer service metrics
  - 🦌 **Mistr srnek**: Special recognition for unique experiences
- **Intelligent Performance Scoring**: Multi-factor system with weighted components:
  - **Response Time (20%)**: 10 pts (≤1 min), 5 pts (≤3 min), 2 pts (≤5 min) acceptance
  - **Fuel Efficiency (15%)**: Optimized consumption and cost tracking
  - **Customer Satisfaction (10%)**: Service quality and feedback
  - **Revenue Performance (10%)**: Earnings and utilization metrics
  - **Perfect Rides (15%)**: Fast acceptance + successful completion
  - **Manual Adjustments (20%)**: Bonus points for special circumstances
  - **Deer Encounters (10%)**: Special easter egg recognition
- **Driver App Integration**: Full gamification visibility for drivers with personal score tracking

### 🎮 **Acceptance Time Scoring System**
ShamanRide features an intelligent response time gamification system that rewards drivers for quick ride acceptance:

- **⚡ Lightning Fast (≤1 minute)**: 10 points - Perfect acceptance time
- **🚀 Quick Response (≤3 minutes)**: 5 points - Good response time
- **⚪ Standard Response (≤5 minutes)**: 2 points - Acceptable response time
- **❌ Slow/No Response (>5 minutes)**: 0 points - Needs improvement

**Perfect Ride Definition**: A ride is considered "perfect" when accepted within 1 minute AND completed without any cancellations or issues, earning maximum gamification rewards.

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
- **Smart Ride Notifications**: Instant alerts for new ride assignments with acceptance time tracking
- **Navigation Assistance**: Integrated maps with optimized routes (Google Maps/Waze)
- **Status Updates**: One-tap status changes (Available, Busy, Break, etc.)
- **Real-time Earnings Tracking**: Live earnings and performance monitoring
- **Driver-Dispatcher Communication**: Real-time encrypted chat with message history
- **Full Gamification Experience**:
  - Personal score dashboard with acceptance time metrics
  - Achievement progress and unlocked badges
  - Live leaderboard positioning
  - Performance insights and improvement tips
  - Response time optimization for maximum points

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

**🎊 ShamanRide v1.0 - The Complete Taxi Dispatch Solution with Advanced Gamification** 🚗✨🏆⚡
