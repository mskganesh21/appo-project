import express from "express";
import dotenv from "dotenv";
import {
  createPaymentSession,
  verifyPaymentStatus,
} from "./clients/paymentgRPCClient.js";
import crypto from "node:crypto";

import {
  checkoutCommand,
  verifyPaymentForOrderCommand,
  confirmOrderCommand,
  failOrderCommand,
  requestRefundCommand,
} from "./commands/OrderCommands.js";
import {
  getOrderByIdQuery,
  getMyOrdersQuery,
  getAdminOrdersQuery,
  getOrderAuditLogsQuery,
} from "./queries/orderQueries.js";

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

app.post("/checkout", async (req, res, next) => {
  try {
    const { userId, items, currency, simulateAuditFailure } = req.body;

    const result = await checkoutCommand({
      userId,
      items,
      currency,
      simulateAuditFailure,
      correlationId: req.correlationId,
      paymentClient: {
        createPaymentSession,
      },
    });

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/orders/:orderId/confirm", (req, res, next) => {
  try {
    const order = confirmOrderCommand(req.params.orderId);
    res.json(order);
  } catch (error) {
    next(error);
  }
});

app.post("/orders/:orderId/payment/verify", async (req, res, next) => {
  try {
    const result = await verifyPaymentForOrderCommand({
      orderId: req.params.orderId,
      correlationId: req.correlationId,
      paymentClient: {
        verifyPaymentStatus,
      },
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/orders/:orderId/fail", (req, res, next) => {
  try {
    const reason = req.body.reason || "CHECKOUT_FAILED";
    const order = failOrderCommand(req.params.orderId, reason);
    res.json(order);
  } catch (error) {
    next(error);
  }
});

app.post("/orders/:orderId/refund-request", (req, res, next) => {
  try {
    const reason = req.body.reason || "COMPENSATION_REQUIRED";
    const order = requestRefundCommand(req.params.orderId, reason);
    res.json(order);
  } catch (error) {
    next(error);
  }
});

app.get("/orders/:orderId", (req, res, next) => {
  try {
    const order = getOrderByIdQuery(req.params.orderId);
    res.json(order);
  } catch (error) {
    next(error);
  }
});

app.get("/orders/user/:userId", (req, res, next) => {
  try {
    const orders = getMyOrdersQuery(req.params.userId);
    res.json({ items: orders, count: orders.length });
  } catch (error) {
    next(error);
  }
});

app.get("/orders/admin", (_req, res, next) => {
  try {
    const orders = getAdminOrdersQuery();
    res.json({ items: orders, count: orders.length });
  } catch (error) {
    next(error);
  }
});

app.get("/orders/:orderId/audit", (req, res, next) => {
  try {
    const items = getOrderAuditLogsQuery(req.params.orderId);
    res.json({ items, count: items.length });
  } catch (error) {
    next(error);
  }
});

app.post("/internal/transaction/failure-test", async (req, res, next) => {
  try {
    await checkoutCommand({
      userId: req.body.userId || "tx-test-user",
      items: req.body.items || [
        { productId: "tx-test-product", quantity: 1, price: 100 },
      ],
      currency: req.body.currency || "INR",
      simulateAuditFailure: true,
      correlationId: req.correlationId,
      paymentClient: {
        createPaymentSession,
      },
    });

    res.status(500).json({ error: "Unexpected success" });
  } catch (error) {
    res.status(200).json({
      message: "Transaction rollback verified",
      rolledBack: true,
      reason: error.message,
      correlationId: req.correlationId,
    });
  }
});

app.use((_req, res) => {
  res.status(404).json({ error: "Not Found" });
});

app.use((err, req, res, _next) => {
  console.error(`[${serviceName}] error cid=${req.correlationId}`, err);
  let statusCode = 500;
  if (err.message.includes("not found")) {
    statusCode = 404;
  } else if (
    err.message.includes("Invalid") ||
    err.message.includes("required")
  ) {
    statusCode = 400;
  }
  res.status(statusCode).json({
    error: err.message || "Internal Server Error",
    correlationId: req.correlationId,
  });
});

app.listen(port, () => {
  console.log(`[${serviceName}] listening on port ${port}`);
});
