# 🤖 現代化 AI 象棋對戰 (Chinese Chess AI)

這是一個現代化、全棧式的象棋對弈系統。採用 **Monorepo** 架構開發，具備極簡豪華的視覺效果，並針對 **手機行動端** 進行了深度優化。

## 🌐 線上試玩 (Live Demo)

- **前端入口 (Vercel)**: [https://chess-six-bice.vercel.app](https://chess-six-bice.vercel.app)
- **後端 API**: 由 Render 雲端環境託管 (內部連線)

---

## ✨ 核心特色

- **📱 移動端深度優化**：
  - **極簡佈局**：隱藏非必要元素，將垂直空間極大化給予棋盤。
  - **交互進度**：對局紀錄改為彈窗模式，並在主畫面顯示「最新一步」動態。
  - **視覺回饋**：引入「背景呼吸燈」取代傳統動畫，提升對局沉浸感。
- **🧠 智能 AI 對戰**：
  - 基於 **Minimax 演算法** 與 **Alpha-Beta 剪枝**。
  - 具備多種 AI 作戰風格（攻擊型、防禦型、平衡型）。
- **🎨 頂級視覺體驗**：
  - **Vue 3 + Tailwind CSS v4**。
  - 具備毛玻璃效果、3D 質感棋子、即時將軍快報、勝負全屏 Modal。
- **🔌 即時同步**：使用 **Socket.io** 實現毫秒級連線，確保 AI 思考與走子體驗流暢。

---

## 🏗 專案架構 (Monorepo)

```text
Chess/
├── shared/   # 核心象棋規則、FEN 編碼、型別定義 (TypeScript)
├── backend/  # Node.js + Socket.io 伺服器，負責 AI 計算與遊戲邏輯
└── frontend/ # Vue 3 現代化單頁應用，負責 UI/UX 呈現
```

---

## 🛠 本地開發指南

### 1. 安裝環境依賴 (根目錄執行)

```bash
npm install
```

### 2. 啟動後端伺服器 (backend/)

```bash
cd backend
npm run dev
```

_預設運行於 `http://localhost:3000`_

### 3. 啟動前端開發環境 (frontend/)

```bash
cd frontend
npm run dev
```

_預設運行於 `http://localhost:5173`_

---

## 🚀 部署配置說明

### 前端 (Vercel)

- **Root Directory**: `frontend`
- **Environment Variable**: `VITE_BACKEND_URL`

### 後端 (Render)

- **Root Directory**: `backend`
- **Build Command**: `npm install; npm run build`
- **Start Command**: `node dist/backend/src/server.js`

---

## 📜 授權協議

MIT License
