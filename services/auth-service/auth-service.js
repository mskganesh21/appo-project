import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const jwtSecret = process.env.JWT_SECRET || "your-secret-key-change-in-prod";

let users = []; // In-memory store for demo

async function signup({ email, name, password }) {
  const existingUser = users.find((u) => u.email === email);
  if (existingUser) {
    throw new Error("User already exists");
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const user = {
    id: uuidv4(),
    email,
    name,
    password: hashedPassword,
    role: "user",
    createdAt: new Date().toISOString(),
  };

  users.push(user);

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  };
}

async function login({ email, password }) {
  const user = users.find((u) => u.email === email);
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
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
  };
}

function verifyToken(token) {
  try {
    return jwt.verify(token, jwtSecret);
  } catch (err) {
    throw new Error("Invalid token");
  }
}

export { signup, login, verifyToken };
