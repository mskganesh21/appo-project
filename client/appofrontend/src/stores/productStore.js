import { create } from "zustand";
import { apiRequest } from "../api/http";

export const useProductStore = create((set) => ({
  products: [],
  busy: false,

  loadProducts: async () => {
    set({ busy: true });
    try {
      const result = await apiRequest("/graphql", {
        method: "POST",
        body: {
          query: `
            query Products($limit:Int,$offset:Int) {
              products(limit:$limit, offset:$offset) {
                items { id name category price stock unit description }
                total
              }
            }
          `,
          variables: { limit: 40, offset: 0 },
        },
      });

      if (result.errors?.length) {
        throw new Error(result.errors[0].message);
      }

      set({ products: result.data.products.items });
      return result.data.products.items;
    } finally {
      set({ busy: false });
    }
  },
}));




