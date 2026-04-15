# 🤖 象棋 AI 對戰

這是一個現代化、全棧式的象棋對戰系統。採用 Monorepo 架構開發，內建 Minimax 演算法的 AI 對手，並具備精美且具動態效果的棋盤介面。

## ✨ 核心特色

- **強大 AI 對戰**：使用 Minimax 演算法搭配 Alpha-Beta 剪枝，提供具有挑戰性的對手。
- **現代化介面**：基於 Vue 3 與 Tailwind CSS v4 打造，具備 3D 棋子質感、呼吸燈動畫與毛玻璃特效。
- **即時通訊**：使用 Socket.io 實作全雙工通訊，確保操控流暢不延遲。
- **完整規則引擎**：涵蓋蹩馬腿、塞象眼、將帥照面等所有標準象棋規則。
- **進階功能**：
  - **悔棋系統**：可悔棋。
  - **認輸二次確認**：防止誤觸。
  - **實時走棋記錄**：追蹤每一手棋的變動。

### 1. 安裝依賴

在根目錄執行：

```bash
npm install
```

### 2. 啟動後端伺服器 (Socket.io)

```bash
cd backend
npm run dev
```

後端將執行於 `http://localhost:3000`

### 3. 啟動前端開發環境 (Vite)

開啟另一個終端機，執行：

```bash
cd frontend
npm run dev
```

前端將執行於 `http://localhost:5173`

## 📜 授權協議

MIT License
