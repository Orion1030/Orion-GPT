# Orion-GPT Backend

Express backend for Jobsy.

## Requirements

- Node `22.14.0`
- npm `>=10`

## Setup

1. Install dependencies:
   - `npm install`
2. Copy env template and configure values:
   - copy `.env-sample` to `.env`
   - optional local override: create `.env.local` for machine-specific values
   - set server bind values if needed:
     - `HOST=0.0.0.0`
     - `PORT=5050`
3. Start the server:
   - `npm start`

## Scripts

- `npm start` - run backend server
- `npm run server` - run backend with nodemon
- `npm test` - run Jest tests
- `npm run lint:fix` - auto-fix lint issues

## Structure

- `routes/` - API route definitions
- `controllers/` - request handlers
- `services/` - business logic and LLM clients
- `dbModels/` - database connection and models
- `middlewares/` - auth and async error wrappers
- `agents/` and `workers/` - async agent jobs
- `docs/` - backend-specific technical docs

## Notes

- Entry point is `server.js` (not `bin/www`).
- Keep env values in `.env` and never commit secrets.
