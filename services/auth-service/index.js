import express from "express";
import dotenv from "dotenv";
import crypto from "node:crypto";
import { signup, login, verifyToken, seedAdminUser } from "./auth-service.js";

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
    const { email, name, password, role } = req.body;

    if (!email || !name || !password) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const user = await signup({ email, name, password, role });
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

app.get("/protected", (req, res, next) => {
  try {
    const token = req.header("Authorization")?.replace("Bearer ", "");

    if (!token) {
      return res.status(401).json({ error: "No token provided" });
    }

    const decoded = verifyToken(token);
    res.json({
      message: "Access granted",
      user: {
        id: decoded.id,
        email: decoded.email,
        role: decoded.role,
      },
    });
  } catch (error) {
    next(error);
  }
});

app.get("/admin/protected", (req, res, next) => {
  try {
    const token = req.header("Authorization")?.replace("Bearer ", "");

    if (!token) {
      return res.status(401).json({ error: "No token provided" });
    }

    const decoded = verifyToken(token);
    if (decoded.role !== "admin") {
      return res.status(403).json({ error: "Forbidden" });
    }

    res.json({ message: "Admin access granted", user: decoded });
  } catch (error) {
    next(error);
  }
});

app.use((_req, res) => {
  res.status(404).json({ error: "Not Found" });
});

app.use((err, req, res, _next) => {
  console.error(`[${serviceName}] error cid=${req.correlationId}`, err);
  let statusCode = 500;
  if (err.message.includes("already exists")) {
    statusCode = 409;
  } else if (err.message.includes("not found")) {
    statusCode = 404;
  } else if (err.message.includes("Forbidden")) {
    statusCode = 403;
  } else if (err.message.includes("Invalid")) {
    statusCode = 401;
  }
  res.status(statusCode).json({
    error: err.message || "Internal Server Error",
    correlationId: req.correlationId,
  });
});

app.listen(port, () => {
  seedAdminUser()
    .then((adminUser) => {
      if (adminUser) {
        console.log(
          `[${serviceName}] default admin bootstrapped for ${adminUser.email}`,
        );
      }
    })
    .catch((error) => {
      console.error(`[${serviceName}] failed to bootstrap admin`, error);
    })
    .finally(() => {
      console.log(`[${serviceName}] listening on port ${port}`);
    });
});
