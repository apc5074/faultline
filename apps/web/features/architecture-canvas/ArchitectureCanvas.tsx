"use client";

import { ReactFlowProvider } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useState, Suspense } from "react";
import Link from "next/link";
import type { ExperimentResult } from "@faultline/core";

import { StartOfficialAttempt } from "@/features/official-attempt/StartOfficialAttempt";
import { OfficialScorecard } from "@/features/official-attempt/OfficialScorecard";
import { PlayerRankHud } from "@/features/leaderboards/PlayerRankHud";
import { AccountAuthPlate } from "@/features/account/AccountAuthPlate";
import { AuthCallbackNotice } from "@/features/account/AuthCallbackNotice";
import { PlayerStreakHud } from "@/features/account/PlayerStreakHud";
import { DevExperimentControls } from "@/features/experiments/DevExperimentControls";
import { ExperimentResultPanel } from "@/features/experiments/ExperimentResultPanel";
import { publishExperimentResult, type PublishedExperimentResult } from "@/lib/experiments/experiment-result-publisher";
import { OfficialAttemptProvider } from "@/features/official-attempt/OfficialAttemptContext";
import { AiEngineerPanel } from "@/features/ai-engineer/AiEngineerPanel";
import { AgentSessionProvider } from "@/features/agent-session/AgentSessionProvider";
import { AnnotationRunLifecycle } from "@/features/agent-session/AnnotationRunLifecycle";
import { SelectionSessionSync } from "@/features/agent-session/SelectionSessionSync";
import { ObservationPins } from "@/features/agent-session/ObservationPins";
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
import { RunResultsPlate } from "@/features/architecture-canvas/RunResultsPlate";
import { RunVerdictChip } from "@/features/architecture-canvas/RunVerdictChip";
import { runVerdictSummary } from "@/features/architecture-canvas/run-verdict";
import { isLevel1LoadAnswerEnabled } from "@/features/architecture-canvas/level1-hero-scene";
import { usePlaygroundWorkspace } from "@/features/architecture-canvas/usePlaygroundWorkspace";
import { isFaultlineAiEnabled } from "@/lib/ai/feature-flag";

function ArchitectureWorkspace() {
  const workspace = usePlaygroundWorkspace();
  const briefing = useLevelBriefing();
  // Development builds keep the coaching/WebMCP surface visible so local
  // diagnostics cannot be hidden by a stale or differently-scoped env file.
  // Preview/Production remain explicitly rollout-gated by the public flag.
  const aiEnabled = process.env.NODE_ENV === "development" || isFaultlineAiEnabled();
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
  const [resultsPlateDismissed, setResultsPlateDismissed] = useState(false);
  const verdictRevealed = workspace.simulationResult !== null && (
    workspace.playback.phase === "settling" ||
    (workspace.runState === "complete" && workspace.playback.phase === "settled")
  );
  const verdict = useMemo(
    () => workspace.simulationResult ? runVerdictSummary(workspace.simulationResult) : null,
    [workspace.simulationResult],
  );
  useEffect(() => {
    setResultsPlateDismissed(false);
  }, [workspace.playback.runSeq]);
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
        onFocusComponent={workspace.focusComponentInPresentation}
        onFocusRegion={workspace.focusRegionInPresentation}
        onPinObservation={workspace.pinObservation}
        onExperimentResult={publishResult}
      />
      ) : null}
      <LevelBriefing
        open={briefing.open}
        onClose={briefing.closeBriefing}
        onStartDesigning={workspace.startOfficialAttemptFromBriefing}
      />
      <section className="playground-shell" aria-label="Architecture workspace">
        <header className="playground-topbar">
          <Link className="playground-topbar__wordmark" href="/">
            Faultline
          </Link>
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
          <AccountAuthPlate nextPath="/level/1" minimal compact />
          {aiEnabled ? <WebMcpStatusPlate status={webMcpStatus} /> : null}
        </header>
        <Suspense fallback={null}>
          <AuthCallbackNotice />
        </Suspense>
        <DevExperimentControls architecture={workspace.architecture} challenge={activeChallenge} onExperimentResult={publishResult} />

        <div className="playground-body">
          <ComponentRail definitions={workspace.paletteDefinitions} />

          <div className="playground-canvas-region">
            <PlaygroundCanvas
              viewMode={workspace.viewMode}
              showCanvasEmptyState={workspace.showCanvasEmptyState}
              interactionNotice={workspace.interactionNotice}
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
              worldRoutesAnimating={workspace.playback.phase === "playing"}
              worldRoutesStale={workspace.resultIsStale}
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
              onClearWorldSelection={workspace.clearSelection}
            />

            <div className="playground-corner-hud">
              {workspace.runState === "complete" ? (
                <p
                  className={`playground-corner-hud__last-run${workspace.resultIsStale ? " playground-corner-hud__last-run--stale" : ""}`}
                >
                  {workspace.resultIsStale ? "Last run · evidence · stale" : "Last run · evidence"}
                </p>
              ) : null}
              {verdictRevealed && verdict ? (
                <RunVerdictChip
                  verdict={verdict}
                  stale={workspace.resultIsStale}
                  onClick={() => setResultsPlateDismissed(false)}
                />
              ) : null}
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
              <PlayerStreakHud compact />
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
            {verdictRevealed && !resultsPlateDismissed && workspace.simulationResult && verdict ? (
              <RunResultsPlate
                result={workspace.simulationResult}
                verdict={verdict}
                stale={workspace.resultIsStale}
                officialActive={workspace.officialSession !== null}
                officialCompleted={workspace.officialVerification?.eligible === true}
                onSubmitOfficial={workspace.onSubmitOfficial}
                onReviewFirstFailure={workspace.reviewFirstFailure}
                onRun={workspace.handleSimBarRun}
                onDismiss={() => setResultsPlateDismissed(true)}
              />
            ) : null}
            <ObservationPins observations={workspace.pinnedObservations} stale={workspace.resultIsStale} onClear={workspace.clearPinnedObservations} />
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
            {workspace.officialVerification ? (
              <OfficialScorecard result={workspace.officialVerification} stale={workspace.resultIsStale} />
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
                  key={`requirements-review-${workspace.requirementsReviewKey}`}
                  result={workspace.simulationResult}
                  runState={workspace.runState}
                  resultIsStale={workspace.resultIsStale}
                  reviewKey={workspace.requirementsReviewKey}
                />
                <PlayerRankHud />
                {aiEnabled ? (
                  <AiEngineerPanel
                    architecture={workspace.architecture}
                    onAttention={workspace.setAttentionComponentId}
                    onShowOnCanvas={workspace.focusComponentInPresentation}
                    onShowRegionOnMap={workspace.focusRegionInPresentation}
                    onPinObservation={workspace.pinObservation}
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
          playbackPhase={workspace.playback.phase}
          playbackSpeed={workspace.playback.speed}
          timelineProgress01={workspace.playback.frame.timelineProgress01}
          timelineDurationMs={workspace.playback.timelineDurationMs}
          runState={workspace.runState}
          resultIsStale={workspace.resultIsStale}
          errors={workspace.simulationErrors}
          unexpectedError={workspace.unexpectedError}
          result={workspace.simulationResult}
          viewMode={workspace.viewMode}
          officialActive={workspace.officialSession !== null}
          officialSubmitting={workspace.officialSubmitting}
          officialCompleted={workspace.officialVerification?.eligible === true}
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
