# Psychology Test Platform

[English](README.md) | [Chinese](README.zh-CN.md)

[![Version](https://img.shields.io/badge/version-V1.0.2+-green.svg)](https://github.com/psychology-test-platform)
[![Status](https://img.shields.io/badge/status-Production%20Ready-brightgreen.svg)](https://github.com/psychology-test-platform)
[![AI](https://img.shields.io/badge/AI-Audio%20Stream%20Enabled-blue.svg)](https://github.com/psychology-test-platform)
[![Docker](https://img.shields.io/badge/docker-supported-blue.svg)](https://github.com/psychology-test-platform)
[![PostgreSQL](https://img.shields.io/badge/database-PostgreSQL-blue.svg)](https://github.com/psychology-test-platform)

A campus-oriented psychology testing system for questionnaire delivery, conditional assessment flows, and multimodal AI-assisted analysis. The platform combines a React admin UI, a TypeScript backend, and a Python emotion-analysis service with Docker-based deployment.

## Highlights

- Conditional questionnaire logic with AND/OR rules and dependency checks.
- Full exam lifecycle management, including draft, publish, finish, expire, and archive flows.
- Teacher-side paper, question, exam, analytics, and export workflows.
- Public student participation links with progress persistence and duplicate-submission protection.
- AI-assisted capture and analysis for video, audio, and related session data.
- Docker Compose stack with PostgreSQL, Redis, MediaMTX, backend API, frontend UI, and the AI service.

## Architecture

### Frontend

- React 19
- Vite
- TypeScript
- Ant Design

### Backend

- Node.js
- Express
- TypeScript
- Prisma ORM
- PostgreSQL
- Redis
- Socket.IO

### AI Service

- Python
- Flask / Flask-SocketIO
- DeepFace and audio processing toolchains
- MediaMTX for media transport and WebRTC-related routing

## Quick Start With Docker

Docker is the recommended way to run the full system locally.

```bash
git clone <repository-url>
cd mind-test-platform

cp env.docker.example .env
docker compose up -d --build

# Optional: inspect startup logs
docker compose logs -f backend
```

After the stack is healthy, open:

- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:3001/api`
- AI service: `http://localhost:5678`
- Backend health check: `http://localhost:3001/health`

## Demo Account

The Prisma seed script creates the default teacher account below:

- Teacher ID: `T2025001`
- Password: `123456`

## Local Development

### Frontend and Backend

```bash
cd frontend
npm install
npm run dev
```

```bash
cd backend
npm install
cp .env.example .env
npm run db:generate
npm run db:push
npm run db:seed
npm run dev
```

Useful backend commands:

```bash
npm run build
npm run test
npm run lint
npm run db:migrate
npm run db:studio
```

### AI Service

If you want to run the Python service outside Docker:

```bash
cd emotion
cp .env.example .env
pip install -r requirements-ai-env.txt
python app_lan.py
```

If `AI_SERVICE_URL` is not overridden in backend configuration, the backend expects the AI service at `http://localhost:5678`.

## Core Features

### Teacher Workflows

- Create, edit, publish, archive, restore, and delete papers and exams.
- Manage single-choice, multiple-choice, text, scoring, and audio-related question flows.
- Configure conditional branching and exam access rules.
- Review submissions, analytics, and exported results.
- Trigger AI report generation and related multimodal review flows.

### Student Workflows

- Join exams through public links without creating an account.
- Answer conditionally rendered questions based on prior responses.
- Resume progress with local persistence safeguards.
- Submit once per participant flow with anti-duplicate checks.
- Participate in sessions that capture audio and video for AI analysis when enabled.

## Project Layout

```text
backend/     Express + TypeScript API, Prisma schema, controllers, services
frontend/    React + Vite application
emotion/     Python AI and emotion-analysis service
docs/        Deployment notes, AI docs, and refactor documentation
data/        Runtime data and session artifacts
static/      Uploaded and generated static assets
templates/   Template files used by the Python service
```

## Current Status

The repository already covers the main production workflow:

- Authentication and teacher management
- Paper and question management
- Exam publishing and lifecycle handling
- Student answering flows
- Result analysis and export
- AI service integration
- Dockerized deployment

Planned improvements noted in the existing roadmap include rate limiting, stronger validation, HTTPS hardening, static asset optimization, and frontend code splitting.

## Contributing

1. Fork the repository.
2. Create a feature branch, for example `git checkout -b feature/my-change`.
3. Make changes and run the relevant checks.
4. Commit with a clear message such as `feat: add exam filter`.
5. Open a pull request with a short summary, verification steps, and screenshots for UI changes.

## License

This project is released under the MIT License.

## Support

- Issues: [GitHub Issues](https://github.com/psychology-test-platform/issues)

---

Psychology Test Platform aims to make psychological assessment workflows simpler, more structured, and more intelligent.
