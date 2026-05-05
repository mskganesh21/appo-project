import express from "express";
import dotenv from "dotenv";
import { signup, login, verifyToken } from "./auth-service.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 4001;
const serviceName = process.env.SERVICE_NAME || "auth-service";

app.use(express.json());

app.use((req, res, next) => {
  const correlationId = req.header("x-correlation-id") || crypto.randomUUID();
  req.correlationId = correlationId;
  res.setHeader("x-correlation-id", correlationId);
  next();
});

app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - startedAt;
    console.log(
      `[${serviceName}] ${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms cid=${req.correlationId}`,
    );
  });
  next();
});

app.get("/", (_req, res) => {
  res.json({ service: serviceName, message: "Auth service is up" });
});

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: serviceName,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.post("/signup", async (req, res, next) => {
  try {
    const { email, name, password } = req.body;

    if (!email || !name || !password) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const user = await signup({ email, name, password });
    res.status(201).json({ user });
  } catch (error) {
    next(error);
  }
});

app.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Missing email or password" });
    }

    const { token, user } = await login({ email, password });
    res.json({ token, user });
  } catch (error) {
    next(error);
  }
});

app.get("/verify", (req, res, next) => {
  try {
    const token = req.header("Authorization")?.replace("Bearer ", "");

    if (!token) {
      return res.status(401).json({ error: "No token provided" });
    }

    const decoded = verifyToken(token);
    res.json({ valid: true, user: decoded });
  } catch (error) {
    next(error);
  }
});

app.use((_req, res) => {
  res.status(404).json({ error: "Not Found" });
});

app.use((err, req, res, _next) => {
  console.error(`[${serviceName}] error cid=${req.correlationId}`, err);
  const statusCode = err.message.includes("not found")
    ? 404
    : err.message.includes("Invalid")
      ? 401
      : 500;
  res.status(statusCode).json({
    error: err.message || "Internal Server Error",
    correlationId: req.correlationId,
  });
});

app.listen(port, () => {
  console.log(`[${serviceName}] listening on port ${port}`);
});
