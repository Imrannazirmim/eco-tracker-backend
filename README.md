# EcoTrack API
- A RESTful API backend for the EcoTrack application that helps users track environmental challenges, events, and tips.

## Features
Challenges Management: Create, read, update, and delete environmental challenges
Events Management: Manage environmental events with registration system
Tips Sharing: Share and discover eco-friendly tips
User Tracking: Track user participation in challenges and events
Statistics: Environmental impact statistics and metrics
Firebase Authentication: Secure authentication using Firebase
MongoDB Database: Scalable NoSQL database for data storage


## Tech Stack
Node.js - JavaScript runtime
Express.js - Web application framework
MongoDB - NoSQL database
Firebase Admin SDK - Authentication and authorization
CORS - Cross-Origin Resource Sharing
Dotenv - Environment variable management


## Environment Variables
#### Create a .env file in the root directory with the following variables:

```env
MONGODB_URL=your_mongodb_connection_string
MONGODB_NAME=your_database_name
FIREBASE_TOKEN_KEY=base64_encoded_firebase_service_account_key
```
### Installation
- Clone the repository:
```bash
git clone <repository-url>
cd backend
```
- Install dependencies:


```bash
npm install
```
- Create ```.env``` file with your environment variables

- Start the server:

```bash
npm start
```

### API Endpoints

### Challenges

- GET /api/challenges - Get all challenges
- GET /api/challenges/:id - Get a specific challenge
- POST /api/challenges - Create a new challenge (requires auth)
- PATCH /api/challenges/:id - Update a challenge (requires auth)
- DELETE /api/challenges/:id - Delete a challenge (requires auth)

### User Challenges
- GET /api/user-challenges - Get user's challenges (requires auth)
- PATCH /api/user-challenges/:id - Update user's challenge progress (requires auth)
- POST /api/challenges/join/:id - Join a challenge (requires auth)

### Events

- GET /api/events - Get all events (query params: upcoming=true)
- GET /api/events/:id - Get a specific event
- POST /api/events - Create a new event (requires auth)
- PATCH /api/events/:id - Update an event (requires auth)
- DELETE /api/events/:id - Delete an event (requires auth)
- POST /api/events/join/:id - Join an event (requires auth)
- 
### Tips

- GET /api/tips - Get all tips
- GET /api/tips/:id - Get a specific tip
- POST /api/tips - Create a new tip (requires auth)

### Statistics
- GET /api/stats - Get environmental impact statistics
- Authentication
- All endpoints marked as requiring authentication expect a Firebase ID token in the Authorization header:
- Authorization: Bearer <firebase-id-token>
Error Handling
- 400 - Bad Request (invalid input or parameters)
- 401 - Unauthorized (missing or invalid token)
- 403 - Forbidden (insufficient permissions)
- 404 - Not Found (resource doesn't exist)
- 500 - Internal Server Error