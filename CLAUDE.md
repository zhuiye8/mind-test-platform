# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Backend (Node.js + TypeScript + Express + Prisma)
```bash
cd backend

# Development
npm run dev              # Start backend with hot reload on :3001
npm run build            # Compile TypeScript to dist/
npm run start            # Run compiled JavaScript
npm run lint             # ESLint TypeScript files

# Database (Prisma + PostgreSQL)
npm run db:generate      # Generate Prisma client after schema changes
npm run db:push          # Push schema changes to database
npm run db:migrate       # Create and run migrations
npm run db:seed          # Run database seeding
npm run db:studio        # Open Prisma Studio database GUI

# Testing
npm test                 # Run Jest tests
```

### Frontend (React + TypeScript + Vite + Ant Design)
```bash
cd frontend

# Development
npm run dev              # Start frontend with hot reload on :3000
npm run build            # Build production bundle
npm run preview          # Preview production build
npm run lint             # ESLint React/TypeScript files
```

### Infrastructure (Docker)
```bash
# Start PostgreSQL + Redis services for development
docker-compose up -d

# Or with project name
docker-compose -p psychology-test-platform up -d

# Force rebuild and start
docker-compose build && docker-compose up -d
```

## System Architecture

### Multi-Service Psychology Testing Platform
This is a comprehensive psychology testing system with three main services:

1. **Backend API** (Node.js) - Core business logic and data persistence
2. **Frontend Web App** (React) - Teacher dashboard and student exam interface
3. **AI Analysis Service** (Python) - Real-time emotion analysis via WebRTC + Socket.IO

### Technology Stack
- **Backend**: Node.js + Express + TypeScript + Prisma ORM + PostgreSQL + Redis
- **Frontend**: React 19 + TypeScript + Vite + Ant Design + Tailwind CSS
- **AI Service**: Python + FastAPI + WebRTC + Socket.IO + DeepFace/emotion2vec models
- **Infrastructure**: Docker Compose + PostgreSQL 15 + Redis 7

## Core Domain Model

### Exam Lifecycle (5-State Management)
```
DRAFT → PUBLISHED → SUCCESS/EXPIRED → ARCHIVED → [DELETE/RESTORE]
```
- **DRAFT**: Editable exam template
- **PUBLISHED**: Active exam, students can participate
- **SUCCESS**: Properly concluded exam
- **EXPIRED**: Force-stopped exam
- **ARCHIVED**: Moved to recycle bin

### Key Entities Relationship
```
Teacher → Paper → Question (with conditional logic)
Teacher → Exam (based on Paper) → ExamResult
ExamResult → AI Analysis (emotion/attention/PPG detection)
```

### Database Schema Highlights
- **Papers**: Test templates with questions and conditional logic
- **Questions**: Support single/multiple choice and text, with conditional display rules
- **Exams**: Published test instances with time limits and access controls  
- **ExamResults**: Student submissions with scoring and AI analysis linking
- **AI Tables**: Session management, aggregates, anomalies, checkpoints for real-time analysis

## 重要开发原则

### 代码与文档同步原则 ⚠️
- **修改代码时必须同步更新文档**
- **修改文档时必须同步更新代码** 
- 确保代码、文档、API接口的一致性
- 删除功能时必须删除所有相关代码和文档

## Key Architecture Patterns

### Conditional Question Logic
Questions can have `display_condition` JSON fields enabling complex AND/OR logic:
```typescript
// Simple condition: Show Q2 only if Q1 answer is 'A'
{ question_id: "q1_uuid", selected_option: "A" }

// Complex: Show Q3 if (Q1='A' AND Q2='B') OR (Q1='C')
{ type: "or", conditions: [
  { type: "and", conditions: [
    { question_id: "q1", selected_option: "A" },
    { question_id: "q2", selected_option: "B" }
  ]},
  { question_id: "q1", selected_option: "C" }
]}
```

### Smart Pagination Strategy
- **Cursor Pagination**: For large datasets (>10k records)
- **Offset Pagination**: For smaller datasets or user-friendly page numbers
- Automatic strategy selection based on total count and performance

### Redis Cache Hierarchy
- **L1 Cache**: Session data and temporary results
- **L2 Cache**: Aggregated statistics and frequently accessed data
- **Memory Fallback**: Automatic degradation when Redis unavailable

### AI Integration Architecture
- **WebRTC Data Channel**: Real-time video/audio streaming to AI service with persistent stream connection
- **MediaStream Persistence**: Device streams maintained from connection phase through exam completion
- **Socket.IO Events**: Bidirectional communication for analysis results
- **Session Management**: AI sessions linked to exam results with lifecycle tracking
- **Stream Context Management**: Global MediaStreamContext for cross-component stream sharing
- **Microservice**: AI analysis runs as separate Python service with health checks

## File Organization

### Backend Structure
```
backend/src/
├── controllers/           # API endpoint handlers
│   ├── exam/             # Exam lifecycle management (CRUD, query, export, results)
│   ├── question/         # Question management (CRUD, batch, analysis)  
│   └── public/           # Student-facing APIs (session, submission, validation)
├── services/             # Business logic layer
│   ├── aiAnalysis/       # AI session management and data processing
│   └── audio/            # Audio generation and batch processing
├── utils/                # Shared utilities
│   ├── cache.ts          # Redis cache manager with memory fallback
│   ├── logger.ts         # Structured logging utility
│   └── pagination.ts     # Smart pagination strategy implementation
└── routes/               # Express route definitions
```

### Frontend Structure  
```
frontend/src/
├── components/
│   ├── ParticipantExam/  # Student exam interface with modular hooks
│   ├── ExamList/         # Teacher exam management with Kanban view
│   └── DeviceCheck/      # WebRTC device connection components with stream persistence
├── services/
│   ├── api/              # API client modules (REST)
│   └── localWebRTC/      # WebRTC connection management
├── hooks/                # Reusable React hooks
└── pages/                # Route components
```

### AI Service Structure
```
emotion_gpt5/
├── api/                  # FastAPI endpoints  
├── services/             # AI analysis logic
├── sio/                  # Socket.IO handlers
└── webrtc/              # WebRTC peer connection management
```

## Important Conventions

### API Design
- **Snake_case** for API fields and database columns
- **CamelCase** for TypeScript/JavaScript variables
- **Unified Error Response**: `{ success: boolean, data?: T, error?: string }`
- **ISO8601 Timestamps**: All dates in UTC with millisecond precision

### Security & Validation
- **JWT Authentication** for teachers with role-based access
- **Input Sanitization** with XSS prevention (no innerHTML usage)
- **SQL Injection Protection** via Prisma ORM
- **Environment Validation** on startup with required/optional variable checking

### Error Handling Patterns
- **Global Promise Rejection** handlers in both frontend and backend
- **Graceful Degradation** for AI service failures
- **Transaction Retry Logic** with exponential backoff for database operations
- **Resource Cleanup** for timers, streams, and WebRTC connections

### State Management
- **Exam Status Validation** with allowed transition rules
- **Optimistic Concurrency Control** using compare-and-swap for critical operations
- **Race Condition Prevention** via atomic database transactions

## AI Analysis Integration

The system includes a sophisticated AI analysis pipeline:

### WebRTC + Socket.IO Architecture
- **Data Channel**: Streams video/audio to Python AI service in real-time
- **Socket.IO Events**: Bidirectional communication for analysis status and results
- **Session Lifecycle**: Create → Analyze → Finalize → Cleanup workflow
- **WHIP/WHEP Protocol**: Standards-compliant WebRTC streaming via MediaMTX server
- **Quality Control**: Dynamic bitrate management with degradation preference for maintaining resolution

### AI Data Flow (Current Architecture)
1. Student enters device connection page → Media streams established and validated
2. Streams saved to MediaStreamContext → Maintained across navigation
3. Student starts exam → WebRTC connection reuses existing streams (no re-permission)
4. Video/audio streamed via WHIP to MediaMTX server → Forwarded to AI service via RTSP
5. AI service performs real-time analysis (emotion, attention, PPG)
6. Results aggregated and sent to backend via API calls
7. Teacher views analysis reports and raw data
8. Exam completion → Streams cleaned up by MediaStreamProvider

### WebRTC Quality Management
- **Encoding Parameters**: Must be configured BEFORE `createOffer()` to be included in SDP negotiation
- **Bitrate Control**: Uses `RTCRtpSender.setParameters()` with maxBitrate (6-8 Mbps for 1080p60)
- **Resolution Preference**: `degradationPreference: 'maintain-resolution'` prioritizes video quality
- **Codec Selection**: Automatic VP8/H.264 preference with proper packetization-mode handling

### 音频功能架构
- **WebRTC音频流**: 传输学生答题时的音频给AI服务进行情绪分析
- **百度TTS语音生成**: 为题目生成语音播报文件，存储在服务器供播放

### Key AI Models
- **DeepFace**: Emotion detection from facial expressions
- **Attention Detection**: Focus and attention monitoring  
- **PPG (Heart Rate)**: Physiological signal analysis from video
- **emotion2vec**: Advanced emotion recognition

### 已移除功能
- ~~**LLM语音匹配**: 使用OpenRouter API的智能语音答案匹配~~
- ~~**TTS/STT语音交互**: VoiceInteraction组件提供的无障碍语音答题~~

## Development Notes

### Environment Setup
1. Copy `backend/.env.example` to `backend/.env` and configure `AI_SERVICE_URL`
2. Start infrastructure: `docker-compose up -d`
3. Setup database: `cd backend && npm run db:push && npm run db:seed`
4. Start services: `npm run dev` in both backend/ and frontend/

### WebRTC Development Setup (Optional)
For WebRTC streaming testing, additional MediaMTX server setup is required:
1. Download MediaMTX v1.14.0+ from GitHub releases
2. Configure `mediamtx.yml` for WebRTC endpoints (ports 8889/8189)
3. Start MediaMTX: `./mediamtx` (no flags needed)
4. AI service connects via RTSP for video analysis

### Testing Strategy
- **Backend**: Jest unit tests for utilities and services
- **Database**: Transaction testing with rollback scenarios
- **Frontend**: Component testing for exam flow
- **AI Integration**: Health check endpoints and connection monitoring

### Performance Considerations
- **Database Indexing**: Optimized for teacher queries and AI analysis lookups
- **Caching Strategy**: Multi-layer Redis with automatic fallback
- **Connection Pooling**: PostgreSQL and Redis connection management
- **Memory Management**: Timer cleanup and stream lifecycle management
- **WebRTC Optimization**: Proper encoding parameter timing to prevent quality degradation

### Current Architecture Strengths
- **Modular Design**: Clean separation between exam management and AI analysis
- **Scalability**: Smart pagination and caching for large datasets
- **Reliability**: Comprehensive error handling and resource cleanup
- **Security**: XSS prevention, authentication, and input validation
- **Developer Experience**: Strong typing with TypeScript throughout
- **Standards Compliance**: WHIP/WHEP protocols for WebRTC interoperability

## Critical WebRTC Development Notes

### Encoding Parameter Timing ⚠️
- **MUST** call `setParameters()` BEFORE `createOffer()` - after SDP negotiation is too late
- WebRTC bandwidth estimation relies on initial SDP constraints
- Quality degradation occurs when parameters are set after answer/offer exchange

### Common WebRTC Pitfalls
- Setting maxBitrate after `setRemoteDescription()` has no effect on negotiated bandwidth
- `voiceActivityDetection` is not a valid `RTCOfferOptions` property
- React 18+ JSX Transform: Remove explicit `import React` statements in components