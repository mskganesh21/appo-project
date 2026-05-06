import crypto from "node:crypto";

const orders = [];
const orderAuditLogs = [];

function cloneState() {
  return {
    orders: structuredClone(orders),
    orderAuditLogs: structuredClone(orderAuditLogs),
  };
}

function restoreState(snapshot) {
  orders.length = 0;
  orderAuditLogs.length = 0;
  orders.push(...snapshot.orders);
  orderAuditLogs.push(...snapshot.orderAuditLogs);
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

export {
  runLocalTransaction,
  addOrder,
  addOrderAuditLog,
  getOrderById,
  getOrdersByUserId,
  getAllOrders,
  getOrderAuditLogs,
  updateOrder,
};
