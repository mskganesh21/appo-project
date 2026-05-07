import express from "express";
import dotenv from "dotenv";
import crypto from "node:crypto";
import {
  addToCart,
  updateCartItem,
  removeFromCart,
  getCart,
  clearCart,
} from "./cart-service.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 4003;
const serviceName = process.env.SERVICE_NAME || "cart-service";

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
  res.json({ service: serviceName, message: "cart service is up" });
});

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: serviceName,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.post("/cart/items", (req, res, next) => {
  try {
    const { userId, productId, quantity, price } = req.body;

    if (!userId || !productId || !quantity || !price) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const cart = addToCart({ userId, productId, quantity, price });
    res.status(201).json(cart);
  } catch (error) {
    next(error);
  }
});

app.put("/cart/items/:itemId", (req, res, next) => {
  try {
    const { userId, quantity } = req.body;

    if (!userId || quantity === undefined) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const cart = updateCartItem({
      userId,
      itemId: req.params.itemId,
      quantity,
    });
    res.json(cart);
  } catch (error) {
    next(error);
  }
});

app.delete("/cart/items/:itemId", (req, res, next) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "Missing userId" });
    }

    const cart = removeFromCart({ userId, itemId: req.params.itemId });
    res.json(cart);
  } catch (error) {
    next(error);
  }
});

app.get("/cart/:userId", (req, res, next) => {
  try {
    const cart = getCart(req.params.userId);
    res.json(cart);
  } catch (error) {
    next(error);
  }
});

app.post("/cart/:userId/clear", (req, res, next) => {
  try {
    clearCart(req.params.userId);
    res.json({ message: "Cart cleared", userId: req.params.userId });
  } catch (error) {
    next(error);
  }
});

app.use((_req, res) => {
  res.status(404).json({ error: "Not Found" });
});

app.use((err, req, res, _next) => {
  console.error(`[${serviceName}] error cid=${req.correlationId}`, err);
  const statusCode = err.message.includes("not found") ? 404 : 400;
  res.status(statusCode).json({
    error: err.message || "Internal Server Error",
    correlationId: req.correlationId,
  });
});

app.listen(port, () => {
  console.log(`[${serviceName}] listening on port ${port}`);
});
