import MobileApp from "@/components/mobile/MobileApp";
import { selectedAIProvider } from "@/lib/mobile/ai-config";
export const dynamic = "force-dynamic";
export default function Home() {
  return <MobileApp aiProvider={selectedAIProvider(process.env)} />;
}
