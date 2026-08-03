import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const WEB_API_URL = process.env.WEB_API_URL || "http://localhost:3000/api";
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET || "your_secret_token_here";

const server = new Server(
  {
    name: "job-tracker-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "push_scraped_jobs",
        description: "Push an array of scraped jobs to the job tracker board.",
        inputSchema: {
          type: "object",
          properties: {
            jobs: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  job_title: { type: "string" },
                  company: { type: "string" },
                  description: { type: "string" },
                  location: { type: "string" },
                  work_type: { type: "string" },
                  company_tier: { type: "string" },
                  application_link: { type: "string" },
                  posted_date: { type: "string" }
                },
                required: ["job_title", "company", "description", "application_link"]
              }
            }
          },
          required: ["jobs"]
        }
      },
      {
        name: "log_manual_application",
        description: "Log a manually applied job to the job tracker board.",
        inputSchema: {
          type: "object",
          properties: {
            job_title: { type: "string" },
            company: { type: "string" },
            location: { type: "string" },
            work_type: { type: "string" },
            application_link: { type: "string" },
            notes: { type: "string" }
          },
          required: ["job_title", "company", "application_link"]
        }
      },
      {
        name: "get_board_state",
        description: "Get the current count of jobs in each stage of the board.",
        inputSchema: {
          type: "object",
          properties: {}
        }
      }
    ],
  };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let endpoint = "";
    let body = null;
    let method = "POST";

    if (name === "push_scraped_jobs") {
      endpoint = "/jobs/push";
      body = args?.jobs;
    } else if (name === "log_manual_application") {
      endpoint = "/jobs/manual";
      body = args;
    } else if (name === "get_board_state") {
      endpoint = "/jobs/state";
      method = "GET";
    } else {
      throw new Error(`Unknown tool: ${name}`);
    }

    const response = await fetch(`${WEB_API_URL}${endpoint}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${INTERNAL_API_SECRET}`
      },
      body: body ? JSON.stringify(body) : undefined
    });

    const data = await response.json();

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(data, null, 2)
        }
      ]
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: "text",
          text: `Error executing tool: ${error.message}`
        }
      ],
      isError: true
    };
  }
});

async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Job Tracker MCP Server running on stdio");
}

run().catch((error) => {
  console.error("Fatal error running MCP server:", error);
  process.exit(1);
});
