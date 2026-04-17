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
    origin: ['https://chess-six-bice.vercel.app', 'http://localhost:5173'], // 僅允許官網與本地測試
    methods: ['GET', 'POST']
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
