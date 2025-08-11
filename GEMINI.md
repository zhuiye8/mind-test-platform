# Lyss AI Platform - 心理测试平台

## Project Overview

This is a comprehensive psychological testing platform designed for educational institutions. It allows teachers to create, manage, and analyze psychological tests and surveys, while students can take these tests through a public link. The platform features a modern, full-stack architecture with a focus on performance, security, and ease of use.

**Key Features:**

*   **Complex Question Logic:** Supports conditional branching (AND/OR) for questions.
*   **Full Exam Lifecycle:** Manages exams through Draft, Published, Finished, and Archived states.
*   **High Performance:** Utilizes Redis for multi-level caching to ensure fast response times.
*   **Secure:** Implements JWT-based authentication and authorization.
*   **Containerized:** Fully containerized with Docker for easy deployment and scaling.

## Architecture

The project follows a classic client-server architecture:

*   **Frontend:** A single-page application (SPA) built with **React (Vite)** and **TypeScript**. It uses **Ant Design** for its UI component library and **React Router** for navigation.
*   **Backend:** A RESTful API server built with **Node.js** and **Express.js**. It uses **TypeScript** for type safety and **Prisma** as the ORM for database interaction.
*   **Database:** **PostgreSQL** is used for persistent data storage.
*   **Cache:** **Redis** is used for caching frequently accessed data to improve performance.
*   **Deployment:** The entire application stack (backend, database, cache) is managed via **Docker Compose**, enabling one-command setup.

---

## Building and Running

### Prerequisites

*   Node.js (v20+)
*   Docker and Docker Compose

### 1. Environment Setup

The project uses `.env` files for configuration. Start by copying the example files:

```bash
# For backend services (PostgreSQL, Redis, JWT Secret)
cp .env.example .env

# For backend application
cp backend/.env.example backend/.env
```

Review and update the variables in `backend/.env` as needed. The defaults are suitable for local development.

### 2. Running the Application (Docker - Recommended)

The easiest way to get started is to use the provided Docker setup.

```bash
# This command will start the PostgreSQL and Redis containers.
docker-compose up -d
```

### 3. Running the Backend Server

```bash
# Navigate to the backend directory
cd backend

# Install dependencies
npm install

# Apply database schema
npm run db:push

# (Optional) Seed the database with initial data
npm run db:seed

# Start the development server (with hot-reloading)
npm run dev
```

The backend server will be available at `http://localhost:3001`.

### 4. Running the Frontend Application

```bash
# Navigate to the frontend directory
cd frontend

# Install dependencies
npm install

# Start the development server
npm run dev
```

The frontend application will be available at `http://localhost:3000`.

### Default Login

*   **Teacher ID:** `T2025001`
*   **Password:** `123456`

---

## Development Conventions

### Backend

*   **Linting:** ESLint is configured for code quality. Run `npm run lint` to check for issues.
*   **Database Migrations:** Prisma Migrate is used for schema management. Use `npm run db:migrate` to create new migrations.
*   **API Routes:** All API routes are defined under `src/routes` and prefixed with `/api`.
*   **Error Handling:** A global error handler in `src/middleware/errorHandler.ts` ensures consistent error responses.

### Frontend

*   **Linting:** ESLint is set up for code consistency. Run `npm run lint` to check your code.
*   **Component Library:** The project uses **Ant Design (AntD)**. Please use components from this library to maintain a consistent UI.
*   **Authentication:** API requests are authenticated using a JWT stored in local storage. See `src/utils/auth.ts`.
*   **State Management:** State is managed locally within components. For global state, React Context might be used where necessary.
*   **Styling:** The project uses standard CSS with some global styles defined in `src/index.css` and `src/App.css`.
