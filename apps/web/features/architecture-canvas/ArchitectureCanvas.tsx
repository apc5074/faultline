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
  type Node,
  type NodeChange,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useMemo, useState, type DragEvent } from "react";

import { tinyApiChallenge } from "@faultline/challenges";
import { componentRegistry } from "@faultline/component-catalog";
import type { Architecture, ComponentDefinition, ComponentInstance } from "@faultline/core";

type ArchitectureNodeData = {
  component: ComponentInstance;
  definition: ComponentDefinition;
};

type ArchitectureNode = Node<ArchitectureNodeData, "architecture">;

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
      <Handle className="architecture-node__handle" type="source" position={Position.Right} aria-label="Output port" />
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
        edges={[]}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
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
