# 🚀 AidConnect – Local Community Assistance Platform

## 📌 Project Overview

AidConnect is a full-stack web application designed to connect local residents with nearby volunteers during emergency situations such as medical needs, accidents, or natural disasters. The platform enables real-time communication and fast response to ensure timely assistance.

---

## 🎯 Problem Statement

Many communities lack a centralized platform to coordinate help during emergencies. This leads to delays in response and difficulty in finding nearby assistance.

---

## 💡 Solution

AidConnect provides a unified platform where:

* Users can request help instantly
* Volunteers can respond quickly
* Real-time updates ensure fast communication

---

## 🛠️ Tech Stack

### Frontend

* HTML, CSS, JavaScript
* React.js
* Tailwind CSS / Bootstrap

### Backend

* Supabase (Backend-as-a-Service)

### Database

* PostgreSQL (via Supabase)

### Real-Time

* Supabase Realtime

---

## 🔑 Key Features

### 👤 User Roles

* Admin
* User (Request Help)
* Volunteer (Provide Help)

---

### 🔐 Authentication

* Secure Signup/Login using Supabase Auth
* Role-based access control

---

### 🚨 Emergency Request System

Users can create requests with:

* Title
* Description
* Type (Medical, Accident, Disaster, Other)
* Location
* Urgency Level (Low, Medium, High)

---

### 🙋 Volunteer Features

* View nearby requests
* Accept/Reject requests
* Update request status

---

### ⚡ Real-Time Updates

* Live request updates
* Instant status changes

---

### 💬 Chat System

* Real-time communication between user and volunteer

---

### 📊 Admin Dashboard

* Manage users
* View all requests
* Monitor system activity

---

### 🚀 Extra Features

* SOS Button
* Notification system
* Volunteer rating system

---

## 🗂️ Project Structure

```
frontend/
 ├── src/
 │   ├── components/
 │   ├── pages/
 │   ├── hooks/
 │   ├── integrations/
 │   ├── lib/
 │   ├── App.jsx
 │   └── main.tsx

supabase/
 ├── migrations/
 └── config.toml
```

---

## ⚙️ Installation & Setup

### 1. Clone the repository

```bash
git clone https://github.com/your-username/aidconnect.git
cd aidconnect
```

---

### 2. Install dependencies

```bash
npm install
```

---

### 3. Setup Environment Variables

Create a `.env` file and add:

```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_anon_key
```

---

### 4. Run the project

```bash
npm run dev
```

---

## 🔄 Working Flow

1. User signs up/logs in
2. User creates an emergency request
3. Request is stored in PostgreSQL database
4. Volunteers view and accept requests
5. Real-time updates notify users
6. Chat system enables communication

---

## 🔐 Security

* Supabase Authentication
* Row Level Security (RLS)
* Secure API access

---

## 📈 Future Enhancements

* Location-based filtering (Google Maps integration)
* Push notifications
* AI-based emergency prioritization

---

## 👨‍💻 Author

Rahul Kumar Yadav

---

## ⭐ Conclusion

AidConnect helps communities respond faster during emergencies by connecting people in need with nearby volunteers through a real-time and scalable platform.
