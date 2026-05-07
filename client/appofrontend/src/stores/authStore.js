import { create } from "zustand";
import { apiRequest } from "../api/http";

const STORAGE_TOKEN = "appo.token";
const STORAGE_USER = "appo.user";

function readUser() {
  try {
    const raw = localStorage.getItem(STORAGE_USER);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export const useAuthStore = create((set, get) => ({
  token: localStorage.getItem(STORAGE_TOKEN) || "",
  user: readUser(),
  busy: false,
  message: "Ready",

  setMessage: (message) => set({ message }),

  signup: async ({ name, email, password }) => {
    set({ busy: true });
    try {
      await apiRequest("/api/auth/signup", {
        method: "POST",
        body: { name, email, password },
      });
      set({ message: "Signup successful. Login now." });
    } catch (error) {
      set({ message: `Signup failed: ${error.message}` });
    } finally {
      set({ busy: false });
    }
  },

  login: async ({ email, password }) => {
    set({ busy: true });
    try {
      const result = await apiRequest("/api/auth/login", {
        method: "POST",
        body: { email, password },
      });

      localStorage.setItem(STORAGE_TOKEN, result.token);
      localStorage.setItem(STORAGE_USER, JSON.stringify(result.user));
      set({
        token: result.token,
        user: result.user,
        message: `Logged in as ${result.user.email}`,
      });
    } catch (error) {
      set({ message: `Login failed: ${error.message}` });
    } finally {
      set({ busy: false });
    }
  },

  verifySession: async () => {
    const token = get().token;
    if (!token) {
      return;
    }

    try {
      await apiRequest("/api/auth/verify", {}, token);
      set({ message: "Session verified" });
    } catch {
      get().logout();
      set({ message: "Session expired" });
    }
  },

  logout: () => {
    localStorage.removeItem(STORAGE_TOKEN);
    localStorage.removeItem(STORAGE_USER);
    set({ token: "", user: null, message: "Logged out" });
  },
}));
