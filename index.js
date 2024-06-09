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
    const subscriberCollection = db.collection("subscribers");
    const reviewCollection = db.collection("reviews");
    const blogCollection = db.collection("blogs");

    // Middlewares
    const verifyAdmin = async (req, res, next) => {
      const email = req.user.email;
      const user = await userCollection.findOne({ email });
      if (user.role !== "admin") {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    const verifyTrainer = async (req, res, next) => {
      const email = req.user.email;
      console.log(email);
      const user = await userCollection.findOne({ email });
      if (user?.role !== "trainer") {
        return res.status(404).send({ message: "forbidden access" });
      }
      next();
    };

    /* --------------- Auth related apis -------------- */

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

    /* --------------  Service related api ------------ */

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

    // Save new class data to db
    app.post("/classes", verifyToken, verifyAdmin, async (req, res) => {
      const classData = req.body;
      console.log(classData);
      const result = await classCollection.insertOne(classData);
      res.send(result);
    });

    // Get all classes data from db
    app.get("/classes", async (req, res) => {
      const size = parseInt(req.query.size);
      const page = parseInt(req.query.page) - 1;
      let options = {};
      if (req.query.optionData) {
        options = {
          projection: { _id: 0, name: 1 },
        };
      }

      const classes = await classCollection
        .find({}, options)
        .skip(page * size)
        .limit(size)
        .toArray();
      res.send(classes);
    });

    // Get single class data from db
    app.get("/classes/:id", async (req, res) => {
      const query = { _id: new ObjectId(req.params.id) };
      const classData = await classCollection.findOne(query);
      res.send(classData);
    });

    // Get classes data count
    app.get("/classes-count", async (req, res) => {
      const count = await classCollection.estimatedDocumentCount();
      res.send({ count });
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
    app.get("/applied-trainers", verifyToken, verifyAdmin, async (req, res) => {
      const trainers = await appliedTrainerCollection.find().toArray();
      res.send(trainers);
    });

    // Get single applied trainers data from db
    app.get(
      "/applied-trainers/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const query = { _id: new ObjectId(req.params.id) };
        const applicant = await appliedTrainerCollection.findOne(query);
        res.send(applicant);
      }
    );

    // Remove applied trainer and change users status to trainer
    app.delete("/applied-trainers/:id", async (req, res) => {
      const query = { _id: new ObjectId(req.params.id) };
      const result = await appliedTrainerCollection.deleteOne(query);
      res.send(result);
    });

    // ----------------- Trainer Apis -------------------

    // Get trainers/team data from db
    app.get("/trainers", async (req, res) => {
      const sort = req.query.sort;
      const limit = parseInt(req.query.limit);
      let options = {};

      if (sort === "team") {
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
      const query = { _id: new ObjectId(req.params.id) };
      const trainer = await trainerCollection.findOne(query);
      res.send(trainer);
    });

    // Get single trainer data by email from db
    app.get("/trainer/:email", async (req, res) => {
      const query = { email: req.params.email };
      const trainer = await trainerCollection.findOne(query);
      res.send(trainer);
    });

    // remove trainer from applicant and save to trainer data
    app.post("/trainers", verifyToken, verifyAdmin, async (req, res) => {
      const trainerData = req.body;
      const email = trainerData.email;

      // Change status from member to trainer
      const updateDoc = {
        $set: { role: "trainer" },
      };
      const userResult = await userCollection.updateOne({ email }, updateDoc);
      if (userResult.modifiedCount === 0) return;
      console.log(userResult);

      // Delete trainer from applied trainer collection
      const deleteResult = await appliedTrainerCollection.deleteOne({ email });
      console.log(deleteResult);

      if (deleteResult.deletedCount === 1) {
        const result = await trainerCollection.insertOne(trainerData);
        res.send(result);
      }
    });

    // Delete a trainer
    app.delete("/trainers/:id", async (req, res) => {
      const query = { _id: new ObjectId(req.params.id) };
      const result = await trainerCollection.deleteOne(query);
      res.send(result);
    });

    // --------------- Trainer slot Apis -------------------

    // Save new slot data to db and save trainer info to class
    app.post("/slots", verifyToken, verifyTrainer, async (req, res) => {
      const slotData = req.body;
      const classes = req.body.classesIncludes;

      // Check if trainer exist

      // update any class that name matches with classes
      const filter = { name: { $in: [...classes] } };
      // Add trainer data to each class they offer
      const updateDoc = {
        $push: {
          trainers: {
            name: slotData.trainer?.name,
            email: slotData.trainer?.email,
            photo: slotData.trainer?.photo,
          },
        },
      };
      const updateResult = await classCollection.updateMany(filter, updateDoc);
      const result = await slotCollection.insertOne(slotData);
      res.send(result);
    });

    // Get slots data by email from db
    app.get("/slots/:email", async (req, res) => {
      const slots = await slotCollection.find().toArray();
      res.send(slots);
    });

    // Delete slot data by email from db
    app.delete("/slots/:id", async (req, res) => {
      const query = { _id: new ObjectId(req.params.id) };
      const result = await slotCollection.deleteOne(query);
      res.send(result);
    });

    // --------------- Community posts -----------------

    // Save blog posts data to db
    app.post("/blogs", async (req, res) => {
      const blogData = req.body;
      const result = await blogCollection.insertOne(blogData);
      res.send(result);
    });

    // Get all blogs data from db
    app.get("/blogs", async (req, res) => {
      const blogs = await blogCollection.find().toArray();
      res.send(blogs);
    });

    // --------------- Newsletter & Reviews -----------------

    // Save new Newsletter Subscriber
    app.post("/newsletter-subscribers", async (req, res) => {
      const userData = req.body;
      const result = await subscriberCollection.insertOne(userData);
      res.send(result);
    });

    // Get all subscribers data from db
    app.get("/newsletter-subscribers", async (req, res) => {
      const subscribers = await subscriberCollection.find().toArray();
      res.send(subscribers);
    });

    // Save reviews to db
    app.post("/reviews", async (req, res) => {
      const reviewData = req.body;
      console.log(reviewData);
      const result = await reviewCollection.insertOne(reviewData);
      res.send(result);
    });

    // Get all subscribers data from db
    app.get("/reviews", async (req, res) => {
      const reviews = await subscriberCollection.find().toArray();
      res.send(reviews);
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
