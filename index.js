require("dotenv").config();
const express = require("express");
const cors = require("cors");
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

// Firebase Token Verification Middleware
const verifyFireBaseToken = async (req, res, next) => {
      const authorization = req.headers.authorization;
      if (!authorization) {
            return res.status(401).send({ message: "Unauthorized access" });
      }
      const token = authorization.split(" ")[1];

      try {
            const decode = await admin.auth().verifyIdToken(token);
            req.token_email = decode.email;
            req.userId = decode.uid;
            next();
      } catch (error) {
            return res.status(401).send({ message: "Unauthorized access" });
      }
};

app.get("/", (req, res) => {
      res.send("EcoTrack Backend API is running");
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

            // ==================== CHALLENGES API ====================

            // GET /api/challenges - List all challenges with filters (PUBLIC)
            app.get("/api/challenges", async (req, res) => {
                  try {
                        const { category, status, search } = req.query;
                        const query = {};

                        // Filter by category
                        if (category && category !== "all") {
                              query.category = category;
                        }

                        // Search by title or description
                        if (search) {
                              query.$or = [
                                    { title: { $regex: search, $options: "i" } },
                                    { description: { $regex: search, $options: "i" } },
                              ];
                        }

                        // Filter by active/past challenges
                        if (status === "active") {
                              query.endDate = { $gte: new Date().toISOString() };
                        } else if (status === "past") {
                              query.endDate = { $lt: new Date().toISOString() };
                        }

                        const cursor = challengeCol.find(query).sort({ createdAt: -1 });
                        const result = await cursor.toArray();
                        res.send(result);
                  } catch (error) {
                        console.error("Error fetching challenges:", error);
                        res.status(500).send({ message: "Failed to fetch challenges" });
                  }
            });

            // GET /api/challenges/:id - Get challenge details (PUBLIC)
            app.get("/api/challenges/:id", async (req, res) => {
                  try {
                        const id = req.params.id;
                        const query = { _id: new ObjectId(id) };
                        const result = await challengeCol.findOne(query);

                        if (!result) {
                              return res.status(404).send({ message: "Challenge not found" });
                        }

                        res.send(result);
                  } catch (error) {
                        console.error("Error fetching challenge:", error);
                        res.status(500).send({ message: "Failed to fetch challenge" });
                  }
            });

            // POST /api/challenges - Create new challenge (PROTECTED)
            app.post("/api/challenges", verifyFireBaseToken, async (req, res) => {
                  const email = req.token_email;
                  try {
                        const newChallenge = {
                              title: req.body.title,
                              category: req.body.category,
                              description: req.body.description,
                              duration: req.body.duration || 30,
                              target: req.body.target || "",
                              participants: 0,
                              impactMetric: req.body.impactMetric || "",
                              createdBy: email,
                              startDate: req.body.startDate,
                              endDate: req.body.endDate,
                              imageUrl: req.body.imageUrl || "",
                              howToParticipate: req.body.howToParticipate || [],
                              environmentalImpact: req.body.environmentalImpact || "",
                              communityGoal: req.body.communityGoal || {
                                    goal: "",
                                    currentProgress: 0,
                                    percentage: 0,
                              },
                              createdAt: new Date(),
                              updatedAt: new Date(),
                        };

                        const result = await challengeCol.insertOne(newChallenge);

                        // Auto-join creator to their challenge
                        const userChallenge = {
                              userId: email,
                              email: email,
                              challengeId: result.insertedId.toString(),
                              status: "Not Started",
                              progress: 0,
                              role: "creator",
                              joinDate: new Date(),
                        };
                        await userChallengeCol.insertOne(userChallenge);

                        res.send({
                              success: true,
                              challengeId: result.insertedId,
                              message: "Challenge created successfully",
                        });
                  } catch (error) {
                        console.error("Error creating challenge:", error);
                        res.status(500).send({ error: "Failed to create challenge" });
                  }
            });

            // PATCH /api/challenges/:id - Update challenge (PROTECTED - owner/admin only)
            app.patch("/api/challenges/:id", verifyFireBaseToken, async (req, res) => {
                  try {
                        const id = req.params.id;
                        const email = req.token_email;

                        // Check if user is the creator
                        const challenge = await challengeCol.findOne({ _id: new ObjectId(id) });
                        if (!challenge) {
                              return res.status(404).send({ message: "Challenge not found" });
                        }

                        if (challenge.createdBy !== email) {
                              return res.status(403).send({ message: "Forbidden: You are not the creator" });
                        }

                        const updateData = {
                              ...req.body,
                              updatedAt: new Date(),
                        };

                        const result = await challengeCol.updateOne({ _id: new ObjectId(id) }, { $set: updateData });

                        res.send({ success: true, message: "Challenge updated successfully", result });
                  } catch (error) {
                        console.error("Error updating challenge:", error);
                        res.status(500).send({ message: "Failed to update challenge" });
                  }
            });

            // DELETE /api/challenges/:id - Delete challenge (PROTECTED - owner/admin only)
            app.delete("/api/challenges/:id", verifyFireBaseToken, async (req, res) => {
                  try {
                        const id = req.params.id;
                        const email = req.token_email;

                        // Check if user is the creator
                        const challenge = await challengeCol.findOne({ _id: new ObjectId(id) });
                        if (!challenge) {
                              return res.status(404).send({ message: "Challenge not found" });
                        }

                        if (challenge.createdBy !== email) {
                              return res.status(403).send({ message: "Forbidden: You are not the creator" });
                        }

                        // Delete challenge
                        const result = await challengeCol.deleteOne({ _id: new ObjectId(id) });

                        // Delete all user challenge records
                        await userChallengeCol.deleteMany({ challengeId: id });

                        res.send({ success: true, message: "Challenge deleted successfully", result });
                  } catch (error) {
                        console.error("Error deleting challenge:", error);
                        res.status(500).send({ message: "Failed to delete challenge" });
                  }
            });

            // POST /api/challenges/join/:id - Join a challenge (PROTECTED)
            app.post("/api/challenges/join/:id", verifyFireBaseToken, async (req, res) => {
                  const email = req.token_email;
                  const challengeId = req.params.id;

                  try {
                        const challenge = await challengeCol.findOne({ _id: new ObjectId(challengeId) });
                        if (!challenge) {
                              return res.status(404).send({ message: "Challenge not found" });
                        }

                        // Check if user already joined
                        const existingUser = await userChallengeCol.findOne({
                              userId: email,
                              challengeId: challengeId,
                        });

                        if (existingUser) {
                              return res.status(400).send({ message: "Already joined this challenge" });
                        }

                        // Add user to challenge
                        await userChallengeCol.insertOne({
                              userId: email,
                              email: email,
                              challengeId: challengeId,
                              status: "Not Started",
                              progress: 0,
                              role: "participant",
                              joinDate: new Date(),
                        });

                        // Increment participants count
                        await challengeCol.updateOne({ _id: new ObjectId(challengeId) }, { $inc: { participants: 1 } });

                        res.send({ success: true, message: "Joined challenge successfully" });
                  } catch (error) {
                        console.error("Error joining challenge:", error);
                        res.status(500).send({ message: "Failed to join challenge" });
                  }
            });

            // ==================== USER CHALLENGES API ====================

            // GET /api/user-challenges - Get all user's challenges with details (PROTECTED)
            app.get("/api/user-challenges", verifyFireBaseToken, async (req, res) => {
                  try {
                        const email = req.token_email;

                        // Aggregation pipeline to join user_challenges with challenges
                        const pipeline = [
                              { $match: { userId: email } },
                              {
                                    $addFields: {
                                          challengeObjectId: { $toObjectId: "$challengeId" },
                                    },
                              },
                              {
                                    $lookup: {
                                          from: "challenges",
                                          localField: "challengeObjectId",
                                          foreignField: "_id",
                                          as: "challengeInfo",
                                    },
                              },
                              {
                                    $unwind: {
                                          path: "$challengeInfo",
                                          preserveNullAndEmptyArrays: true,
                                    },
                              },
                              {
                                    $project: {
                                          _id: 1,
                                          email: 1,
                                          userId: 1,
                                          challengeId: 1,
                                          role: 1,
                                          status: 1,
                                          progress: 1,
                                          joinDate: 1,
                                          challengeInfo: {
                                                title: 1,
                                                description: 1,
                                                category: 1,
                                                duration: 1,
                                                target: 1,
                                                participants: 1,
                                                imageUrl: 1,
                                                startDate: 1,
                                                endDate: 1,
                                                communityGoal: 1,
                                                createdAt: 1,
                                          },
                                    },
                              },
                              { $sort: { joinDate: -1 } },
                        ];

                        const userChallenges = await userChallengeCol.aggregate(pipeline).toArray();
                        res.send(userChallenges);
                  } catch (error) {
                        console.error("Error fetching user challenges:", error);
                        res.status(500).send({ message: "Failed to fetch user challenges" });
                  }
            });

            // GET /api/user-challenges/:id - Get single user challenge (PROTECTED)
            app.get("/api/user-challenges/:id", verifyFireBaseToken, async (req, res) => {
                  try {
                        const id = req.params.id; // This is challengeId
                        const email = req.token_email;

                        const userChallenge = await userChallengeCol.findOne({
                              challengeId: id,
                              userId: email,
                        });

                        if (!userChallenge) {
                              return res.status(404).send({ message: "User challenge not found" });
                        }

                        // Get full challenge details
                        const challenge = await challengeCol.findOne({ _id: new ObjectId(id) });

                        res.send({
                              ...userChallenge,
                              challengeInfo: challenge,
                        });
                  } catch (error) {
                        console.error("Error fetching user challenge:", error);
                        res.status(500).send({ message: "Failed to fetch user challenge" });
                  }
            });

            // PATCH /api/user-challenges/:id - Update user challenge progress (PROTECTED)
            app.patch("/api/user-challenges/:id", verifyFireBaseToken, async (req, res) => {
                  try {
                        const id = req.params.id; // This is the user_challenge _id
                        const email = req.token_email;

                        const { status, progress } = req.body;

                        const updateData = {};
                        if (status) updateData.status = status;
                        if (progress !== undefined) updateData.progress = progress;

                        const result = await userChallengeCol.updateOne(
                              { _id: new ObjectId(id), userId: email },
                              { $set: updateData }
                        );

                        if (result.matchedCount === 0) {
                              return res.status(404).send({ message: "User challenge not found" });
                        }

                        res.send({ success: true, message: "Progress updated successfully" });
                  } catch (error) {
                        console.error("Error updating progress:", error);
                        res.status(500).send({ message: "Failed to update progress" });
                  }
            });

            // ==================== TIPS API ====================

            // GET /api/tips - Get all tips (PUBLIC)
            app.get("/api/tips", async (req, res) => {
                  try {
                        const { category, search } = req.query;
                        const query = {};

                        if (category && category !== "all") {
                              query.category = category;
                        }

                        if (search) {
                              query.$or = [
                                    { title: { $regex: search, $options: "i" } },
                                    { content: { $regex: search, $options: "i" } },
                              ];
                        }

                        const cursor = tipsCol.find(query).sort({ upvotes: -1, createdAt: -1 });
                        const result = await cursor.toArray();
                        res.send(result);
                  } catch (error) {
                        console.error("Error fetching tips:", error);
                        res.status(500).send({ message: "Failed to fetch tips" });
                  }
            });

            // GET /api/tips/:id - Get single tip (PUBLIC)
            app.get("/api/tips/:id", async (req, res) => {
                  try {
                        const id = req.params.id;
                        const tip = await tipsCol.findOne({ _id: new ObjectId(id) });

                        if (!tip) {
                              return res.status(404).send({ message: "Tip not found" });
                        }

                        res.send(tip);
                  } catch (error) {
                        console.error("Error fetching tip:", error);
                        res.status(500).send({ message: "Failed to fetch tip" });
                  }
            });

            // POST /api/tips - Create new tip (PROTECTED)
            app.post("/api/tips", verifyFireBaseToken, async (req, res) => {
                  try {
                        const email = req.token_email;

                        const newTip = {
                              title: req.body.title,
                              content: req.body.content,
                              category: req.body.category,
                              author: email,
                              authorName: req.body.authorName || email,
                              upvotes: 0,
                              createdAt: new Date(),
                        };

                        const result = await tipsCol.insertOne(newTip);
                        res.send({ success: true, tipId: result.insertedId, message: "Tip created successfully" });
                  } catch (error) {
                        console.error("Error creating tip:", error);
                        res.status(500).send({ message: "Failed to create tip" });
                  }
            });

            // PATCH /api/tips/:id/upvote - Upvote a tip (PROTECTED)
            app.patch("/api/tips/:id/upvote", verifyFireBaseToken, async (req, res) => {
                  try {
                        const id = req.params.id;
                        const result = await tipsCol.updateOne({ _id: new ObjectId(id) }, { $inc: { upvotes: 1 } });

                        if (result.matchedCount === 0) {
                              return res.status(404).send({ message: "Tip not found" });
                        }

                        res.send({ success: true, message: "Tip upvoted successfully" });
                  } catch (error) {
                        console.error("Error upvoting tip:", error);
                        res.status(500).send({ message: "Failed to upvote tip" });
                  }
            });

            // DELETE /api/tips/:id - Delete tip (PROTECTED - owner only)
            app.delete("/api/tips/:id", verifyFireBaseToken, async (req, res) => {
                  try {
                        const id = req.params.id;
                        const email = req.token_email;

                        const tip = await tipsCol.findOne({ _id: new ObjectId(id) });
                        if (!tip) {
                              return res.status(404).send({ message: "Tip not found" });
                        }

                        if (tip.author !== email) {
                              return res.status(403).send({ message: "Forbidden: You are not the author" });
                        }

                        const result = await tipsCol.deleteOne({ _id: new ObjectId(id) });
                        res.send({ success: true, message: "Tip deleted successfully" });
                  } catch (error) {
                        console.error("Error deleting tip:", error);
                        res.status(500).send({ message: "Failed to delete tip" });
                  }
            });

            // ==================== EVENTS API ====================

            // GET /api/events - Get all events (PUBLIC)
            app.get("/api/events", async (req, res) => {
                  try {
                        const { upcoming, search } = req.query;
                        const query = {};

                        if (upcoming === "true") {
                              query.date = { $gte: new Date().toISOString() };
                        }

                        if (search) {
                              query.$or = [
                                    { title: { $regex: search, $options: "i" } },
                                    { description: { $regex: search, $options: "i" } },
                                    { location: { $regex: search, $options: "i" } },
                              ];
                        }

                        const cursor = eventsCol.find(query).sort({ date: 1 });
                        const result = await cursor.toArray();
                        res.send(result);
                  } catch (error) {
                        console.error("Error fetching events:", error);
                        res.status(500).send({ message: "Failed to fetch events" });
                  }
            });

            // GET /api/events/:id - Get single event (PUBLIC)
            app.get("/api/events/:id", async (req, res) => {
                  try {
                        const id = req.params.id;
                        const event = await eventsCol.findOne({ _id: new ObjectId(id) });

                        if (!event) {
                              return res.status(404).send({ message: "Event not found" });
                        }

                        res.send(event);
                  } catch (error) {
                        console.error("Error fetching event:", error);
                        res.status(500).send({ message: "Failed to fetch event" });
                  }
            });

            // POST /api/events - Create new event (PROTECTED)
            app.post("/api/events", verifyFireBaseToken, async (req, res) => {
                  try {
                        const email = req.token_email;

                        const newEvent = {
                              title: req.body.title,
                              description: req.body.description,
                              date: req.body.date,
                              location: req.body.location,
                              organizer: email,
                              maxParticipants: req.body.maxParticipants || 50,
                              currentParticipants: 0,
                              createdAt: new Date(),
                        };

                        const result = await eventsCol.insertOne(newEvent);
                        res.send({ success: true, eventId: result.insertedId, message: "Event created successfully" });
                  } catch (error) {
                        console.error("Error creating event:", error);
                        res.status(500).send({ message: "Failed to create event" });
                  }
            });

            // PATCH /api/events/:id - Update event (PROTECTED - organizer only)
            app.patch("/api/events/:id", verifyFireBaseToken, async (req, res) => {
                  try {
                        const id = req.params.id;
                        const email = req.token_email;

                        const event = await eventsCol.findOne({ _id: new ObjectId(id) });
                        if (!event) {
                              return res.status(404).send({ message: "Event not found" });
                        }

                        if (event.organizer !== email) {
                              return res.status(403).send({ message: "Forbidden: You are not the organizer" });
                        }

                        const result = await eventsCol.updateOne({ _id: new ObjectId(id) }, { $set: req.body });

                        res.send({ success: true, message: "Event updated successfully" });
                  } catch (error) {
                        console.error("Error updating event:", error);
                        res.status(500).send({ message: "Failed to update event" });
                  }
            });

            // DELETE /api/events/:id - Delete event (PROTECTED - organizer only)
            app.delete("/api/events/:id", verifyFireBaseToken, async (req, res) => {
                  try {
                        const id = req.params.id;
                        const email = req.token_email;

                        const event = await eventsCol.findOne({ _id: new ObjectId(id) });
                        if (!event) {
                              return res.status(404).send({ message: "Event not found" });
                        }

                        if (event.organizer !== email) {
                              return res.status(403).send({ message: "Forbidden: You are not the organizer" });
                        }

                        const result = await eventsCol.deleteOne({ _id: new ObjectId(id) });
                        res.send({ success: true, message: "Event deleted successfully" });
                  } catch (error) {
                        console.error("Error deleting event:", error);
                        res.status(500).send({ message: "Failed to delete event" });
                  }
            });

            // POST /api/events/:id/join - Join event (PROTECTED)
            app.post("/api/events/:id/join", verifyFireBaseToken, async (req, res) => {
                  try {
                        const id = req.params.id;
                        const email = req.token_email;

                        const event = await eventsCol.findOne({ _id: new ObjectId(id) });
                        if (!event) {
                              return res.status(404).send({ message: "Event not found" });
                        }

                        if (event.currentParticipants >= event.maxParticipants) {
                              return res.status(400).send({ message: "Event is full" });
                        }

                        const result = await eventsCol.updateOne(
                              { _id: new ObjectId(id) },
                              { $inc: { currentParticipants: 1 } }
                        );

                        res.send({ success: true, message: "Joined event successfully" });
                  } catch (error) {
                        console.error("Error joining event:", error);
                        res.status(500).send({ message: "Failed to join event" });
                  }
            });

            // Health check
            await client.db("admin").command({ ping: 1 });
            console.log("Successfully connected to MongoDB!");
      } catch (error) {
            console.error("MongoDB connection error:", error);
            throw new Error(error);
      }
};

run().catch((err) => {
      console.error("Server error:", err);
      process.exit(1);
});

app.listen(port, () => {
      console.log(`✅ EcoTrack server is running on port: ${port}`);
});
