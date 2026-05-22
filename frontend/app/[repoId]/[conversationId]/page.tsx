import { Suspense } from "react";
import { ConversationPageContent } from "./ConversationPageContent";

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ repoId: string; conversationId: string }>;
}) {
  return (
    <Suspense fallback={null}>
      <ConversationPageContent params={params} />
    </Suspense>
  );
}
