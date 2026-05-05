import { v4 as uuidv4 } from "uuid";

const defaultProducts = [
  {
    id: uuidv4(),
    name: "Fresh Apples",
    category: "fruit",
    price: 120,
    stock: 50,
    unit: "kg",
    description: "Crisp and juicy apples",
    imageUrl: "https://via.placeholder.com/150?text=Apples",
  },
  {
    id: uuidv4(),
    name: "Organic Carrots",
    category: "vegetable",
    price: 60,
    stock: 100,
    unit: "kg",
    description: "Fresh organic carrots",
    imageUrl: "https://via.placeholder.com/150?text=Carrots",
  },
  {
    id: uuidv4(),
    name: "Ripe Bananas",
    category: "fruit",
    price: 45,
    stock: 75,
    unit: "kg",
    description: "Golden ripe bananas",
    imageUrl: "https://via.placeholder.com/150?text=Bananas",
  },
  {
    id: uuidv4(),
    name: "Broccoli",
    category: "vegetable",
    price: 90,
    stock: 40,
    unit: "kg",
    description: "Fresh green broccoli",
    imageUrl: "https://via.placeholder.com/150?text=Broccoli",
  },
];

let products = [...defaultProducts];

function listProducts({ category = null, limit = 100, offset = 0 }) {
  let filtered = products;

  if (category) {
    filtered = filtered.filter((p) => p.category === category);
  }

  const total = filtered.length;
  const items = filtered.slice(offset, offset + limit);

  return { items, total };
}

function getProductById(id) {
  const product = products.find((p) => p.id === id);
  if (!product) {
    throw new Error("Product not found");
  }
  return product;
}

function createProduct({
  name,
  category,
  price,
  stock,
  unit,
  description,
  imageUrl,
}) {
  if (!name || !category || price === undefined || stock === undefined) {
    throw new Error("Missing required fields");
  }

  const product = {
    id: uuidv4(),
    name,
    category,
    price,
    stock,
    unit: unit || "kg",
    description: description || "",
    imageUrl: imageUrl || "https://via.placeholder.com/150",
    createdAt: new Date().toISOString(),
  };

  products.push(product);
  return product;
}

function updateProduct(id, updates) {
  const product = products.find((p) => p.id === id);
  if (!product) {
    throw new Error("Product not found");
  }

  const updated = {
    ...product,
    ...updates,
    id,
    updatedAt: new Date().toISOString(),
  };
  const idx = products.findIndex((p) => p.id === id);
  products[idx] = updated;

  return updated;
}

function updateStock(id, quantity) {
  const product = products.find((p) => p.id === id);
  if (!product) {
    throw new Error("Product not found");
  }

  if (product.stock + quantity < 0) {
    throw new Error("Insufficient stock");
  }

  product.stock += quantity;
  return product;
}

export {
  listProducts,
  getProductById,
  createProduct,
  updateProduct,
  updateStock,
};
