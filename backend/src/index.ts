// backend/index.ts - Enhanced with error handling
import express, { Request, Response } from "express";
import https from "https";
import fs from "fs";
import { Server } from "socket.io";
import cors from "cors";
import { getDistance } from "geolib";
import dotenv from "dotenv";
import { Pool } from "pg";
import jwt from "jsonwebtoken";
import { verifyToken } from './utils/jwt';
import { connectDB } from "./utils/db";
import { registerSocketEvents } from "./ws/socketHandler";
import locationRoutes from "./routes/locationRoutes";
import authRoutes from "./routes/authRoutes";

dotenv.config();

const app = express();

// Enhanced SSL setup with error handling
let httpsServer;
try {
  const privateKey = fs.readFileSync("./ssl/private.key", "utf8");
  const certificate = fs.readFileSync("./ssl/certificate.crt", "utf8");
  const credentials = { key: privateKey, cert: certificate };
  
  httpsServer = https.createServer(credentials, app);
  console.log("✅ SSL certificates loaded successfully");
} catch (error) {
   if (error instanceof Error) {
    console.error("❌ SSL certificate error:", error.message);
  } else {
    console.error('Unknown error', error);
  }
  console.log("📝 Falling back to HTTP server...");
  
  // Fallback to HTTP for development
  const http = require('http');
  httpsServer = http.createServer(app);
}

// Enhanced Socket.IO setup
const io = new Server(httpsServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000
});

// Enhanced CORS
app.use(cors({
  origin: "*",
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json());

// DB connection with error handling
export let pool: Pool;
try {
  pool = connectDB();
  console.log("✅ Database connected successfully");
} catch (error) {
  console.error("❌ Database connection error:", error);
}

// Store socket connections
export const userSockets = new Map<string, string>();

// Share io instance globally
app.set("io", io);

// Enhanced WebSocket handling with error logging
io.on('connection', (socket) => {
  console.log(`✅ New client connected: ${socket.id}`);
  
  socket.on('error', (error) => {
    console.error(`❌ Socket error for ${socket.id}:`, error);
  });
  
  socket.on('disconnect', (reason) => {
    console.log(`📤 Client disconnected: ${socket.id}, reason: ${reason}`);
  });
});

registerSocketEvents(io, userSockets);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    connections: userSockets.size 
  });
});

// Routes
app.use("/api", locationRoutes);
app.use("/api", authRoutes);

// Enhanced server startup
const PORT = Number(process.env.PORT) || 5000;

httpsServer.on('error', (error: any) => {
  console.error("❌ Server error:", error);
  if (error.code === 'EADDRINUSE') {
    console.log(`🔄 Port ${PORT} is busy, trying ${PORT + 1}...`);
    httpsServer.listen(PORT + 1);
  }
});

httpsServer.listen(PORT, () => {
  const protocol = httpsServer instanceof https.Server ? 'HTTPS' : 'HTTP';
  console.log(`🚀 ${protocol} server running on port ${PORT}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
});