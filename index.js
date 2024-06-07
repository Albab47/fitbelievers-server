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

// function to verify token
const verifyToken = (req, res, next) => {
  const secretKey = process.env.ACCESS_TOKEN_SECRET;
  const token = req.headers.authorization.split(" ")[1];

  if (!token) {
    return res.status(401).send({ message: "unauthorized access" });
  }

  if (token) {
    jwt.verify(token, secretKey, (err, decoded) => {
      if (err) {
        return res.status(401).send({ message: "unauthorized access" });
      } else {
        req.user = decoded;
        next();
      }
    });
  }
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
    // Collections
    const db = client.db("fitBelievers");
    const userCollection = db.collection("users");
    const classCollection = db.collection("classes");
    const trainerCollection = db.collection("trainers");
    const appliedTrainerCollection = db.collection("appliedTrainers");
    const slotCollection = db.collection("slots");

    /* ----------- Auth related apis ------------ */

    // Generate token for user
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = generateToken(user);
      res.send({ token });
    });

    // ------------- User related api ---------------
    app.post("/users", async (req, res) => {
      const user = req.body;
      const existedUser = await userCollection.findOne({ email: user.email });
      if (existedUser) {
        return res.send({ message: "user already existed" });
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    app.get("/users/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const user = await userCollection.findOne({ email });
      res.send(user);
    });

    /* ----------- Service related api ------------ */

    // --------------- Classes Apis -------------------
     
    // Get top 6 most booked classes data from db
    app.get("/top-classes", async (req, res) => {
      const options = {
        sort: { numberOfBookings: -1 },
        projection: { name: 1, description: 1, image: 1, numberOfBookings: 1 },
      };
      const classes = await classCollection
        .find({}, options)
        .limit(6)
        .toArray();
      res.send(classes);
    });

    // Get all classes data from db
    app.get("/classes", async (req, res) => {
      const classes = await classCollection.find().toArray();
      res.send(classes);
    });

    // Get single class data from db
    app.get("/classes/:id", async (req, res) => {
      const query = {_id: new ObjectId(req.params.id)}
      const classData = await classCollection.findOne(query);
      res.send(classData);
    });

    // ------------- Applied Trainer Apis -------------------

    // Save applied trainer data to db
    app.post("/applied-trainers", verifyToken, async (req, res) => {
      const trainerData = req.body;
      console.log(trainerData);
      const result = await appliedTrainerCollection.insertOne(trainerData);
      res.send(result);
    });

    // Get applied trainers data from db
    app.get("/applied-trainers", async (req, res) => {
      const trainers = await appliedTrainerCollection.find().toArray();
      res.send(trainers);
    });

    // Remove applied trainer and change users status to trainer
    app.delete("/applied-trainers/:id", async (req, res) => {
      const query = {_id: new ObjectId(req.params.id)}
      const result = await appliedTrainerCollection.deleteOne(query);
      res.send(result);
    });

    // ---------------- Trainer Apis -------------------

    // Get trainers data from db (Team)
    app.get("/trainers", async (req, res) => { 
      const sort = req.query.sort;
      const limit = parseInt(req.query.limit);
      let options = {}

      if(sort === "team") {
        options = {
          projection: { name: 1, photo: 1, background: 1, specializations: 1 },
        };
      }
      const teams = await trainerCollection
        .find({}, options)
        .limit(limit)
        .toArray();
      res.send(teams);
    });

    // Get single trainer data from db
    app.get("/trainers/:id", async (req, res) => {
      const query = {_id: new ObjectId(req.params.id)}
      const trainer = await trainerCollection.findOne(query);
      res.send(trainer);
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
