import crypto from "node:crypto";

const orders = [];
const orderAuditLogs = [];
const idempotencyRecords = new Map();

function cloneState() {
  return {
    orders: structuredClone(orders),
    orderAuditLogs: structuredClone(orderAuditLogs),
    idempotencyRecords: structuredClone(Object.fromEntries(idempotencyRecords)),
  };
}

function restoreState(snapshot) {
  orders.length = 0;
  orderAuditLogs.length = 0;
  orders.push(...snapshot.orders);
  orderAuditLogs.push(...snapshot.orderAuditLogs);

  idempotencyRecords.clear();
  const restored = snapshot.idempotencyRecords || {};
  Object.entries(restored).forEach(([key, value]) => {
    idempotencyRecords.set(key, value);
  });
}

function runLocalTransaction(work) {
  const snapshot = cloneState();

  try {
    return work();
  } catch (error) {
    restoreState(snapshot);
    throw error;
  }
}

function addOrder(order) {
  orders.push(order);
  return order;
}

function addOrderAuditLog(auditRecord) {
  orderAuditLogs.push({
    id: `audit-${crypto.randomUUID()}`,
    createdAt: new Date().toISOString(),
    ...auditRecord,
  });

  return orderAuditLogs[orderAuditLogs.length - 1];
}

function getOrderById(orderId) {
  return orders.find((order) => order.id === orderId) || null;
}

function getOrdersByUserId(userId) {
  return orders.filter((order) => order.userId === userId);
}

function getAllOrders() {
  return [...orders];
}

function getOrderAuditLogs(orderId = null) {
  if (!orderId) {
    return [...orderAuditLogs];
  }

  return orderAuditLogs.filter((log) => log.orderId === orderId);
}

function updateOrder(orderId, updates) {
  const index = orders.findIndex((order) => order.id === orderId);
  if (index === -1) {
    return null;
  }

  orders[index] = {
    ...orders[index],
    ...updates,
    id: orderId,
    updatedAt: new Date().toISOString(),
  };

  return orders[index];
}

function makeIdempotencyRecordKey(userId, idempotencyKey) {
  return `${userId}::${idempotencyKey}`;
}

function saveIdempotencyRecord({ userId, idempotencyKey, orderId }) {
  const recordKey = makeIdempotencyRecordKey(userId, idempotencyKey);
  idempotencyRecords.set(recordKey, {
    userId,
    idempotencyKey,
    orderId,
    createdAt: new Date().toISOString(),
  });

  return idempotencyRecords.get(recordKey);
}

function getIdempotencyRecord(userId, idempotencyKey) {
  const recordKey = makeIdempotencyRecordKey(userId, idempotencyKey);
  return idempotencyRecords.get(recordKey) || null;
}

export {
  runLocalTransaction,
  addOrder,
  addOrderAuditLog,
  getOrderById,
  getOrdersByUserId,
  getAllOrders,
  getOrderAuditLogs,
  updateOrder,
  saveIdempotencyRecord,
  getIdempotencyRecord,
};
