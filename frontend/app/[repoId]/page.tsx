import { Assistant } from "../assistant";
import { RepoWelcome } from "@/components/assistant-ui/repo-welcome";

export default async function RepoPage({
  params,
}: {
  params: Promise<{ repoId: string }>;
}) {
  const { repoId } = await params;
  return (
    <Assistant
      initialMessages={[]}
      selectedRepoId={repoId}
      selectedConversationId={null}
      welcome={<RepoWelcome />}
    />
  );
}
