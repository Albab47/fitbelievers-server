const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const express = require("express");
const jwt = require("jsonwebtoken");
const cors = require("cors");
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.173efa4.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const port = process.env.PORT || 5000;
const app = express();

const corsOptions = {
  origin: [
    "http://localhost:5173",
    "https://fitbelieversgym.web.app",
    "https://fitbelieversgym.firebaseapp.com",
  ],
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
    const postCollection = db.collection("posts");
    const cartCollection = db.collection("carts");
    const bookingCollection = db.collection("bookings");

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

    // Create Payment Intent
    app.post("/create-payment-intent", async (req, res) => {
      const price = req.body.price;
      const priceInCent = parseFloat(price) * 100;

      if (!price || priceInCent < 1) {
        return;
      }

      // Create a PaymentIntent with the order amount and currency
      const paymentIntent = await stripe.paymentIntents.create({
        amount: priceInCent,
        currency: "usd",
        automatic_payment_methods: {
          enabled: true,
        },
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
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
      const { email } = trainerData;
      console.log(trainerData);
      const updateDoc = {
        $set: {
          status: "pending",
        },
      };
      const statusResult = await userCollection.updateOne({ email }, updateDoc);

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
      const updateDoc = {
        $set: { role: "member" },
      };

      const result = await trainerCollection.deleteOne(query);
      const userResult = await userCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    // --------------- Trainer slot Apis -------------------

    // Save new slot data to db and save trainer info to class
    app.post("/slots", verifyToken, verifyTrainer, async (req, res) => {
      const slotData = req.body;
      const trainerId = slotData.trainer.id;
      const classes = req.body.classesIncludes;

      // update any class that name matches with classes
      const filter = { name: { $in: [...classes] } };
      // Add trainer data to each class they offer
      const updateDoc = {
        $push: {
          trainers: {
            name: slotData.trainer?.name,
            email: slotData.trainer?.email,
            photo: slotData.trainer?.photo,
            id: slotData.trainer?.id,
          },
        },
      };
      const updateResult = await classCollection.updateMany(filter, updateDoc);
      const result = await slotCollection.insertOne(slotData);

      const trainerFilter = { _id: new ObjectId(trainerId) };
      const updateTrainerDoc = {
        $push: {
          availableSlots: {
            slotId: result.insertedId,
            slotName: slotData.slotName,
            slotDays: slotData.slotDays,
            slotTime: slotData.slotTime,
            classesIncludes: slotData.classesIncludes,
          },
        },
      };
      const trainerResult = await trainerCollection.updateOne(
        trainerFilter,
        updateTrainerDoc
      );
      res.send(result);
    });

    // Get data by id from db
    app.get("/slot/:id", async (req, res) => {
      const query = { _id: new ObjectId(req.params.id) };
      const slot = await slotCollection.findOne(query);
      res.send(slot);
    });

    // Get slots data by email from db
    app.get("/slots/:email", async (req, res) => {
      const email = req.params.email;
      const query = { "trainer.email": email };
      const slots = await slotCollection.find(query).toArray();
      res.send(slots);
    });

    // Delete slot data
    app.delete("/slots/:id", verifyToken, verifyTrainer, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await slotCollection.deleteOne(query);
      // Delete trainer available slot by id
      const trainerQuery = {
        availableSlots: { $elemMatch: { slotId: new ObjectId(id) } },
      };
      const updateDoc = {
        $pull: { availableSlots: { slotId: new ObjectId(id) } },
      };
      const trainerResult = await trainerCollection.updateOne(
        trainerQuery,
        updateDoc
      );
      res.send(trainerResult);
    });

    // --------------- Booking and payments -----------------
    app.put("/carts", async (req, res) => {
      const cartData = req.body;
      const { slotId } = cartData;
      console.log(cartData);

      const updateDoc = {
        $set: { ...cartData },
      };
      const options = { upsert: true };
      const result = await cartCollection.updateOne(
        { slotId },
        updateDoc,
        options
      );
      res.send(result);
    });

    app.get("/carts/:email", async (req, res) => {
      const email = req.params.email;
      const cart = await cartCollection.findOne({ email });
      res.send(cart);
    });

    // Save booking data, push buyer to bookedBy array and delete cart data by slotId
    app.post("/bookings", async (req, res) => {
      const bookingData = req.body;
      const { slotId, classes } = bookingData;
      console.log(bookingData);

      // Save booking
      const bookingResult = await bookingCollection.insertOne(bookingData);
      console.log(bookingResult);

      // Update slot data's bookedBy array
      const query = { _id: new ObjectId(slotId) };
      const updateDoc = {
        $push: {
          bookedBy: {
            name: bookingData?.name,
            email: bookingData?.email,
          },
        },
      };
      const slotResult = await slotCollection.updateOne(query, updateDoc);
      console.log(slotResult);

      // Delete cart data
      const deleteResult = await cartCollection.deleteOne({ slotId });
      console.log(deleteResult);

      // Increase number of booking
      const filter = { name: { $in: [...classes] } };
      const updateClassDoc = {
        $inc: { numberOfBookings: 1 },
      };
      const classesResult = await classCollection.updateMany(
        filter,
        updateClassDoc
      );

      res.send(bookingResult);
    });

    app.get("/bookings", async (req, res) => {
      const bookings = await bookingCollection.find().toArray();
      res.send(bookings);
    });

    app.get("/booked-trainers/:email", async (req, res) => {
      const { email } = req.params;
      const options = {
        projection: { _id: 0, trainerId: 1, classes: 1 },
      };
      const trainers = await bookingCollection
        .find({ email }, options)
        .toArray();
      const trainerIds = trainers.map((t) => new ObjectId(t.trainerId));

      const query = { _id: { $in: [...trainerIds] } };

      const result = await trainerCollection.find(query).toArray();
      res.send(result);
    });

    // --------------- Community posts -----------------

    // Save blog posts data to db
    app.post("/posts", async (req, res) => {
      const postData = req.body;
      console.log(postData);
      const result = await postCollection.insertOne(postData);
      res.send(result);
    });

    // Get all blog posts data from db
    app.get("/posts", async (req, res) => {
      const sort = req.query.sort;
      let options = {};
      if (sort === "recentPost") {
        options = {
          sort: { timestamp: -1 },
        };
      }

      const size = parseInt(req.query.size);
      const page = parseInt(req.query.page) - 1;

      const posts = await postCollection
        .find({}, options)
        .skip(page * size)
        .limit(size)
        .toArray();
      res.send(posts);
    });

    // Update single post data field from db
    app.patch("/posts/upvote/:id", verifyToken, async (req, res) => {
      const { upvote } = req.body;
      console.log(upvote);
      const query = { _id: new ObjectId(req.params.id) };
      const updateDoc = {
        $inc: { upvote: upvote },
      };
      const result = await postCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    // Update single post data field from db
    app.patch("/posts/downvote/:id", verifyToken, async (req, res) => {
      const { downvote } = req.body;
      console.log(downvote);
      const query = { _id: new ObjectId(req.params.id) };
      const updateDoc = {
        $inc: { downvote: downvote },
      };
      const result = await postCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    // Get posts data count
    app.get("/posts-count", async (req, res) => {
      const count = await postCollection.estimatedDocumentCount();
      res.send({ count });
    });

    // --------------- Newsletter & Reviews -----------------

    // Save new Newsletter Subscriber
    app.post("/newsletter", async (req, res) => {
      const subscriberData = req.body;
      const result = await subscriberCollection.insertOne(subscriberData);
      res.send(result);
    });

    // Get all subscribers data from db
    app.get("/subscribers", async (req, res) => {
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
      const reviews = await reviewCollection.find().toArray();
      res.send(reviews);
    });

    // Get Admin Stats data from db
    app.get("/admin-stats", async (req, res) => {
      // total payment
      const options = { projection: { _id: 0, price: 1 } };
      const payments = await bookingCollection.find({}, options).toArray();
      const totalBalance = payments.reduce((acc, item) => acc + item.price, 0);

      // last six transactions
      const bookingOptions = {
        sort: { date: -1 },
      };
      const bookings = await bookingCollection
        .find({}, bookingOptions)
        .limit(6)
        .toArray();

      // make data with total newsletter sub and paid members
      const subscribers = await subscriberCollection.estimatedDocumentCount();
      const paidMembers = await bookingCollection.estimatedDocumentCount();
      const totalTrainers = await trainerCollection.estimatedDocumentCount();
      const totalClasses = await classCollection.estimatedDocumentCount();

      const statsData = {
        totalBalance,
        lastBookings: bookings,
        totalTrainers,
        totalClasses,
        chartData: [
          { name: "Newsletter Subscribers", value: subscribers },
          { name: "Paid Members", value: paidMembers },
        ],
      };
      res.send(statsData);
    });

    // successful connection ping msg
    // await client.db("admin").command({ ping: 1 });
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
