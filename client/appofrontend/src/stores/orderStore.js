import { create } from "zustand";
import { apiRequest } from "../api/http";

export const useOrderStore = create((set) => ({
  orders: [],
  busy: false,

  loadMyOrders: async (token) => {
    set({ busy: true });
    try {
      const result = await apiRequest("/api/orders/me", {}, token);
      set({ orders: result.items || [] });
      return result;
    } finally {
      set({ busy: false });
    }
  },

  loadAdminOrders: async (token) => {
    set({ busy: true });
    try {
      const result = await apiRequest("/api/orders/admin", {}, token);
      set({ orders: result.items || [] });
      return result;
    } finally {
      set({ busy: false });
    }
  },
}));




