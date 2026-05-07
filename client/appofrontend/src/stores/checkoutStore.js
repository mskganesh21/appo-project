import { create } from "zustand";
import { apiRequest } from "../api/http";

export const useCheckoutStore = create((set) => ({
  checkoutResult: null,
  busy: false,

  checkout: async (cartItems, token) => {
    set({ busy: true });
    try {
      const idemKey = `chk-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const result = await apiRequest(
        "/api/checkout",
        {
          method: "POST",
          headers: {
            "x-idempotency-key": idemKey,
          },
          body: {
            currency: "INR",
            items: cartItems.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              price: item.price,
            })),
          },
        },
        token,
      );

      set({ checkoutResult: result });
      return result;
    } finally {
      set({ busy: false });
    }
  },
}));



