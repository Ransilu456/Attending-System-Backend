# 🚀 Gemini Prompt: MongoDB Age → DOB Migration (MERN, Free Cluster)

## 📌 CONTEXT

You are assisting with a **MERN stack application** (MongoDB Atlas **Free Tier M0**).

* Database contains **~250 student documents**
* Current schema incorrectly stores **`age` as a fixed number**
* **1 year has passed**, so all stored ages are now wrong
* The app is in **production**, so **no data loss and no downtime** is allowed

---

## 🎯 OBJECTIVE

Refactor the backend so that:

1. **Age is NOT stored in MongoDB**
2. **Date of Birth (DOB) is stored instead**
3. **Age is calculated dynamically in the API**
4. Existing student data is **migrated safely**
5. The solution is **safe for MongoDB Atlas Free Tier (M0)**

---

## 🧠 REQUIREMENTS

### Backend

* Stack: **Node.js + Express + MongoDB + Mongoose**
* Remove `age` field from schema
* Add `dateOfBirth: Date` with validation (must be in the past)
* Compute age dynamically in controllers or response mappers

### Migration

* Create a **one-time migration script** that:

  * Reads existing `age`
  * Generates an **approximate DOB** using `(age + 1)` years back
  * Updates documents **one by one** using `updateOne`
  * Uses a **small delay (10–30ms)** between writes (free-tier safe)
  * Uses `$unset` to remove `age`
* NO `updateMany`
* NO collection drop
* NO parallel writes

### Safety

* Assume MongoDB Atlas **Free Tier (M0)**
* Script must NOT overload the cluster
* Recommend backup using `mongodump`

---

## 🔧 EXPECTED OUTPUT FROM GEMINI

### 1️⃣ Mongoose Schema (Updated)

* Student schema using `dateOfBirth`
* Proper validation

### 2️⃣ Migration Script

* Node.js script (`migrateAgeToDOB.js`)
* Uses Mongoose
* Sequential updates
* Free-tier safe delay

### 3️⃣ Age Calculation Utility

* Correct birthday-aware age calculation

### 4️⃣ Express Controller Example

* Returns computed `age`
* Does NOT store age

### 5️⃣ Clear Comments

* Explain why age should never be stored
* Explain why this approach avoids yearly updates

---

## 🚫 WHAT MUST NOT BE DONE

* Do NOT delete any documents
* Do NOT drop collections
* Do NOT bulk overwrite data
* Do NOT require paid Atlas features
* Do NOT change frontend API contract (still return `age`)

---

## ✅ SUCCESS CRITERIA

* No database crash
* No data loss
* Works on MongoDB Atlas Free Tier
* Age automatically updates every birthday
* Clean, production-ready MERN code

---

## 🧪 OPTIONAL (BONUS)

* Add a `legacyAge` temporary field (optional)
* Add a dry-run mode for migration
* Add rollback guidance

---

**Generate clean, copy-paste-ready code and explanations.**
