import express from "express";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const port = process.env.PORT || 4002;
const serviceName = process.env.SERVICE_NAME || "product-service";

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
  res.json({ service: serviceName, message: "Product service is up" });
});

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: serviceName,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.use((_req, res) => {
  res.status(404).json({ error: "Not Found" });
});

app.use((err, req, res, _next) => {
  console.error(`[${serviceName}] error cid=${req.correlationId}`, err);
  res
    .status(500)
    .json({ error: "Internal Server Error", correlationId: req.correlationId });
});

app.listen(port, () => {
  console.log(`[${serviceName}] listening on port ${port}`);
});
