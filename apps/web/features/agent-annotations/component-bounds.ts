import { componentRegistry } from "@faultline/component-catalog";
import type { Architecture, ComponentInstance } from "@faultline/core";

import { glyphDimensionsForProps, glyphPropsFromComponent } from "@/features/playground-glyphs";

export type ComponentBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
  cx: number;
  cy: number;
};

export function componentBounds(component: ComponentInstance): ComponentBounds {
  const definition = componentRegistry.get(component.type);
  const glyph = glyphPropsFromComponent(component, definition);
  const { width, height } = glyphDimensionsForProps(glyph);
  return {
    x: component.ui.x,
    y: component.ui.y,
    width,
    height,
    cx: component.ui.x + width / 2,
    cy: component.ui.y + height / 2,
  };
}

export function findComponentBounds(
  architecture: Architecture,
  componentId: string,
): ComponentBounds | null {
  const component = architecture.components.find((candidate) => candidate.id === componentId);
  if (!component) return null;
  return componentBounds(component);
}
