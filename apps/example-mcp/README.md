# Example MCP Server

A simple [Model Context Protocol](https://modelcontextprotocol.io/) server built with the official TypeScript SDK, showcasing tools, resources, and prompts.

## What's included

| Type | Name | Description |
|------|------|-------------|
| **Tool** | `calculate` | Basic arithmetic (add / subtract / multiply / divide) |
| **Tool** | `get_datetime` | Current date/time in ISO, Unix, or human-readable format |
| **Tool** | `list_nx_projects` | Lists all Nx projects in the monorepo `apps/` directory |
| **Resource** | `system://info` | Host system information (OS, CPU, memory, uptime) |
| **Resource** | `project://package.json` | The workspace root `package.json` |
| **Prompt** | `code-review` | Code review template with focus areas |
| **Prompt** | `summarize` | Text summarisation to a target word count |

## Building

```bash
nx build example-mcp
```

## Running standalone

```bash
nx serve example-mcp
```

## Using with VS Code / Copilot

Add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "example-mcp": {
      "type": "stdio",
      "command": "node",
      "args": ["dist/example-mcp/main.js"]
    }
  }
}
```

Then reload VS Code. The tools and resources will be available to Copilot.
