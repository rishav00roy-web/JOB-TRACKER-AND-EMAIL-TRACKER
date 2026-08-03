# Agentic Job Application Tracker

A fully-automated, Kanban-style Job Application Tracker designed to manage both scraped opportunities (via Apify and Claude) and manually submitted applications. Built with a modern, glassmorphic dark-mode aesthetic.

## Features

- **Automated Pipeline**: Claude scrapes jobs via Apify and seamlessly pushes them to the board via an MCP server.
- **Deterministic Scoring Engine**: Locally matches job descriptions against your structured skill profile (weighing agentic AI skills vs general frontend skills). No LLM API costs for scoring!
- **Niche Flagging**: Highlights unconventional opportunities that don't neatly fit typical keyword algorithms.
- **Deduplication**: Automatically deduplicates manual entries and scraped entries via application links.
- **Modern Tech Stack**: Turborepo, Next.js (App Router), Tailwind CSS v4, and Supabase.

## Architecture

This is a Turborepo monorepo structured as follows:
- `apps/web`: The Next.js frontend and internal API.
- `apps/mcp`: The Node.js MCP server that securely passes data from Claude Desktop to the Next.js API.
- `schema.sql`: The Postgres database schema and RLS configuration.

## Setup Instructions

1. **Database**
   - Run the contents of `schema.sql` in your Supabase SQL editor to scaffold the `jobs` and `skills` tables.

2. **Environment Variables**
   - In `apps/web/`, create a `.env.local` file and add:
     ```
     NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
     NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
     SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
     INTERNAL_API_SECRET=your_secret_string
     ```

3. **Running the Web App**
   ```bash
   npm install
   npm run dev --filter web
   ```
   Navigate to `http://localhost:3000` to view the board.

4. **Connecting the MCP Server**
   ```bash
   npm run build --filter mcp-server
   ```
   Add the following to your `claude_desktop_config.json`:
   ```json
   {
     "mcpServers": {
       "job-tracker": {
         "command": "node",
         "args": ["/absolute/path/to/apps/mcp/dist/index.js"],
         "env": {
           "INTERNAL_API_SECRET": "your_secret_string",
           "WEB_API_URL": "http://localhost:3000/api"
         }
       }
     }
   }
   ```
