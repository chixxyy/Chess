import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { configureSocket } from './socket';

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*', // 允許所有來源以提高連線成功率
    methods: ['GET', 'POST']
  },
  pingTimeout: 60000, // 容許高達 60 秒的延遲 (針對長考與不穩定網路優化)
  pingInterval: 25000,
  connectionStateRecovery: {
    // 開啟 Socket.IO 連線狀態恢復機制 (適合手機網路切換)
    maxDisconnectionDuration: 2 * 60 * 1000, // 容許 2 分鐘內的斷線恢復
    skipMiddlewares: true
  }
});

app.get('/', (req, res) => {
  res.send('Chinese Chess API Running');
});

configureSocket(io);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
