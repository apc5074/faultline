"use client";

import { ReactFlowProvider } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useState } from "react";

import { StartOfficialAttempt } from "@/features/official-attempt/StartOfficialAttempt";
import { LeaderboardHud } from "@/features/leaderboards/LeaderboardHud";
import { PlayerRankHud } from "@/features/leaderboards/PlayerRankHud";
import { OfficialAttemptProvider } from "@/features/official-attempt/OfficialAttemptContext";
import { AiEngineerPanel } from "@/features/ai-engineer/AiEngineerPanel";
import { AgentSessionProvider } from "@/features/agent-session/AgentSessionProvider";
import { AnnotationRunLifecycle } from "@/features/agent-session/AnnotationRunLifecycle";
import { SelectionSessionSync } from "@/features/agent-session/SelectionSessionSync";
import { WebMcpRegistration } from "@/features/webmcp/WebMcpRegistration";
import { WebMcpStatusPlate, type WebMcpStatus } from "@/features/webmcp/WebMcpStatusPlate";
import { ComponentRail } from "@/features/architecture-canvas/ComponentRail";
import { DataPlateInspector } from "@/features/architecture-canvas/DataPlateInspector";
import { LevelBriefing, useLevelBriefing } from "@/features/architecture-canvas/LevelBriefing";
import { PlaygroundCanvas } from "@/features/architecture-canvas/PlaygroundCanvas";
import {
  BudgetHud,
  PlaygroundDataPlates,
  RequirementsHud,
} from "@/features/architecture-canvas/PlaygroundHudPlates";
import { activeChallenge } from "@/features/architecture-canvas/playground-challenge";
import { SimBar } from "@/features/architecture-canvas/SimBar";
import { usePlaygroundWorkspace } from "@/features/architecture-canvas/usePlaygroundWorkspace";
import { isFaultlineAiEnabled } from "@/lib/ai/feature-flag";

function ArchitectureWorkspace() {
  const workspace = usePlaygroundWorkspace();
  const briefing = useLevelBriefing();
  const aiEnabled = isFaultlineAiEnabled();
  const [webMcpStatus, setWebMcpStatus] = useState<WebMcpStatus>({
    state: "unsupported",
    readToolCount: 0,
    visualToolCount: 0,
  });
  const handleWebMcpStatus = useCallback((status: WebMcpStatus) => setWebMcpStatus(status), []);

  const shell = (
    <>
      {aiEnabled ? <SelectionSessionSync selectedComponentId={workspace.selectedComponentId} /> : null}
      {aiEnabled ? <AnnotationRunLifecycle runState={workspace.runState} /> : null}
      {aiEnabled ? (
        <WebMcpRegistration
          reconciliationKey={workspace.webMcpReconciliationKey}
          onStatusChange={handleWebMcpStatus}
        />
      ) : null}
      <LevelBriefing
        open={briefing.open}
        step={briefing.step}
        onAdvance={briefing.advanceToProblem}
        onClose={briefing.closeBriefing}
      />
      <section className="playground-shell" aria-label="Architecture workspace">
        <header className="playground-topbar">
          <p className="playground-topbar__wordmark">Faultline</p>
          <div className="playground-topbar__hints">
            <button
              type="button"
              className="playground-topbar__brief"
              onClick={briefing.openBriefing}
            >
              Briefing
            </button>
            {process.env.NODE_ENV === "development" ? (
              <button type="button" className="playground-topbar__hero" onClick={workspace.loadHeroScene}>
                Load hero scene
              </button>
            ) : null}
            <span className="playground-topbar__hint">
              {workspace.viewMode === "logical"
                ? "delete key removes selected"
                : "edit deployments in inspector"}
            </span>
          </div>
          {aiEnabled ? <WebMcpStatusPlate status={webMcpStatus} /> : null}
        </header>

        <div className="playground-body">
          <ComponentRail definitions={workspace.paletteDefinitions} />

          <PlaygroundCanvas
            viewMode={workspace.viewMode}
            showCanvasEmptyState={workspace.showCanvasEmptyState}
            semanticZoomOut={workspace.semanticZoomOut}
            nodes={workspace.nodes}
            edges={workspace.edges}
            architecture={workspace.architecture}
            challenge={activeChallenge}
            selectedComponentId={workspace.selectedComponentId}
            worldSelection={workspace.worldSelection}
            showSimulationVisuals={workspace.showSimulationVisuals}
            resultIsStale={workspace.resultIsStale}
            geographicRoutes={workspace.simulationResult?.geographicRoutes ?? []}
            playbackVisualsActive={workspace.playback.playbackRunning}
            playbackFrame={workspace.playback.frame}
            enclosureRegions={workspace.enclosureRegions}
            onNodesChange={workspace.onNodesChange}
            onConnect={workspace.onConnect}
            onConnectStart={workspace.onConnectStart}
            onConnectEnd={workspace.onConnectEnd}
            onEdgesChange={workspace.onEdgesChange}
            isValidConnection={workspace.isValidConnection}
            onDragOver={workspace.onDragOver}
            onDrop={workspace.onDrop}
            setSemanticZoomOut={workspace.setSemanticZoomOut}
            onSelectComponent={workspace.onSelectComponent}
            onSelectRegion={workspace.onSelectRegion}
          />

          <aside className="playground-inspector-column">
            <PlaygroundDataPlates
              expanded={workspace.dataPlatesExpanded}
              onToggle={() => workspace.setDataPlatesExpanded((current) => !current)}
            >
              {aiEnabled ? (
                <p className="sr-only" aria-live="polite">
                  {workspace.attentionComponentId
                    ? `AI Engineer is inspecting ${workspace.attentionComponentId}.`
                    : ""}
                </p>
              ) : null}
              <RequirementsHud
                result={workspace.simulationResult}
                runState={workspace.runState}
                resultIsStale={workspace.resultIsStale}
              />
              <BudgetHud
                architecture={workspace.architecture}
                traffic={
                  workspace.showSimulationVisuals && !workspace.resultIsStale
                    ? workspace.simulationResult?.traffic
                    : undefined
                }
                geographicRoutes={
                  workspace.showSimulationVisuals && !workspace.resultIsStale
                    ? workspace.simulationResult?.geographicRoutes
                    : undefined
                }
              />
              <StartOfficialAttempt />
              <PlayerRankHud />
              <LeaderboardHud />
              {aiEnabled ? (
                <AiEngineerPanel
                  architecture={workspace.architecture}
                  onAttention={workspace.setAttentionComponentId}
                  onShowOnCanvas={workspace.focusComponentOnCanvas}
                />
              ) : null}
            </PlaygroundDataPlates>
            <div className="playground-inspector">
              <DataPlateInspector
                architecture={workspace.architecture}
                component={workspace.selectedComponent}
                simulation={workspace.simulationResult}
                simulationStale={workspace.resultIsStale}
                runComplete={workspace.runState === "complete"}
                onConfigChange={workspace.onConfigChange}
                onDeploymentsChange={workspace.onDeploymentsChange}
              />
            </div>
          </aside>
        </div>

        <SimBar
          playbackRunning={workspace.playback.playbackRunning}
          playbackPaused={workspace.playback.playbackPaused}
          playbackSpeed={workspace.playback.speed}
          runState={workspace.runState}
          resultIsStale={workspace.resultIsStale}
          errors={workspace.simulationErrors}
          unexpectedError={workspace.unexpectedError}
          result={workspace.simulationResult}
          viewMode={workspace.viewMode}
          officialActive={workspace.officialSession !== null}
          officialSubmitting={workspace.officialSubmitting}
          officialSummary={workspace.officialSummary}
          onRun={workspace.handleSimBarRun}
          onPause={workspace.playback.pause}
          onStep={workspace.handleSimBarStep}
          onReset={workspace.handleSimBarReset}
          onSpeedChange={workspace.playback.setSpeed}
          onViewModeChange={workspace.handleViewModeChange}
          onSubmitOfficial={workspace.onSubmitOfficial}
          selectedComponentId={workspace.selectedComponentId}
        />
      </section>
    </>
  );

  if (!aiEnabled) return shell;

  return (
    <AgentSessionProvider architecture={workspace.architecture} challenge={activeChallenge}>
      {shell}
    </AgentSessionProvider>
  );
}

export function ArchitectureCanvas() {
  return (
    <OfficialAttemptProvider>
      <ReactFlowProvider>
        <ArchitectureWorkspace />
      </ReactFlowProvider>
    </OfficialAttemptProvider>
  );
}
