# Orion-GPT App Resume (Backend API + AI Orchestration)

## 1) Product Role
`Orion-GPT` is the backend engine for Jobsy.  
It provides:
- authenticated REST APIs
- MongoDB persistence
- LLM-powered JD parsing and resume generation
- async job orchestration for long-running application pipelines
- realtime event delivery (SSE + Socket.IO)
- admin, access-control, and usage analytics services

## 2) Tech Stack
- Runtime: Node.js + Express 5
- Database: MongoDB with Mongoose models
- AI integration: OpenAI chat + embedding APIs
- Async processing: in-process `JobModel` worker loop (with optional Agenda runner)
- Realtime: Socket.IO + SSE endpoints
- Validation/testing: express-validator + Jest/Supertest

## 3) System Responsibilities

### A. Auth, Roles, and Access
- JWT auth with refresh-token flow.
- Role model: Admin / Manager / User / Guest.
- Dynamic page-access policy:
  - persisted in `PageAccess` collection
  - enforced by `requirePageAccess` middleware
  - editable via admin APIs

### B. Core Domain APIs
- Profiles: CRUD with rich-text key point normalization.
- Resumes: CRUD + download (PDF/DOCX/HTML) + soft-delete.
- Templates: built-in + user-owned templates with ownership-aware permissions.
- Applications: apply/list/detail/patch/delete/history/chat-resolve/event stream.
- Chat: session/message management + LLM-assisted replies.
- Whitelist/Blacklist/Reporting: governance and analytics utilities.

## 4) AI & Matching Intelligence

### JD Parsing + Persistence
- JD parser endpoint/service extracts structured fields:
  - title, company, skills, requirements, responsibilities, nice-to-have
- Same-JD dedupe policy:
  - exact context hash match
  - near-duplicate token similarity check
  - normalized structured hash fallback
- Reuses existing JD rows when possible to avoid duplication and extra LLM cost.

### Profile Matching
- `findTopProfilesCore` scores profiles with weighted signals:
  - skill match
  - keyword match
  - role-title alignment
- Returns ranked top profiles and breakdown metrics.

### Resume Matching (ATS + Embeddings)
- `findTopResumesCore` computes weighted ATS score:
  - skill match
  - keyword match
  - cosine similarity between JD and resume embeddings
- Tie-breaker deep ranker uses:
  - quantified impact signals
  - experience recency
- Returns top-ranked resumes with confidence and breakdown.

### Resume Generation
- Generates structured resume JSON from:
  - selected JD
  - selected profile
  - optional base resume
- Applies normalization + safety sanitization.
- Adds resilience:
  - retries and model fallback paths
  - fallback resume output when generation fails
  - minimum bullet-density enforcement by seniority level
- Aligns generated experiences back to profile career history consistency.

## 5) Async Application Pipeline

### Pipeline Trigger
- `POST /applications/apply` creates:
  - `Application` record (queued state)
  - background `Job` for `generate_application_resume`

### Pipeline Steps
- created
- jd_parsed
- profile_selected
- base_resume_selected
- resume_generated
- resume_saved
- completed / failed

### Pipeline Outputs
- updates `Application` with profile, JD, resume references, statuses
- persists history events (`ApplicationEvent`)
- emits realtime envelope events for frontend updates

## 6) Realtime Architecture
- SSE endpoint for application-specific event stream.
- Socket.IO server with authenticated user/application rooms.
- Canonical event envelope with versioning and compatibility fields.
- Heartbeat + reconnect-friendly behavior.

## 7) Persistence Model Highlights
- `User`: auth, profile/account metadata, roles.
- `Profile`: candidate baseline (contact, education, career history).
- `Resume`: generated/imported resumes, template linkage, soft-delete fields, embeddings.
- `JobDescription`: parsed JD structures, hashes, embeddings.
- `Application`: lifecycle state, apply config, pipeline metadata.
- `ApplicationEvent`: append-only event history with sequence and idempotency keys.
- `ChatSession` / `ChatMessage`: conversational workspace records.

## 8) Metrics and Admin Capabilities
- Usage metrics service aggregates:
  - estimated LLM usage
  - profile/resume/chat/application stats
  - download counters
- Admin APIs include:
  - user list/update
  - per-user/global usage metrics
  - page-access policy updates

## 9) Testing Footprint
Backend has focused Jest coverage across critical flows, including:
- auth integration
- JD import dedupe policy
- resume generation services/controllers
- resume soft-delete behavior
- application controller behaviors
- template rendering and top-resume scoring

## 10) Architectural Strengths
- Clear separation of routes/controllers/services/utils.
- Strong async workflow design with event history and realtime updates.
- Practical LLM hardening (retry, fallback, normalization, sanitization).
- Robust ownership and role-aware scoping utilities.

