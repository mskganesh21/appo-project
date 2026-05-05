import { getOrderById } from "../store/orderStore.js";

function getOrderByIdQuery(orderId) {
  const order = getOrderById(orderId);
  if (!order) {
    throw new Error("Order not found");
  }

  return order;
}

function getMyOrdersQuery(userId) {
  if (!userId) {
    throw new Error("userId is required");
  }

  return getOrdersByUserId(userId);
}

function getAdminOrdersQuery() {
  return getAllOrders();
}

export { getOrderByIdQuery, getMyOrdersQuery, getAdminOrdersQuery };
