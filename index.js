const express = require("express");
const app = express();
const cors = require("cors");
require("dotenv").config();
const dns = require("dns");
dns.setServers(["1.1.1.1", "8.8.8.8"]);
const port = process.env.PORT || 8000;

// Middleware
app.use(
  cors({
    origin: ["http://localhost:3000", "http://localhost:3001"],
    credentials: true,
  }),
);
app.use(express.json());

// MongoDB Connection
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = process.env.DB_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // await client.connect();
    console.log("✅ Connected to MongoDB");

    const productsCollection = client.db("GolpoStore").collection("products");
    const usersCollection = client.db("GolpoStore").collection("users");

    // ============= USER ROUTES =============

    // Get all users
    app.get("/api/users", async (req, res) => {
      const users = await usersCollection.find().toArray();
      res.send(users);
    });

    // Get user by email
    app.get("/api/users/:email", async (req, res) => {
      const email = req.params.email;
      const result = await usersCollection.findOne({ email });
      res.send(result);
    });

    // Update user (PATCH) - for partial updates
    app.patch("/api/users/:email", async (req, res) => {
      const { email } = req.params;
      const { name, phone, address, photo, role } = req.body;

      const filter = { email: email };
      const updateDoc = {
        $set: {
          ...(name !== undefined && { name }),
          ...(phone !== undefined && { phone }),
          ...(address !== undefined && { address }),
          ...(photo !== undefined && { photo }),
          ...(role !== undefined && { role }),
          updatedAt: new Date(),
        },
      };

      try {
        const result = await usersCollection.updateOne(filter, updateDoc);

        if (result.matchedCount === 0) {
          return res.status(404).send({ error: "User not found" });
        }

        const updatedUser = await usersCollection.findOne({ email });
        res.send({
          success: true,
          message: "User updated successfully",
          user: updatedUser,
        });
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: "Failed to update user" });
      }
    });

    // Create or Update user (PUT) - full upsert
    app.put("/api/user", async (req, res) => {
      try {
        const user = req.body;
        const query = { email: user?.email };

        const updateDoc = {
          $set: {
            email: user.email,
            name: user.name || "",
            photo: user.photo || "",
            phone: user.phone || "",
            address: user.address || "",
            role: user.role || "user",
            updatedAt: new Date(),
          },
          $setOnInsert: {
            createdAt: new Date(),
          },
        };

        const options = { upsert: true };
        const result = await usersCollection.updateOne(
          query,
          updateDoc,
          options,
        );

        const updatedUser = await usersCollection.findOne({
          email: user.email,
        });
        res.send({
          success: true,
          message: "User saved successfully",
          user: updatedUser,
        });
      } catch (error) {
        console.error("Error saving user:", error);
        res.status(500).send({ error: "Failed to save user" });
      }
    });

    // Delete user (DELETE)
    app.delete("/api/users/:email", async (req, res) => {
      const { email } = req.params;

      try {
        const result = await usersCollection.deleteOne({ email });

        if (result.deletedCount === 0) {
          return res.status(404).send({ error: "User not found" });
        }

        res.send({ success: true, message: "User deleted successfully" });
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: "Failed to delete user" });
      }
    });

    // ============= LOGOUT =============
    app.get("/api/logout", async (req, res) => {
      try {
        res
          .clearCookie("token", {
            maxAge: 0,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
          })
          .send({ success: true, message: "Logged out successfully" });
      } catch (err) {
        res.status(500).send({ success: false, error: err.message });
      }
    });

    // ============= PRODUCT ROUTES =============

    // CREATE PRODUCT (POST)
    app.post("/api/products", async (req, res) => {
      try {
        const product = req.body;

        if (!product.name || !product.price) {
          return res.status(400).send({
            success: false,
            error: "Name and price are required",
          });
        }

        product.description = product.description || "";
        product.features = product.features || [];
        product.specifications = product.specifications || {};
        product.colors = product.colors || [];
        product.images = product.images || [];
        product.quantity = product.quantity || 0;
        product.category = product.category || "Uncategorized";
        product.createdAt = new Date();

        const result = await productsCollection.insertOne(product);
        const createdProduct = await productsCollection.findOne({
          _id: result.insertedId,
        });

        res.status(201).send({
          success: true,
          message: "Product created successfully",
          product: createdProduct,
        });
      } catch (error) {
        console.error("Error creating product:", error);
        res
          .status(500)
          .send({ success: false, error: "Failed to create product" });
      }
    });

    // GET ALL PRODUCTS
    app.get("/api/products", async (req, res) => {
      try {
        const { category, search, limit = 100, page = 1 } = req.query;
        let query = {};

        if (category) {
          query.category = category;
        }

        if (search) {
          query.name = { $regex: search, $options: "i" };
        }

        const products = await productsCollection
          .find(query)
          .skip((parseInt(page) - 1) * parseInt(limit))
          .limit(parseInt(limit))
          .toArray();

        const total = await productsCollection.countDocuments(query);

        res.send({
          success: true,
          products,
          total,
          page: parseInt(page),
          pages: Math.ceil(total / parseInt(limit)),
        });
      } catch (error) {
        console.error("Error fetching products:", error);
        res
          .status(500)
          .send({ success: false, error: "Failed to fetch products" });
      }
    });

    // GET SINGLE PRODUCT BY _id
    app.get("/api/products/:id", async (req, res) => {
      try {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
          return res
            .status(400)
            .send({ success: false, error: "Invalid product ID" });
        }

        const product = await productsCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!product) {
          return res
            .status(404)
            .send({ success: false, error: "Product not found" });
        }

        res.send({ success: true, product });
      } catch (error) {
        console.error("Error fetching product:", error);
        res
          .status(500)
          .send({ success: false, error: "Failed to fetch product" });
      }
    });

    // UPDATE PRODUCT
    app.put("/api/products/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const product = req.body;

        if (!ObjectId.isValid(id)) {
          return res
            .status(400)
            .send({ success: false, error: "Invalid product ID" });
        }

        delete product._id;

        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            ...product,
            updatedAt: new Date(),
          },
        };

        const result = await productsCollection.updateOne(filter, updateDoc);

        if (result.matchedCount === 0) {
          return res
            .status(404)
            .send({ success: false, error: "Product not found" });
        }

        const updatedProduct = await productsCollection.findOne({
          _id: new ObjectId(id),
        });

        res.send({
          success: true,
          message: "Product updated successfully",
          product: updatedProduct,
        });
      } catch (error) {
        console.error("Error updating product:", error);
        res
          .status(500)
          .send({ success: false, error: "Failed to update product" });
      }
    });

    // DELETE PRODUCT
    app.delete("/api/products/:id", async (req, res) => {
      try {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
          return res
            .status(400)
            .send({ success: false, error: "Invalid product ID" });
        }

        const result = await productsCollection.deleteOne({
          _id: new ObjectId(id),
        });

        if (result.deletedCount === 0) {
          return res
            .status(404)
            .send({ success: false, error: "Product not found" });
        }

        res.send({
          success: true,
          message: "Product deleted successfully",
        });
      } catch (error) {
        console.error("Error deleting product:", error);
        res
          .status(500)
          .send({ success: false, error: "Failed to delete product" });
      }
    });

    // GET PRODUCTS BY CATEGORY
    app.get("/api/products/category/:category", async (req, res) => {
      try {
        const { category } = req.params;
        const products = await productsCollection.find({ category }).toArray();
        res.send({ success: true, products });
      } catch (error) {
        console.error("Error fetching products by category:", error);
        res
          .status(500)
          .send({ success: false, error: "Failed to fetch products" });
      }
    });

    // SEARCH PRODUCTS
    app.get("/api/products/search/:query", async (req, res) => {
      try {
        const { query } = req.params;
        const products = await productsCollection
          .find({
            $or: [
              { name: { $regex: query, $options: "i" } },
              { category: { $regex: query, $options: "i" } },
            ],
          })
          .toArray();
        res.send({ success: true, products });
      } catch (error) {
        console.error("Error searching products:", error);
        res
          .status(500)
          .send({ success: false, error: "Failed to search products" });
      }
    });

    // GET ALL CATEGORIES
    app.get("/api/categories", async (req, res) => {
      try {
        const categories = await productsCollection.distinct("category");
        res.send({ success: true, categories });
      } catch (error) {
        console.error("Error fetching categories:", error);
        res
          .status(500)
          .send({ success: false, error: "Failed to fetch categories" });
      }
    });

    // GET FLASH SALE PRODUCTS
    app.get("/api/flash-sale", async (req, res) => {
      try {
        const products = await productsCollection
          .find({ isFlashSale: true })
          .toArray();
        res.send({ success: true, products });
      } catch (error) {
        console.error("Error fetching flash sale:", error);
        res
          .status(500)
          .send({ success: false, error: "Failed to fetch flash sale" });
      }
    });

    // Start server
    app.listen(port, () => {
      console.log(`🚀 Server is running on port ${port}`);
      console.log(`📦 Product API: http://localhost:${port}/api/products`);
    });
  } catch (error) {
    console.error("❌ Failed to connect to MongoDB:", error.message);
  }
}

run().catch(console.dir);

// Root route
app.get("/", (req, res) => {
  res.send("GolpoStore Product API is running 🚀");
});
