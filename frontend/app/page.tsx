import { Assistant } from "./assistant";
import { HomeWelcome } from "@/components/assistant-ui/home-welcome";

export default function Home() {
  return <Assistant welcome={<HomeWelcome />} />;
}
