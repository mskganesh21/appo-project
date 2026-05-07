import { v4 as uuidv4 } from "uuid";

let carts = {}; // { userId: { userId, items: [{ productId, quantity, price }], totalAmount } }

function addToCart({ userId, productId, quantity, price }) {
  if (!userId || !productId || !quantity || !price) {
    throw new Error("Missing required fields");
  }

  if (!carts[userId]) {
    carts[userId] = {
      userId,
      items: [],
      totalAmount: 0,
    };
  }

  const existingItem = carts[userId].items.find(
    (i) => i.productId === productId,
  );

  if (existingItem) {
    existingItem.quantity += quantity;
  } else {
    carts[userId].items.push({
      id: uuidv4(),
      productId,
      quantity,
      price,
    });
  }

  calculateTotal(userId);
  return carts[userId];
}

function updateCartItem({ userId, itemId, quantity }) {
  if (!carts[userId]) {
    throw new Error("Cart not found");
  }

  const item = carts[userId].items.find((i) => i.id === itemId);
  if (!item) {
    throw new Error("Item not found in cart");
  }

  if (quantity <= 0) {
    carts[userId].items = carts[userId].items.filter((i) => i.id !== itemId);
  } else {
    item.quantity = quantity;
  }

  calculateTotal(userId);
  return carts[userId];
}

function removeFromCart({ userId, itemId }) {
  if (!carts[userId]) {
    throw new Error("Cart not found");
  }

  carts[userId].items = carts[userId].items.filter((i) => i.id !== itemId);
  calculateTotal(userId);

  return carts[userId];
}

function getCart(userId) {
  if (!carts[userId]) {
    return {
      userId,
      items: [],
      totalAmount: 0,
    };
  }

  return carts[userId];
}

function clearCart(userId) {
  if (carts[userId]) {
    carts[userId].items = [];
    carts[userId].totalAmount = 0;
  }
}

function calculateTotal(userId) {
  if (!carts[userId]) return;

  carts[userId].totalAmount = carts[userId].items.reduce((sum, item) => {
    return sum + item.price * item.quantity;
  }, 0);
}

export { addToCart, updateCartItem, removeFromCart, getCart, clearCart };
