import express from "express";
import dotenv from "dotenv";
import crypto from "node:crypto";
import {
  listProducts,
  getProductById,
  createProduct,
  updateProduct,
  updateStock,
} from "./product-service.js";

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

app.get("/products", (req, res, next) => {
  try {
    const category = req.query.category || null;
    const limit = Number.parseInt(req.query.limit, 10) || 100;
    const offset = Number.parseInt(req.query.offset, 10) || 0;

    const result = listProducts({ category, limit, offset });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.get("/products/:id", (req, res, next) => {
  try {
    const product = getProductById(req.params.id);
    res.json(product);
  } catch (error) {
    next(error);
  }
});

app.post("/products", (req, res, next) => {
  try {
    const { name, category, price, stock, unit, description, imageUrl } =
      req.body;

    const product = createProduct({
      name,
      category,
      price,
      stock,
      unit,
      description,
      imageUrl,
    });

    res.status(201).json(product);
  } catch (error) {
    next(error);
  }
});

app.put("/products/:id", (req, res, next) => {
  try {
    const updated = updateProduct(req.params.id, req.body);
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

app.post("/products/:id/stock", (req, res, next) => {
  try {
    const quantity = req.body.quantity || 0;
    const updated = updateStock(req.params.id, quantity);
    res.json(updated);
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
