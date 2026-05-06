import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const jwtSecret = process.env.JWT_SECRET || "your-secret-key-change-in-prod";
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);
const ROLES = new Set(["user", "admin"]);

let users = []; // In-memory store for demo

function toSafeUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  };
}

async function signup({ email, name, password, role = "user" }) {
  const normalizedEmail = email.toLowerCase();
  const requestedRole = String(role || "user").toLowerCase();

  if (!ROLES.has(requestedRole)) {
    throw new Error("Invalid role");
  }

  if (requestedRole === "admin" && !ADMIN_EMAILS.includes(normalizedEmail)) {
    throw new Error("Forbidden role assignment");
  }

  const existingUser = users.find((u) => u.email === normalizedEmail);
  if (existingUser) {
    throw new Error("User already exists");
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const user = {
    id: uuidv4(),
    email: normalizedEmail,
    name,
    password: hashedPassword,
    role: requestedRole,
    createdAt: new Date().toISOString(),
  };

  users.push(user);

  return toSafeUser(user);
}

async function login({ email, password }) {
  const normalizedEmail = email.toLowerCase();
  const user = users.find((u) => u.email === normalizedEmail);
  if (!user) {
    throw new Error("User not found");
  }

  const passwordMatch = await bcrypt.compare(password, user.password);
  if (!passwordMatch) {
    throw new Error("Invalid password");
  }

  const token = jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
    },
    jwtSecret,
    { expiresIn: "24h" },
  );

  return {
    token,
    user: toSafeUser(user),
  };
}

function verifyToken(token) {
  try {
    return jwt.verify(token, jwtSecret);
  } catch (err) {
    throw new Error("Invalid token");
  }
}

async function seedAdminUser() {
  const adminEmail = (process.env.DEFAULT_ADMIN_EMAIL || "")
    .trim()
    .toLowerCase();
  const adminPassword = (process.env.DEFAULT_ADMIN_PASSWORD || "").trim();
  const adminName = (process.env.DEFAULT_ADMIN_NAME || "Admin").trim();

  if (!adminEmail || !adminPassword) {
    return null;
  }

  const existing = users.find((u) => u.email === adminEmail);
  if (existing) {
    return toSafeUser(existing);
  }

  const hashedPassword = await bcrypt.hash(adminPassword, 10);
  const adminUser = {
    id: uuidv4(),
    email: adminEmail,
    name: adminName,
    password: hashedPassword,
    role: "admin",
    createdAt: new Date().toISOString(),
  };

  users.push(adminUser);
  return toSafeUser(adminUser);
}

export { signup, login, verifyToken, seedAdminUser };
