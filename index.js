const express = require("express");
const app = express();
const cors = require("cors");
require("dotenv").config();

const port = process.env.PORT || 8000;

// Middleware
app.use(
    cors({
        origin: ["http://localhost:3000", "http://localhost:3001"],
        credentials: true,
    })
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

        // ============= CREATE PRODUCT (POST) =============
        app.post("/api/products", async (req, res) => {
            try {
                const product = req.body;

                // Validate required fields
                if (!product.name || !product.price) {
                    return res.status(400).send({
                        success: false,
                        error: "Name and price are required",
                    });
                }

                // Set default values if not provided
                product.description = product.description || "";
                product.features = product.features || [];
                product.specifications = product.specifications || {};
                product.colors = product.colors || [];
                product.images = product.images || [];
                product.quantity = product.quantity || 0;
                product.category = product.category || "Uncategorized";
                product.createdAt = new Date();

                const result = await productsCollection.insertOne(product);

                // Get the created product with _id
                const createdProduct = await productsCollection.findOne({ _id: result.insertedId });

                res.status(201).send({
                    success: true,
                    message: "Product created successfully",
                    product: createdProduct,
                });
            } catch (error) {
                console.error("Error creating product:", error);
                res.status(500).send({ success: false, error: "Failed to create product" });
            }
        });

        // ============= GET ALL PRODUCTS (GET) =============
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
                res.status(500).send({ success: false, error: "Failed to fetch products" });
            }
        });

        // ============= GET SINGLE PRODUCT BY _id (GET) =============
        app.get("/api/products/:id", async (req, res) => {
            try {
                const { id } = req.params;

                if (!ObjectId.isValid(id)) {
                    return res.status(400).send({ success: false, error: "Invalid product ID" });
                }

                const product = await productsCollection.findOne({ _id: new ObjectId(id) });

                if (!product) {
                    return res.status(404).send({ success: false, error: "Product not found" });
                }

                res.send({ success: true, product });
            } catch (error) {
                console.error("Error fetching product:", error);
                res.status(500).send({ success: false, error: "Failed to fetch product" });
            }
        });

        // ============= UPDATE PRODUCT (PUT) =============
        app.put("/api/products/:id", async (req, res) => {
            try {
                const { id } = req.params;
                const product = req.body;

                if (!ObjectId.isValid(id)) {
                    return res.status(400).send({ success: false, error: "Invalid product ID" });
                }

                // Remove _id from update data if present
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
                    return res.status(404).send({ success: false, error: "Product not found" });
                }

                // Get updated product
                const updatedProduct = await productsCollection.findOne({ _id: new ObjectId(id) });

                res.send({
                    success: true,
                    message: "Product updated successfully",
                    product: updatedProduct,
                });
            } catch (error) {
                console.error("Error updating product:", error);
                res.status(500).send({ success: false, error: "Failed to update product" });
            }
        });

        // ============= DELETE PRODUCT (DELETE) =============
        app.delete("/api/products/:id", async (req, res) => {
            try {
                const { id } = req.params;

                if (!ObjectId.isValid(id)) {
                    return res.status(400).send({ success: false, error: "Invalid product ID" });
                }

                const result = await productsCollection.deleteOne({ _id: new ObjectId(id) });

                if (result.deletedCount === 0) {
                    return res.status(404).send({ success: false, error: "Product not found" });
                }

                res.send({
                    success: true,
                    message: "Product deleted successfully",
                });
            } catch (error) {
                console.error("Error deleting product:", error);
                res.status(500).send({ success: false, error: "Failed to delete product" });
            }
        });

        // ============= GET PRODUCTS BY CATEGORY (GET) =============
        app.get("/api/products/category/:category", async (req, res) => {
            try {
                const { category } = req.params;
                const products = await productsCollection.find({ category }).toArray();
                res.send({ success: true, products });
            } catch (error) {
                console.error("Error fetching products by category:", error);
                res.status(500).send({ success: false, error: "Failed to fetch products" });
            }
        });

        // ============= SEARCH PRODUCTS (GET) =============
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
                res.status(500).send({ success: false, error: "Failed to search products" });
            }
        });

        // ============= GET ALL CATEGORIES (GET) =============
        app.get("/api/categories", async (req, res) => {
            try {
                const categories = await productsCollection.distinct("category");
                res.send({ success: true, categories });
            } catch (error) {
                console.error("Error fetching categories:", error);
                res.status(500).send({ success: false, error: "Failed to fetch categories" });
            }
        });

        // ============= GET FLASH SALE PRODUCTS (GET) =============
        app.get("/api/flash-sale", async (req, res) => {
            try {
                const products = await productsCollection.find({ isFlashSale: true }).toArray();
                res.send({ success: true, products });
            } catch (error) {
                console.error("Error fetching flash sale:", error);
                res.status(500).send({ success: false, error: "Failed to fetch flash sale" });
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