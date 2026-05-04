import express from "express";
import dotenv from "dotenv";
import {
  createPaymentSession,
  verifyPaymentStatus,
} from "./clients/paymentgRPCClient.js";
import crypto from "node:crypto";

dotenv.config();

const app = express();
const port = process.env.PORT || 4004;
const serviceName = process.env.SERVICE_NAME || "order-service";

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
  res.json({ service: serviceName, message: "Order service is up" });
});

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: serviceName,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.post("/internal/grpc/payment-session", async (req, res, next) => {
  try {
    const orderId = req.body.orderId || `order-${Date.now()}`;
    const amount = Number(req.body.amount || 199.99);
    const currency = req.body.currency || "INR";

    const response = await createPaymentSession({
      orderId,
      amount,
      currency,
      correlationId: req.correlationId,
    });

    res.json({
      service: serviceName,
      grpcHost: process.env.PAYMENT_GRPC_HOST || "localhost:9091",
      response,
    });
  } catch (error) {
    next(error);
  }
});

app.post("/internal/grpc/payment-verify", async (req, res, next) => {
  try {
    const paymentId = req.body.paymentId || "pay-demo-001";
    const orderId = req.body.orderId || "order-demo-001";

    const response = await verifyPaymentStatus({
      paymentId,
      orderId,
      correlationId: req.correlationId,
    });

    res.json({
      service: serviceName,
      grpcHost: process.env.PAYMENT_GRPC_HOST || "localhost:9091",
      response,
    });
  } catch (error) {
    next(error);
  }
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
