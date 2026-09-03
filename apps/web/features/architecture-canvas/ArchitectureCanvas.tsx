"use client";

import { ReactFlowProvider } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useState, Suspense } from "react";
import Link from "next/link";

import { StartOfficialAttempt } from "@/features/official-attempt/StartOfficialAttempt";
import { OfficialScorecard } from "@/features/official-attempt/OfficialScorecard";
import { AccountAuthPlate } from "@/features/account/AccountAuthPlate";
import { AuthCallbackNotice } from "@/features/account/AuthCallbackNotice";
import { PlayerStreakHud } from "@/features/account/PlayerStreakHud";
import { OfficialAttemptProvider } from "@/features/official-attempt/OfficialAttemptContext";
import { AgentSessionProvider, useCurrentArchitectureRevision, useInterviewSnapshot } from "@/features/agent-session/AgentSessionProvider";
import { InterviewV2StatusPanel } from "@/features/agent-session/InterviewV2StatusPanel";
import { InterviewLiveSpotlightBridge } from "@/features/agent-session/InterviewLiveSpotlightBridge";
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
import { PlaygroundChallengeProvider, usePlaygroundChallenge } from "@/features/architecture-canvas/playground-challenge";
import { SimBar } from "@/features/architecture-canvas/SimBar";
import { RunVerdictChip } from "@/features/architecture-canvas/RunVerdictChip";
import { runVerdictSummary } from "@/features/architecture-canvas/run-verdict";
import { isLevel1LoadAnswerEnabled } from "@/features/architecture-canvas/level1-hero-scene";
import { usePlaygroundWorkspace } from "@/features/architecture-canvas/usePlaygroundWorkspace";
import { HomeHelp } from "@/features/home/HomeHelp";

function InterviewStatusPanelBridge() {
  const interviewSnapshot = useInterviewSnapshot();
  const currentArchitectureRevision = useCurrentArchitectureRevision();
  return <InterviewV2StatusPanel snapshot={interviewSnapshot} currentArchitectureRevision={currentArchitectureRevision} />;
}

function ArchitectureWorkspace() {
  const { challenge } = usePlaygroundChallenge();
  const workspace = usePlaygroundWorkspace();
  const briefing = useLevelBriefing();
  const loadAnswerEnabled = isLevel1LoadAnswerEnabled();
  const verdictRevealed = workspace.simulationResult !== null && workspace.runState === "complete";
  const verdict = useMemo(
    () => workspace.simulationResult ? runVerdictSummary(workspace.simulationResult) : null,
    [workspace.simulationResult],
  );
  const [webMcpStatus, setWebMcpStatus] = useState<WebMcpStatus>({
    state: "unsupported",
    readToolCount: 0,
    visualToolCount: 0,
    failedToolCount: 0,
    invocationObserved: false,
  });
  const handleWebMcpStatus = useCallback(
    (status: WebMcpStatus) => setWebMcpStatus(status),
    []
  );

  const shell = (
    <>
      <SelectionSessionSync selectedComponentId={workspace.selectedComponentId} />
      <AnnotationRunLifecycle runState={workspace.runState} runKey={workspace.lastRunKey} />
      <InterviewLiveSpotlightBridge
        onPresentationCue={workspace.spotlightPresentationCue}
        onModeledFailure={workspace.applyInterviewModeledFailure}
      />
      <WebMcpRegistration
        reconciliationKey={workspace.webMcpReconciliationKey}
        onStatusChange={handleWebMcpStatus}
        onFocusComponent={workspace.focusComponentInPresentation}
        onCenterComponent={workspace.focusComponentCamera}
        onFocusConnection={workspace.focusConnectionInPresentation}
        onPresentationCue={workspace.spotlightPresentationCue}
        onFocusRegion={workspace.focusRegionInPresentation}
        onPinObservation={workspace.pinObservation}
      />
      <LevelBriefing
        open={briefing.open}
        onClose={briefing.closeBriefing}
        onStartDesigning={workspace.startOfficialAttemptFromBriefing}
      />
      <HomeHelp
        initialOpen={briefing.helpOpen}
        onContinue={briefing.closeHelp}
        showTrigger={false}
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
          <div className="playground-topbar__agent-status">
            <WebMcpStatusPlate status={webMcpStatus} />
          </div>
          <AccountAuthPlate nextPath="/level/1" minimal compact />
        </header>
        <Suspense fallback={null}>
          <AuthCallbackNotice />
        </Suspense>
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
              challenge={challenge}
              selectedComponentId={workspace.selectedComponentId}
              worldSelection={workspace.worldSelection}
              showSimulationVisuals={workspace.showSimulationVisuals}
              resultIsStale={workspace.resultIsStale}
              geographicRoutes={
                workspace.simulationResult?.geographicRoutes ?? []
              }
              worldRoutesAnimating={workspace.playback.phase === "playing"}
              worldRoutesStale={workspace.resultIsStale}
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
              onViewportInteraction={workspace.setCanvasInteraction}
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
                  onClick={() => undefined}
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
            <InterviewStatusPanelBridge />
            <ObservationPins observations={workspace.pinnedObservations} stale={workspace.resultIsStale} onClear={workspace.clearPinnedObservations} />
            {workspace.officialVerification ? (
              <OfficialScorecard result={workspace.officialVerification} stale={workspace.resultIsStale} />
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
                {!workspace.officialVerification?.eligible || workspace.resultIsStale ? (
                  <RequirementsHud
                    key={`requirements-review-${workspace.requirementsReviewKey}`}
                    result={workspace.simulationResult}
                    runState={workspace.runState}
                    resultIsStale={workspace.resultIsStale}
                    reviewKey={workspace.requirementsReviewKey}
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
          onViewModeChange={workspace.handleViewModeChange}
          onSubmitOfficial={workspace.onSubmitOfficial}
        />
      </section>
    </>
  );

  return (
    <AgentSessionProvider
      architecture={workspace.architecture}
      challenge={challenge}
    >
      {shell}
    </AgentSessionProvider>
  );
}

export function ArchitectureCanvas() {
  return (
    <OfficialAttemptProvider>
      <PlaygroundChallengeProvider>
        <ReactFlowProvider>
          <ArchitectureWorkspace />
        </ReactFlowProvider>
      </PlaygroundChallengeProvider>
    </OfficialAttemptProvider>
  );
}
