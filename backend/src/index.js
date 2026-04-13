import { createServer } from 'http';
import { connectDB } from "./db/index.js";
import dotenv from "dotenv";
import app from './app.js';
import { initSocket } from './socket/index.js';

dotenv.config({ path: "./.env" });

const PORT = Number(process.env.PORT) || 3000;
const MAX_PORT_ATTEMPTS = 20;

const httpServer = createServer(app);
initSocket(httpServer);

connectDB()
  .then(async () => {
    let currentPort = PORT;

    for (let attempt = 0; attempt <= MAX_PORT_ATTEMPTS; attempt += 1) {
      try {
        await new Promise((resolve, reject) => {
          const onError = (err) => {
            httpServer.off("listening", onListening);
            reject(err);
          };

          const onListening = () => {
            httpServer.off("error", onError);
            resolve();
          };

          httpServer.once("error", onError);
          httpServer.once("listening", onListening);
          httpServer.listen(currentPort);
        });

        console.log(`🚀 Server is running on http://localhost:${currentPort}`);
        return;
      } catch (err) {
        if (err?.code === "EADDRINUSE" && attempt < MAX_PORT_ATTEMPTS) {
          console.warn(`⚠️ Port ${currentPort} is busy, trying ${currentPort + 1}...`);
          currentPort += 1;
          continue;
        }

        throw err;
      }
    }
  })
  .catch(err => {
    console.error("❌ Server startup failed:", err.message);
    process.exit(1);
  });
