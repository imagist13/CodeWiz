This is an [assistant-ui](https://github.com/Yonom/assistant-ui) project with provider-agnostic backend routing and repo-backed conversation persistence.

## Getting Started

### 1. Install Dependencies

```bash
npm install
# or
yarn install
# or
pnpm install
# or
bun install
```

### 1. Run the Development Server

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

### 2. (Optional) Set Up GitHub Sync

To enable creating projects from existing GitHub repositories:

1. Follow the [GitHub App Setup Guide](../GITHUB_APP_SETUP.md)
2. Create a GitHub App through the [Freestyle Dashboard](https://dash.freestyle.sh/)
3. Install the GitHub App on your GitHub repositories
4. Use the "From GitHub" option when creating new projects

See [GITHUB_APP_SETUP.md](../GITHUB_APP_SETUP.md) for detailed instructions.

## Development

You can start customizing the UI by modifying components in the `components/assistant-ui/` directory.

### Key Files

- `app/assistant.tsx` - Renders the chat interface and sets up the assistant runtime
- `app/api/chat/route.ts` - Chat API endpoint
- `lib/llm-provider.ts` - Provider wrapper (OpenAI + Claude)
- `components/assistant-ui/thread.tsx` - Chat thread component
- `components/app-sidebar.tsx` - Sidebar with thread list
