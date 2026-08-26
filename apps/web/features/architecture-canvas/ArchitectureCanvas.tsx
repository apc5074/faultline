"use client";

import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection as FlowConnection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useMemo, useState, type DragEvent } from "react";

import { tinyApiChallenge } from "@faultline/challenges";
import { componentRegistry, postgresTierModels, serviceCapacityForInstances, serviceCapacityPerInstance } from "@faultline/component-catalog";
import { checkConnectionCompatibility, type Architecture, type ComponentDefinition, type ComponentInstance, type Connection as ArchitectureConnection } from "@faultline/core";
import { estimateMonthlyCost } from "@faultline/simulator";

type ArchitectureNodeData = {
  component: ComponentInstance;
  definition: ComponentDefinition;
};

type ArchitectureNode = Node<ArchitectureNodeData, "architecture">;

type FlowConnectionLike = {
  source?: string | null;
  sourceHandle?: string | null;
  target?: string | null;
  targetHandle?: string | null;
};

const initialArchitecture: Architecture = {
  version: 1,
  components: [],
  connections: [],
};

function componentToNode(component: ComponentInstance, selectedComponentId: string | null): ArchitectureNode {
  const definition = componentRegistry.get(component.type);
  return {
    id: component.id,
    type: "architecture",
    position: component.ui,
    data: { component, definition },
    selected: component.id === selectedComponentId,
  };
}

function ArchitectureNodeCard({ data, selected }: NodeProps<ArchitectureNode>) {
  return (
    <article className={`architecture-node ${selected ? "architecture-node--selected" : ""}`}>
      {data.definition.ports.map((port) => (
        <Handle
          key={port.id}
          id={port.id}
          className="architecture-node__handle"
          type={port.direction === "input" ? "target" : "source"}
          position={port.direction === "input" ? Position.Left : Position.Right}
          aria-label={port.label}
        />
      ))}
      <p className="architecture-node__eyebrow">Component</p>
      <strong>{data.definition.label}</strong>
      <span>{data.component.id}</span>
    </article>
  );
}

const nodeTypes = { architecture: ArchitectureNodeCard };

function ComponentPalette({ definitions }: { definitions: readonly ComponentDefinition[] }) {
  return (
    <aside className="component-palette" aria-label="Component palette">
      <p className="component-palette__title">Components</p>
      <p className="component-palette__hint">Drag onto the canvas</p>
      {definitions.map((definition) => (
        <div
          key={definition.type}
          className="component-palette__item"
          draggable
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("application/faultline-component-type", definition.type);
          }}
        >
          <strong>{definition.label}</strong>
          <span>{definition.category}</span>
        </div>
      ))}
    </aside>
  );
}

function formatCost(amount: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(amount);
}

function ComponentInspector({
  architecture,
  component,
  onConfigChange,
}: {
  architecture: Architecture;
  component: ComponentInstance | undefined;
  onConfigChange: (componentId: string, config: unknown) => void;
}) {
  if (!component) {
    return <aside className="component-inspector"><p>Select a component to inspect its configuration.</p></aside>;
  }

  const definition = componentRegistry.get(component.type);
  const cost = estimateMonthlyCost({ architecture, registry: componentRegistry });
  const monthlyCost = cost.lineItems.find((lineItem) => lineItem.componentId === component.id)?.amount ?? 0;

  if (component.type === "service") {
    const parsed = definition.configSchema.safeParse(component.config);
    if (!parsed.success) return null;
    const instances = parsed.data.instances as number;
    return (
      <aside className="component-inspector" aria-label="Stateless Service inspector">
        <p className="component-inspector__eyebrow">Stateless Service</p>
        <label>
          Instances
          <input
            type="number"
            min="1"
            max="10"
            step="1"
            value={instances}
            onChange={(event) => onConfigChange(component.id, { instances: Number(event.target.value) })}
          />
        </label>
        <dl>
          <div><dt>Capacity / instance</dt><dd>{serviceCapacityPerInstance.toLocaleString()} req/sec</dd></div>
          <div><dt>Estimated capacity</dt><dd>{serviceCapacityForInstances(instances).toLocaleString()} req/sec</dd></div>
          <div><dt>Monthly cost</dt><dd>{formatCost(monthlyCost)}</dd></div>
        </dl>
      </aside>
    );
  }

  if (component.type === "postgres") {
    const parsed = definition.configSchema.safeParse(component.config);
    if (!parsed.success) return null;
    const tier = parsed.data.tier as keyof typeof postgresTierModels;
    const model = postgresTierModels[tier];
    return (
      <aside className="component-inspector" aria-label="Postgres inspector">
        <p className="component-inspector__eyebrow">Postgres</p>
        <label>
          Tier
          <select value={tier} onChange={(event) => onConfigChange(component.id, { tier: event.target.value })}>
            {Object.keys(postgresTierModels).map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <dl>
          <div><dt>Read capacity</dt><dd>{model.readCapacityRps.toLocaleString()} req/sec</dd></div>
          <div><dt>Write capacity</dt><dd>{model.writeCapacityRps.toLocaleString()} req/sec</dd></div>
          <div><dt>Monthly cost</dt><dd>{formatCost(monthlyCost)}</dd></div>
        </dl>
      </aside>
    );
  }

  return (
    <aside className="component-inspector" aria-label="Traffic Source inspector">
      <p className="component-inspector__eyebrow">Traffic Source</p>
      <dl>
        <div><dt>Workload</dt><dd>{tinyApiChallenge.workload.requestsPerSecond.toLocaleString()} req/sec</dd></div>
        <div><dt>Monthly cost</dt><dd>{formatCost(monthlyCost)}</dd></div>
      </dl>
      <p className="component-inspector__hint">Traffic is configured by the challenge and cannot be edited here.</p>
    </aside>
  );
}

function createComponentInstance(definition: ComponentDefinition, position: { x: number; y: number }): ComponentInstance {
  const parsedConfig = definition.configSchema.safeParse(structuredClone(definition.defaultConfig));
  if (!parsedConfig.success) throw new Error(`Default configuration for ${definition.type} is invalid.`);

  return {
    id: `${definition.type}-${crypto.randomUUID()}`,
    type: definition.type,
    config: parsedConfig.data,
    deployments: [],
    ui: position,
  };
}

function connectionToEdge(connection: ArchitectureConnection): Edge {
  return {
    id: connection.id,
    source: connection.sourceComponentId,
    sourceHandle: connection.sourcePortId,
    target: connection.targetComponentId,
    targetHandle: connection.targetPortId,
    label: connection.type,
  };
}

function connectionFromFlow(connection: FlowConnectionLike, components: readonly ComponentInstance[]): ArchitectureConnection | null {
  if (!connection.source || !connection.target || !connection.sourceHandle || !connection.targetHandle) return null;
  const source = components.find((component) => component.id === connection.source);
  const target = components.find((component) => component.id === connection.target);
  if (!source || !target || !componentRegistry.has(source.type) || !componentRegistry.has(target.type)) return null;

  const sourcePort = componentRegistry.get(source.type).ports.find((port) => port.id === connection.sourceHandle);
  const targetPort = componentRegistry.get(target.type).ports.find((port) => port.id === connection.targetHandle);
  if (!sourcePort || !targetPort) return null;

  const type = sourcePort.connectionTypes.find((candidate) => targetPort.connectionTypes.includes(candidate));
  if (!type || !checkConnectionCompatibility(sourcePort, targetPort, type).valid) return null;

  return {
    id: `connection-${crypto.randomUUID()}`,
    sourceComponentId: source.id,
    sourcePortId: sourcePort.id,
    targetComponentId: target.id,
    targetPortId: targetPort.id,
    type,
  };
}

function ArchitectureWorkspace() {
  const [architecture, setArchitecture] = useState<Architecture>(initialArchitecture);
  const [selectedComponentId, setSelectedComponentId] = useState<string | null>(null);
  const { screenToFlowPosition } = useReactFlow();
  const paletteDefinitions = useMemo(
    () => componentRegistry.list().filter((definition) => tinyApiChallenge.allowedComponentTypes.includes(definition.type)),
    [],
  );

  const nodes = useMemo(
    () => architecture.components.map((component) => componentToNode(component, selectedComponentId)),
    [architecture.components, selectedComponentId],
  );
  const edges = useMemo(() => architecture.connections.map(connectionToEdge), [architecture.connections]);
  const selectedComponent = architecture.components.find((component) => component.id === selectedComponentId);

  const onNodesChange = useCallback((changes: NodeChange<ArchitectureNode>[]) => {
    setArchitecture((current) => {
      let components = current.components;

      for (const change of changes) {
        if (change.type === "position") {
          const position = change.position;
          if (!position) continue;
          components = components.map((component) =>
            component.id === change.id ? { ...component, ui: position } : component,
          );
        }

        if (change.type === "remove") {
          components = components.filter((component) => component.id !== change.id);
        }
      }

      if (components === current.components) return current;

      const componentIds = new Set(components.map((component) => component.id));
      return {
        ...current,
        components,
        connections: current.connections.filter(
          (connection) => componentIds.has(connection.sourceComponentId) && componentIds.has(connection.targetComponentId),
        ),
      };
    });

    for (const change of changes) {
      if (change.type === "select") setSelectedComponentId(change.selected ? change.id : null);
      if (change.type === "remove" && change.id === selectedComponentId) setSelectedComponentId(null);
    }
  }, [selectedComponentId]);

  const onDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback((event: DragEvent) => {
    event.preventDefault();
    const type = event.dataTransfer.getData("application/faultline-component-type");
    if (!tinyApiChallenge.allowedComponentTypes.includes(type) || !componentRegistry.has(type)) return;

    const component = createComponentInstance(
      componentRegistry.get(type),
      screenToFlowPosition({ x: event.clientX, y: event.clientY }),
    );
    setArchitecture((current) => ({ ...current, components: [...current.components, component] }));
    setSelectedComponentId(component.id);
  }, [screenToFlowPosition]);

  const onConfigChange = useCallback((componentId: string, config: unknown) => {
    setArchitecture((current) => {
      const component = current.components.find((candidate) => candidate.id === componentId);
      if (!component) return current;
      const parsed = componentRegistry.get(component.type).configSchema.safeParse(config);
      if (!parsed.success) return current;
      return {
        ...current,
        components: current.components.map((candidate) => candidate.id === componentId ? { ...candidate, config: parsed.data } : candidate),
      };
    });
  }, []);

  const isValidConnection = useCallback(
    (connection: FlowConnection | Edge) => connectionFromFlow(connection, architecture.components) !== null,
    [architecture.components],
  );

  const onConnect = useCallback((connection: FlowConnection) => {
    setArchitecture((current) => {
      const canonicalConnection = connectionFromFlow(connection, current.components);
      if (!canonicalConnection) return current;
      const isDuplicate = current.connections.some((existing) =>
        existing.sourceComponentId === canonicalConnection.sourceComponentId &&
        existing.sourcePortId === canonicalConnection.sourcePortId &&
        existing.targetComponentId === canonicalConnection.targetComponentId &&
        existing.targetPortId === canonicalConnection.targetPortId &&
        existing.type === canonicalConnection.type,
      );
      return isDuplicate ? current : { ...current, connections: [...current.connections, canonicalConnection] };
    });
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    const removedIds = new Set(changes.filter((change) => change.type === "remove").map((change) => change.id));
    if (removedIds.size === 0) return;
    setArchitecture((current) => ({
      ...current,
      connections: current.connections.filter((connection) => !removedIds.has(connection.id)),
    }));
  }, []);

  return (
    <section className="architecture-workspace" aria-label="Logical architecture workspace">
      <ComponentPalette definitions={paletteDefinitions} />
      <div className="architecture-canvas" aria-label="Logical architecture canvas">
      <div className="architecture-canvas__header">
        <div>
          <p className="wordmark">FAULTLINE</p>
          <h1>Logical architecture</h1>
        </div>
        <p>Move components to shape the design. Select a node, then press Delete to remove it.</p>
      </div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onConnect={onConnect}
        onEdgesChange={onEdgesChange}
        isValidConnection={isValidConnection}
        onDragOver={onDragOver}
        onDrop={onDrop}
        fitView
        fitViewOptions={{ padding: 0.35 }}
        deleteKeyCode={["Backspace", "Delete"]}
        minZoom={0.4}
        maxZoom={1.8}
      >
        <Background gap={24} size={1} />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable />
      </ReactFlow>
      </div>
      <ComponentInspector architecture={architecture} component={selectedComponent} onConfigChange={onConfigChange} />
    </section>
  );
}

export function ArchitectureCanvas() {
  return (
    <ReactFlowProvider>
      <ArchitectureWorkspace />
    </ReactFlowProvider>
  );
}
