import { WebMcpSpike } from "@/features/webmcp-spike/WebMcpSpike";
import { ArchitectureCanvas } from "@/features/architecture-canvas/ArchitectureCanvas";

export default function Home() {
  return (
    <main>
      <ArchitectureCanvas />
      <WebMcpSpike />
    </main>
  );
}
