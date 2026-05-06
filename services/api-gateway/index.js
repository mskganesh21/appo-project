import express from "express";
import dotenv from "dotenv";
import crypto from "node:crypto";
import axios from "axios";
import jwt from "jsonwebtoken";
import { buildSchema } from "graphql";
import { createHandler } from "graphql-http/lib/use/express";

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;

const serviceName = process.env.SERVICE_NAME || "api-gateway";
const jwtSecret = process.env.JWT_SECRET || "your-secret-key-change-in-prod";

const serviceUrls = {
  auth: process.env.AUTH_SERVICE_URL || "http://localhost:4001",
  product: process.env.PRODUCT_SERVICE_URL || "http://localhost:4002",
  cart: process.env.CART_SERVICE_URL || "http://localhost:4003",
  order: process.env.ORDER_SERVICE_URL || "http://localhost:4004",
};

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

app.use((req, _res, next) => {
  const token = req.header("Authorization")?.replace("Bearer ", "");
  if (!token) {
    req.user = null;
    return next();
  }

  try {
    req.user = jwt.verify(token, jwtSecret);
  } catch (_err) {
    req.user = null;
  }

  next();
});

function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      error: "Unauthorized",
      correlationId: req.correlationId,
    });
  }

  next();
}

async function serviceRequest(req, serviceUrl, options) {
  const response = await axios({
    baseURL: serviceUrl,
    timeout: Number(process.env.GATEWAY_TIMEOUT_MS || 7000),
    ...options,
    headers: {
      "x-correlation-id": req.correlationId,
      ...(req.header("Authorization")
        ? { Authorization: req.header("Authorization") }
        : {}),
      ...(options.headers || {}),
    },
  });

  return response.data;
}

function handleUpstreamError(err, req, res) {
  const upstreamStatus = err.response?.status;
  const upstreamBody = err.response?.data;

  if (upstreamStatus) {
    return res.status(upstreamStatus).json({
      ...(typeof upstreamBody === "object"
        ? upstreamBody
        : { error: "Upstream service error" }),
      correlationId: req.correlationId,
    });
  }

  return res.status(502).json({
    error: "Bad Gateway",
    message: err.message,
    correlationId: req.correlationId,
  });
}

function requireAuthContext(context) {
  if (!context.req.user) {
    throw new Error("Unauthorized");
  }
}

const schema = buildSchema(`
  type Product {
    id: String!
    name: String!
    category: String!
    price: Float!
    stock: Int
    unit: String
    description: String
    imageUrl: String
    createdAt: String
    updatedAt: String
  }

  type ProductList {
    items: [Product!]!
    total: Int!
  }

  type CartItem {
    id: String!
    productId: String!
    quantity: Int!
    price: Float!
  }

  type Cart {
    userId: String!
    items: [CartItem!]!
    totalAmount: Float!
  }

  type OrderPayment {
    status: String
    paymentId: String
    paymentUrl: String
  }

  type Order {
    id: String!
    userId: String!
    items: [CartItem!]!
    totalAmount: Float!
    currency: String!
    status: String!
    payment: OrderPayment
    refundRequired: Boolean!
    failureReason: String
    refundReason: String
    createdAt: String
    updatedAt: String
  }

  type OrderConnection {
    items: [Order!]!
    count: Int!
  }

  type Query {
    products(category: String, limit: Int, offset: Int): ProductList!
    product(id: String!): Product
    cart(userId: String): Cart!
    myOrders(userId: String): OrderConnection!
  }
`);

const rootValue = {
  products: async ({ category, limit = 100, offset = 0 }, context) => {
    const data = await serviceRequest(context.req, serviceUrls.product, {
      method: "GET",
      url: "/products",
      params: { category, limit, offset },
    });
    return data;
  },
  product: async ({ id }, context) => {
    const data = await serviceRequest(context.req, serviceUrls.product, {
      method: "GET",
      url: `/products/${id}`,
    });
    return data;
  },
  cart: async ({ userId }, context) => {
    requireAuthContext(context);

    const resolvedUserId = userId || context.req.user.id;
    const data = await serviceRequest(context.req, serviceUrls.cart, {
      method: "GET",
      url: `/cart/${resolvedUserId}`,
    });

    return data;
  },
  myOrders: async ({ userId }, context) => {
    requireAuthContext(context);

    const resolvedUserId = userId || context.req.user.id;
    const data = await serviceRequest(context.req, serviceUrls.order, {
      method: "GET",
      url: `/orders/user/${resolvedUserId}`,
    });

    return data;
  },
};

app.get("/", (_req, res) => {
  res.json({ service: serviceName, message: "Gateway is up" });
});

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: serviceName,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.post("/api/auth/signup", async (req, res) => {
  try {
    const data = await serviceRequest(req, serviceUrls.auth, {
      method: "POST",
      url: "/signup",
      data: req.body,
    });
    res.status(201).json(data);
  } catch (err) {
    handleUpstreamError(err, req, res);
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const data = await serviceRequest(req, serviceUrls.auth, {
      method: "POST",
      url: "/login",
      data: req.body,
    });
    res.json(data);
  } catch (err) {
    handleUpstreamError(err, req, res);
  }
});

app.get("/api/auth/verify", requireAuth, (req, res) => {
  res.json({ valid: true, user: req.user, correlationId: req.correlationId });
});

app.post("/api/checkout", requireAuth, async (req, res) => {
  try {
    const payload = {
      ...req.body,
      userId: req.body.userId || req.user.id,
    };

    const data = await serviceRequest(req, serviceUrls.order, {
      method: "POST",
      url: "/checkout",
      data: payload,
    });
    res.status(201).json(data);
  } catch (err) {
    handleUpstreamError(err, req, res);
  }
});

app.use(
  "/graphql",
  createHandler({
    schema,
    rootValue,
    context: (req) => ({ req: req.raw }),
    formatError: (error) => ({
      message: error.message,
    }),
  }),
);

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
