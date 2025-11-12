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
            return req.status(401).send({ message: "unauthorized access" });
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

            //public challenge all post
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

            //private all challenge post
            app.get("/api/challenges", verifyFireBaseToken, async (req, res) => {
                  const email = req.token_email || req.query.email;
                  const query = {};
                  console.log(email);
                  
                  try {
                        if (email) {
                              query.createdBy = email;
                              
                        }
                        const cursor = challengeCol.find(query);
                        const result = await cursor.toArray();
                        res.send(result);
                  } catch (error) {
                        res.status(500).send({message: 'Forbidden access'})
                  }
            });
            app.get("/api/challenges/:id", async (req, res) => {
                  const id = req.params.id;

                  const query = { _id: new ObjectId(id) };

                  const result = await challengeCol.findOne(query);
                  res.send(result);
            });

            //post && patch & delete api challenge
            app.post("/api/challenges", verifyFireBaseToken, async (req, res) => {
                  const creatorEmail = req.token_email || req.query.email;
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
                              createdBy: creatorEmail,

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
                              category: newChallenge.category,
                              status: "created",
                              role: "creator",
                              joinDate: new Date(),
                              progress: 0,
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

            // app.get("/api/", verifyFireBaseToken, async (req, res) => {
            //       try {
            //             const email = req.token_email || req.query.email;
            //             const query = {};
            //             if (email) {
            //                   query.email = email;
            //             }
            //             const cursor = userChallengeCol.find(query);
            //             const result = await cursor.toArray();
            //             res.send(result);
            //       } catch (error) {
            //             res.status(500).send({ message: "Failed to Fetch User Challenges" });
            //       }
            // });

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
