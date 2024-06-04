const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const express = require("express");
const jwt = require("jsonwebtoken");
const cors = require("cors");
require("dotenv").config();
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.173efa4.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const port = process.env.PORT || 5000;
const app = express();

const corsOptions = {
  origin: ["http://localhost:5173", "http://localhost:5174"],
};

// Middlewares
app.use(cors(corsOptions));
app.use(express.json());

// function to generate token
const generateToken = (payload) => {
  const secretKey = process.env.ACCESS_TOKEN_SECRET;
  const options = {
    expiresIn: "7d",
  };
  const token = jwt.sign(payload, secretKey, options);
  return token;
};

// Create a MongoClient
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    const db = client.db("fitBelievers");
    const userCollection = db.collection("users");

    /* ----------- Auth related apis ------------ */

    // Generate token for user
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = generateToken(user);
      res.send({ token });
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    // successful connection ping msg
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

// Testing
app.get("/", (req, res) => {
  res.send("fitBelievers server is running");
});
app.listen(port, () => {
  console.log(`Server is running on port: ${port}`);
});
