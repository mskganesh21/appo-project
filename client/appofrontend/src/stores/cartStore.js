import { create } from "zustand";
import { apiRequest } from "../api/http";

export const useCartStore = create((set, get) => ({
  cart: null,
  busy: false,

  loadCart: async (token) => {
    set({ busy: true });
    try {
      const result = await apiRequest("/api/cart", {}, token);
      set({ cart: result });
      return result;
    } finally {
      set({ busy: false });
    }
  },

  addToCart: async (product, token) => {
    set({ busy: true });
    try {
      await apiRequest(
        "/api/cart/items",
        {
          method: "POST",
          body: {
            productId: product.id,
            quantity: 1,
            price: product.price,
          },
        },
        token,
      );

      await get().loadCart(token);
    } finally {
      set({ busy: false });
    }
  },
}));
