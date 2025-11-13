require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const admin = require("firebase-admin");

const decoded = Buffer.from(process.env.FIREBASE_TOKEN_KEY, "base64").toString("utf8");
const serviceAccount = JSON.parse(decoded);

admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
});

const app = express();

app.use(
      cors({
            origin: [
                  "https://smart-deals-e8410.web.app/",
                  "https://smart-deals-e8410.firebaseapp.com/",
                  "http://localhost:5173",
                  "http://localhost:3000",
            ],
            credentials: true,
            methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      })
);

app.use(express.json());

const verifyFireBaseToken = async (req, res, next) => {
      const authorization = req.headers.authorization;
      if (!authorization) {
            return res.status(401).send({ message: "unauthorized access" });
      }
      const token = authorization.split(" ")[1];

      try {
            const decode = await admin.auth().verifyIdToken(token);
            req.token_email = decode.email;
            next();
      } catch (error) {
            return res.status(401).send({ message: "unauthorized access" });
      }
};

app.get("/", (req, res) => {
      res.json({
            message: "EcoTrack API is running!",
            status: "success",
            timestamp: new Date().toISOString(),
      });
});

const url = process.env.MONGODB_URL;
let cachedClient = null;
let cachedDb = null;

async function connectToDatabase() {
      if (cachedDb && cachedClient) {
            return { db: cachedDb, client: cachedClient };
      }

      const client = new MongoClient(url, {
            serverApi: {
                  version: ServerApiVersion.v1,
                  strict: true,
                  deprecationErrors: true,
            },
      });

      await client.connect();
      const db = client.db(process.env.MONGODB_NAME);

      cachedClient = client;
      cachedDb = db;

      return { db, client };
}

app.get("/api/challenges", async (req, res) => {
      try {
            const { db } = await connectToDatabase();
            const challengeCol = db.collection("challenges");
            const cursor = challengeCol.find();
            const result = await cursor.toArray();
            res.json(result);
      } catch (error) {
            res.status(500).json({ message: "Failed to fetch challenges" });
      }
});

app.get("/api/challenges/:id", async (req, res) => {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid challenge ID" });
      }

      try {
            const { db } = await connectToDatabase();
            const challengeCol = db.collection("challenges");
            const query = { _id: new ObjectId(id) };
            const result = await challengeCol.findOne(query);

            if (!result) {
                  return res.status(404).json({ message: "Challenge not found" });
            }

            res.json(result);
      } catch (error) {
            res.status(500).json({ message: "Failed to fetch challenge" });
      }
});

app.post("/api/challenges", verifyFireBaseToken, async (req, res) => {
      const email = req.token_email || req.query.email;
      try {
            const { db } = await connectToDatabase();
            const challengeCol = db.collection("challenges");
            const userChallengeCol = db.collection("user_challenges");

            const newChallenge = {
                  ...req.body,
                  participants: req.body.participants || 0,
                  howToParticipate: req.body.howToParticipate || [],
                  environmentalImpact: req.body.environmentalImpact || "",
                  communityGoal: req.body.communityGoal || {
                        goal: "",
                        currentProgress: 0,
                        percentage: 0,
                  },
                  createdBy: email,
                  createdAt: new Date(),
            };

            if (newChallenge.communityGoal && !newChallenge.communityGoal.currentProgress) {
                  newChallenge.communityGoal.currentProgress = 0;
            }
            if (newChallenge.communityGoal && !newChallenge.communityGoal.percentage) {
                  newChallenge.communityGoal.percentage = 0;
            }

            const result = await challengeCol.insertOne(newChallenge);

            const userChallenge = {
                  email: req.token_email,
                  challengeId: result.insertedId.toString(),
                  challengeTitle: newChallenge.title,
                  imageUrl: newChallenge.imageUrl,
                  secondaryTag: newChallenge.secondaryTag,
                  category: newChallenge.category,
                  status: "created",
                  role: "creator",
                  progress: newChallenge.communityGoal.currentProgress || 0,
                  percentage: newChallenge.communityGoal.percentage || 0,
                  joinDate: new Date(),
            };
            await userChallengeCol.insertOne(userChallenge);

            res.json({
                  success: true,
                  challengeId: result.insertedId,
                  message: "Challenge created successfully",
            });
      } catch (error) {
            res.status(500).json({ error: "Failed to create challenge" });
      }
});

app.patch("/api/challenges/:id", async (req, res) => {
      const id = req.params.id;
      if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid challenge ID" });
      }

      try {
            const { db } = await connectToDatabase();
            const challengeCol = db.collection("challenges");
            const query = { _id: new ObjectId(id) };
            const update = { $set: req.body };
            const result = await challengeCol.updateOne(query, update);
            res.json(result);
      } catch (error) {
            res.status(500).json({ message: "Failed to update challenge" });
      }
});

app.delete("/api/challenges/:id", async (req, res) => {
      const id = req.params.id;
      if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid challenge ID" });
      }

      try {
            const { db } = await connectToDatabase();
            const challengeCol = db.collection("challenges");
            const query = { _id: new ObjectId(id) };
            const result = await challengeCol.deleteOne(query);
            res.json(result);
      } catch (error) {
            res.status(500).json({ message: "Failed to delete challenge" });
      }
});

app.get("/api/user-challenges", verifyFireBaseToken, async (req, res) => {
      try {
            const { db } = await connectToDatabase();
            const userChallengeCol = db.collection("user_challenges");
            const email = req.query.email || req.token_email;

            if (!email) return res.status(400).json({ message: "Email is required" });

            const query = { email };
            const cursor = userChallengeCol.find(query);
            const result = await cursor.toArray();
            res.json(result);
      } catch (error) {
            res.status(500).json({ message: "Forbidden access" });
      }
});

app.post("/api/challenges/join/:id", verifyFireBaseToken, async (req, res) => {
      const email = req.token_email;
      const joinId = req.params.id;

      try {
            const { db } = await connectToDatabase();
            const challengeCol = db.collection("challenges");
            const userChallengeCol = db.collection("user_challenges");

            const joinChallenge = await challengeCol.findOne({ _id: new ObjectId(joinId) });
            if (!joinChallenge) {
                  return res.status(404).json({ message: "Challenge Not Found" });
            }

            const existingUser = await userChallengeCol.findOne({
                  email: email,
                  challengeId: joinId,
            });

            if (existingUser) {
                  return res.status(400).json({ message: "Already joined this challenge" });
            }

            await userChallengeCol.insertOne({
                  userId: email,
                  email: email,
                  challengeId: joinId,
                  challengeTitle: joinChallenge.title,
                  imageUrl: joinChallenge.imageUrl,
                  category: joinChallenge.category,
                  status: "Not Started",
                  progress: 0,
                  role: "participant",
                  joinDate: new Date(),
            });

            await challengeCol.updateOne({ _id: new ObjectId(joinId) }, { $inc: { participants: 1 } });

            res.json({
                  success: true,
                  message: "Successfully joined challenge",
            });
      } catch (error) {
            res.status(500).json({ message: "Failed to join challenge" });
      }
});

app.get("/api/events", async (req, res) => {
      try {
            const { db } = await connectToDatabase();
            const eventsCol = db.collection("events");
            const query = {};

            if (req.query.upcoming === "true") {
                  query.date = { $gte: new Date() };
            }

            const cursor = eventsCol.find(query).sort({ date: 1 });
            const result = await cursor.toArray();
            res.json(result);
      } catch (error) {
            res.status(500).json({ message: "Failed to fetch events" });
      }
});

app.get("/api/events/:id", async (req, res) => {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid event ID" });
      }

      try {
            const { db } = await connectToDatabase();
            const eventsCol = db.collection("events");
            const query = { _id: new ObjectId(id) };
            const result = await eventsCol.findOne(query);

            if (!result) {
                  return res.status(404).json({ message: "Event not found" });
            }

            res.json(result);
      } catch (error) {
            res.status(500).json({ message: "Failed to fetch event" });
      }
});

app.post("/api/events", verifyFireBaseToken, async (req, res) => {
      try {
            const { db } = await connectToDatabase();
            const eventsCol = db.collection("events");

            const newEvent = {
                  ...req.body,
                  attendees: req.body.attendees || 0,
                  createdBy: req.token_email,
                  createdAt: new Date(),
            };

            const result = await eventsCol.insertOne(newEvent);
            res.json({
                  success: true,
                  eventId: result.insertedId,
                  message: "Event created successfully",
            });
      } catch (error) {
            res.status(500).json({ error: "Failed to create event" });
      }
});

app.get("/api/tips", async (req, res) => {
      try {
            const { db } = await connectToDatabase();
            const tipsCol = db.collection("tips");
            const cursor = tipsCol.find().sort({ createdAt: -1 });
            const result = await cursor.toArray();
            res.json(result);
      } catch (error) {
            res.status(500).json({ message: "Failed to fetch tips" });
      }
});

app.get("/api/tips/:id", async (req, res) => {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid tip ID" });
      }

      try {
            const { db } = await connectToDatabase();
            const tipsCol = db.collection("tips");
            const query = { _id: new ObjectId(id) };
            const result = await tipsCol.findOne(query);

            if (!result) {
                  return res.status(404).json({ message: "Tip not found" });
            }

            res.json(result);
      } catch (error) {
            res.status(500).json({ message: "Failed to fetch tip" });
      }
});

app.post("/api/tips", verifyFireBaseToken, async (req, res) => {
      try {
            const { db } = await connectToDatabase();
            const tipsCol = db.collection("tips");

            const newTip = {
                  ...req.body,
                  likes: req.body.likes || 0,
                  createdBy: req.token_email,
                  createdAt: new Date(),
            };

            const result = await tipsCol.insertOne(newTip);
            res.json({
                  success: true,
                  tipId: result.insertedId,
                  message: "Tip created successfully",
            });
      } catch (error) {
            res.status(500).json({ error: "Failed to create tip" });
      }
});

app.use((req, res) => {
      res.status(404).json({
            message: "Route not found",
            path: req.path,
      });
});

module.exports = app;
