const orders = [];

function addOrder(order) {
  orders.push(order);
  return order;
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

export { addOrder, getOrderById, getOrdersByUserId, getAllOrders, updateOrder };
