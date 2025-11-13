require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { config } = require("dotenv");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const admin = require("firebase-admin");

const serviceAccount = require("./smart-deals-token.json");

admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
});

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
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
      res.send("backend running for using mongodb");
});

const url = process.env.MONGODB_URL;
const client = new MongoClient(url, {
      serverApi: {
            version: ServerApiVersion.v1,
            strict: true,
            deprecationErrors: true,
      },
});

const run = async () => {
      try {
            await client.connect();
            const db = client.db(process.env.MONGODB_NAME);
            const challengeCol = db.collection("challenges");
            const userChallengeCol = db.collection("user_challenges");
            const tipsCol = db.collection("tips");
            const eventsCol = db.collection("events");

            //challenge api create

            app.get("/api/challenges", async (req, res) => {
                  try {
                        const cursor = challengeCol.find();
                        const result = await cursor.toArray();
                        res.send(result);
                  } catch (error) {
                        console.error("Error fetching challenges:", error);
                        res.status(500).send({ message: "Failed to fetch challenges" });
                  }
            });

            app.get("/api/challenges/:id", async (req, res) => {
                  const { id } = req.params;
                  if (!ObjectId.isValid(id)) {
                        return res.status(400).json({ message: "Invalid challenge ID" });
                  }

                  const query = { _id: new ObjectId(id) };

                  const result = await challengeCol.findOne(query);
                  res.json(result);
            });

            //post && patch & delete api challenge
            app.post("/api/challenges", verifyFireBaseToken, async (req, res) => {
                  const email = req.token_email || req.query.email;
                  try {
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

                        // Ensure communityGoal has all required fields
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
                        res.send({
                              success: true,
                              challengeId: result.insertedId,
                              message: "challenge created Successfuly",
                        });
                  } catch (error) {
                        console.error("Error creating challenge:", error);
                        res.status(500).send({ error: "Failed to create challenge" });
                  }
            });
            app.patch("/api/challenges/:id", async (req, res) => {
                  const id = req.params.id;
                  const updatePost = req.body;
                  const query = { _id: new ObjectId(id) };
                  const update = {
                        $set: updatePost,
                  };
                  const options = {};
                  const result = await challengeCol.updateOne(query, update, options);
                  res.send(result);
            });
            app.delete("/api/challenges/:id", async (req, res) => {
                  const id = req.params.id;
                  const query = { _id: new ObjectId(id) };
                  const result = await challengeCol.deleteOne(query);
                  res.send(result);
            });

            app.get("/api/user-challenges", verifyFireBaseToken, async (req, res) => {
                  try {
                        const email = req.query.email || req.token_email;

                        if (!email) return res.status(400).send({ message: "Email is required" });
                        const query = { email };
                        const cursor = userChallengeCol.find(query);
                        const result = await cursor.toArray();
                        res.send(result);
                  } catch (error) {
                        res.status(500).send({ message: "Forbidden access" });
                  }
            });
            app.post("/api/challenges/join/:id", verifyFireBaseToken, async (req, res) => {
                  const email = req.token_email;
                  const joinId = req.params.id;

                  try {
                        const joinChallenge = await challengeCol.findOne({ _id: new ObjectId(joinId) });
                        if (!joinChallenge) {
                              return res.status(404).send({ message: "Challenge Not Found" });
                        }

                        const existingUser = await userChallengeCol.findOne({
                              email: email,
                              challengeId: joinId,
                        });

                        if (existingUser) {
                              return res.status(400).send({ message: "Already joined this challenge" });
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

                        res.send({
                              success: true,
                              message: "Successfully joined challenge",
                        });
                  } catch (error) {
                        console.error("Error joining challenge:", error);
                        res.status(500).send({ message: "Failed to join challenge" });
                  }
            });


            // Get all events
            app.get("/api/events", async (req, res) => {
                  try {
                        const query = {};

                        // Filter for upcoming events if requested
                        if (req.query.upcoming === "true") {
                              query.date = { $gte: new Date() };
                        }

                        const cursor = eventsCol.find(query).sort({ date: 1 });
                        const result = await cursor.toArray();
                        res.send(result);
                  } catch (error) {
                        console.error("Error fetching events:", error);
                        res.status(500).send({ message: "Failed to fetch events" });
                  }
            });

            // Get single event
            app.get("/api/events/:id", async (req, res) => {
                  const { id } = req.params;
                  if (!ObjectId.isValid(id)) {
                        return res.status(400).json({ message: "Invalid event ID" });
                  }

                  try {
                        const query = { _id: new ObjectId(id) };
                        const result = await eventsCol.findOne(query);

                        if (!result) {
                              return res.status(404).json({ message: "Event not found" });
                        }

                        res.json(result);
                  } catch (error) {
                        console.error("Error fetching event:", error);
                        res.status(500).send({ message: "Failed to fetch event" });
                  }
            });

            // Create event
            app.post("/api/events", verifyFireBaseToken, async (req, res) => {
                  try {
                        const newEvent = {
                              ...req.body,
                              attendees: req.body.attendees || 0,
                              createdBy: req.token_email,
                              createdAt: new Date(),
                        };

                        const result = await eventsCol.insertOne(newEvent);
                        res.send({
                              success: true,
                              eventId: result.insertedId,
                              message: "Event created successfully",
                        });
                  } catch (error) {
                        console.error("Error creating event:", error);
                        res.status(500).send({ error: "Failed to create event" });
                  }
            });

            // Update event
            app.patch("/api/events/:id", verifyFireBaseToken, async (req, res) => {
                  const id = req.params.id;

                  if (!ObjectId.isValid(id)) {
                        return res.status(400).json({ message: "Invalid event ID" });
                  }

                  try {
                        const query = { _id: new ObjectId(id) };
                        const update = { $set: req.body };
                        const result = await eventsCol.updateOne(query, update);

                        if (result.matchedCount === 0) {
                              return res.status(404).json({ message: "Event not found" });
                        }

                        res.send(result);
                  } catch (error) {
                        console.error("Error updating event:", error);
                        res.status(500).send({ message: "Failed to update event" });
                  }
            });

            // Delete event
            app.delete("/api/events/:id", verifyFireBaseToken, async (req, res) => {
                  const id = req.params.id;

                  if (!ObjectId.isValid(id)) {
                        return res.status(400).json({ message: "Invalid event ID" });
                  }

                  try {
                        const query = { _id: new ObjectId(id) };
                        const result = await eventsCol.deleteOne(query);

                        if (result.deletedCount === 0) {
                              return res.status(404).json({ message: "Event not found" });
                        }

                        res.send(result);
                  } catch (error) {
                        console.error("Error deleting event:", error);
                        res.status(500).send({ message: "Failed to delete event" });
                  }
            });


            // Get all tips
            app.get("/api/tips", async (req, res) => {
                  try {
                        const cursor = tipsCol.find().sort({ createdAt: -1 });
                        const result = await cursor.toArray();
                        res.send(result);
                  } catch (error) {
                        console.error("Error fetching tips:", error);
                        res.status(500).send({ message: "Failed to fetch tips" });
                  }
            });

            // Get single tip
            app.get("/api/tips/:id", async (req, res) => {
                  const { id } = req.params;
                  if (!ObjectId.isValid(id)) {
                        return res.status(400).json({ message: "Invalid tip ID" });
                  }

                  try {
                        const query = { _id: new ObjectId(id) };
                        const result = await tipsCol.findOne(query);

                        if (!result) {
                              return res.status(404).json({ message: "Tip not found" });
                        }

                        res.json(result);
                  } catch (error) {
                        console.error("Error fetching tip:", error);
                        res.status(500).send({ message: "Failed to fetch tip" });
                  }
            });

            // Create tip
            app.post("/api/tips", verifyFireBaseToken, async (req, res) => {
                  try {
                        const newTip = {
                              ...req.body,
                              likes: req.body.likes || 0,
                              createdBy: req.token_email,
                              createdAt: new Date(),
                        };

                        const result = await tipsCol.insertOne(newTip);
                        res.send({
                              success: true,
                              tipId: result.insertedId,
                              message: "Tip created successfully",
                        });
                  } catch (error) {
                        console.error("Error creating tip:", error);
                        res.status(500).send({ error: "Failed to create tip" });
                  }
            });

            // Update tip
            app.patch("/api/tips/:id", verifyFireBaseToken, async (req, res) => {
                  const id = req.params.id;

                  if (!ObjectId.isValid(id)) {
                        return res.status(400).json({ message: "Invalid tip ID" });
                  }

                  try {
                        const query = { _id: new ObjectId(id) };
                        const update = { $set: req.body };
                        const result = await tipsCol.updateOne(query, update);

                        if (result.matchedCount === 0) {
                              return res.status(404).json({ message: "Tip not found" });
                        }

                        res.send(result);
                  } catch (error) {
                        console.error("Error updating tip:", error);
                        res.status(500).send({ message: "Failed to update tip" });
                  }
            });

            // Delete tip
            app.delete("/api/tips/:id", verifyFireBaseToken, async (req, res) => {
                  const id = req.params.id;

                  if (!ObjectId.isValid(id)) {
                        return res.status(400).json({ message: "Invalid tip ID" });
                  }

                  try {
                        const query = { _id: new ObjectId(id) };
                        const result = await tipsCol.deleteOne(query);

                        if (result.deletedCount === 0) {
                              return res.status(404).json({ message: "Tip not found" });
                        }

                        res.send(result);
                  } catch (error) {
                        console.error("Error deleting tip:", error);
                        res.status(500).send({ message: "Failed to delete tip" });
                  }
            });

            await client.db("admin").command({ ping: 1 });
      } catch (error) {
            throw new Error(error);
      }
};
run().catch((err) => {
      throw new Error(err);
});

app.listen(port, () => {
      console.log(`server is running:${port}`);
});
