import { Suspense } from "react";

import { ArchitectureCanvas } from "@/features/architecture-canvas/ArchitectureCanvas";

export default function LevelOnePage() {
  return (
    <main>
      <Suspense fallback={null}>
        <ArchitectureCanvas />
      </Suspense>
    </main>
  );
}
