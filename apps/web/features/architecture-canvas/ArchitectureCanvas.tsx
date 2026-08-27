"use client";

import { ReactFlowProvider } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useState } from "react";
import type { ExperimentResult } from "@faultline/core";

import { StartOfficialAttempt } from "@/features/official-attempt/StartOfficialAttempt";
import { DevExperimentControls } from "@/features/experiments/DevExperimentControls";
import { ExperimentResultPanel } from "@/features/experiments/ExperimentResultPanel";
import { publishExperimentResult, type PublishedExperimentResult } from "@/lib/experiments/experiment-result-publisher";
import { OfficialAttemptProvider } from "@/features/official-attempt/OfficialAttemptContext";
import { AiEngineerPanel } from "@/features/ai-engineer/AiEngineerPanel";
import { AgentSessionProvider } from "@/features/agent-session/AgentSessionProvider";
import { AnnotationRunLifecycle } from "@/features/agent-session/AnnotationRunLifecycle";
import { SelectionSessionSync } from "@/features/agent-session/SelectionSessionSync";
import { WebMcpRegistration } from "@/features/webmcp/WebMcpRegistration";
import {
  WebMcpStatusPlate,
  type WebMcpStatus,
} from "@/features/webmcp/WebMcpStatusPlate";
import { ComponentRail } from "@/features/architecture-canvas/ComponentRail";
import { DataPlateInspector } from "@/features/architecture-canvas/DataPlateInspector";
import {
  LevelBriefing,
  useLevelBriefing,
} from "@/features/architecture-canvas/LevelBriefing";
import { PlaygroundCanvas } from "@/features/architecture-canvas/PlaygroundCanvas";
import {
  BudgetHud,
  RequirementsHud,
} from "@/features/architecture-canvas/PlaygroundHudPlates";
import { activeChallenge } from "@/features/architecture-canvas/playground-challenge";
import { SimBar } from "@/features/architecture-canvas/SimBar";
import { TracePresentationPanel } from "@/features/traffic-playback/TracePresentationPanel";
import { isLevel1LoadAnswerEnabled } from "@/features/architecture-canvas/level1-hero-scene";
import { usePlaygroundWorkspace } from "@/features/architecture-canvas/usePlaygroundWorkspace";
import { isFaultlineAiEnabled } from "@/lib/ai/feature-flag";

function ArchitectureWorkspace() {
  const workspace = usePlaygroundWorkspace();
  const briefing = useLevelBriefing();
  const aiEnabled = isFaultlineAiEnabled();
  const [publishedExperiment, setPublishedExperiment] = useState<PublishedExperimentResult | null>(null);
  const [publishedExperimentArchitectureKey, setPublishedExperimentArchitectureKey] = useState<string | null>(null);
  const publishResult = useCallback((result: ExperimentResult) => {
    publishExperimentResult(result, (published) => {
      setPublishedExperiment(published);
      setPublishedExperimentArchitectureKey(JSON.stringify(workspace.architecture));
      workspace.presentExperiment(published.result);
    });
  }, [workspace.architecture, workspace.playback]);
  const loadAnswerEnabled = isLevel1LoadAnswerEnabled();
  const [webMcpStatus, setWebMcpStatus] = useState<WebMcpStatus>({
    state: "unsupported",
    readToolCount: 0,
    visualToolCount: 0,
  });
  const handleWebMcpStatus = useCallback(
    (status: WebMcpStatus) => setWebMcpStatus(status),
    []
  );

  const shell = (
    <>
      {aiEnabled ? (
        <SelectionSessionSync
          selectedComponentId={workspace.selectedComponentId}
        />
      ) : null}
      {aiEnabled ? (
        <AnnotationRunLifecycle runState={workspace.runState} />
      ) : null}
      {aiEnabled ? (
      <WebMcpRegistration
          reconciliationKey={workspace.webMcpReconciliationKey}
        onStatusChange={handleWebMcpStatus}
        onExperimentResult={publishResult}
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
          <a className="playground-topbar__wordmark" href="/">
            Faultline
          </a>
          <div className="playground-topbar__hints">
            {loadAnswerEnabled ? (
              <button
                type="button"
                className="playground-topbar__hero"
                onClick={workspace.loadHeroScene}
              >
                Load (our) Answer
              </button>
            ) : null}
          </div>
          {aiEnabled ? <WebMcpStatusPlate status={webMcpStatus} /> : null}
        </header>
        <DevExperimentControls architecture={workspace.architecture} challenge={activeChallenge} onExperimentResult={publishResult} />

        <div className="playground-body">
          <ComponentRail definitions={workspace.paletteDefinitions} />

          <div className="playground-canvas-region">
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
              geographicRoutes={
                workspace.simulationResult?.geographicRoutes ?? []
              }
              experimentPresentation={workspace.experimentPresentation}
              playbackVisualsActive={workspace.playbackVisualsActive}
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

            <div className="playground-corner-hud">
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
              <button
                type="button"
                className="playground-corner-hud__briefing"
                onClick={briefing.restartBriefing}
              >
                View briefing
              </button>
            </div>
          </div>

          <aside className="playground-inspector-column">
            <TracePresentationPanel
              architecture={workspace.architecture}
              challenge={activeChallenge}
              onFocusComponent={workspace.onSelectComponent}
              onClear={workspace.clearSelection}
            />
            {publishedExperiment ? (
              <ExperimentResultPanel
                result={publishedExperiment.result}
                architectureKey={JSON.stringify(workspace.architecture)}
                resultArchitectureKey={publishedExperimentArchitectureKey ?? ""}
                baselineEvents={workspace.simulationResult?.events}
                onDismiss={() => {
                  workspace.playback.reset();
                  workspace.clearExperimentPresentation();
                  setPublishedExperiment(null);
                  setPublishedExperimentArchitectureKey(null);
                }}
              />
            ) : null}
            {aiEnabled ? (
              <p className="sr-only" aria-live="polite">
                {workspace.attentionComponentId
                  ? `AI Engineer is inspecting ${workspace.attentionComponentId}.`
                  : ""}
              </p>
            ) : null}
            {workspace.selectedComponent ? (
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
            ) : (
              <div className="playground-sidebar-challenge">
                <RequirementsHud
                  result={workspace.simulationResult}
                  runState={workspace.runState}
                  resultIsStale={workspace.resultIsStale}
                />
                {aiEnabled ? (
                  <AiEngineerPanel
                    architecture={workspace.architecture}
                    onAttention={workspace.setAttentionComponentId}
                    onShowOnCanvas={workspace.focusComponentOnCanvas}
                    onExperimentResult={publishResult}
                  />
                ) : null}
              </div>
            )}
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
    <AgentSessionProvider
      architecture={workspace.architecture}
      challenge={activeChallenge}
    >
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
