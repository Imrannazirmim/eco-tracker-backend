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

            // //public challenge all post
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
                        const exitingUser = await userChallengeCol.findOne({
                              userId: email,
                              challengeId: challengeId,
                        });
                        if (exitingUser) {
                              return res.status(400).send({ message: "Already joined this challenge" });
                        }
                        await userChallengeCol.insertOne({
                              userId: email,
                              email: email,
                              challengeId: challengeId,
                              status: "Not Started",
                              progress: 0,
                              role: "participant",
                              joinDate: new Date(),
                        });
                        await challengeCol.updateOne({ _id: new ObjectId(challengeId) }, { $inc: { participants: 1 } });

                        res.send();
                  } catch (error) {
                        res.status(500).send({ message: "Failed to join challenge" });
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
