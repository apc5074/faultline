/**
 * Minimal Phase 5 response guidance. AGENT-001 expands this into the complete
 * coaching policy; keeping this here makes the output-length contract explicit.
 */
export const conciseResponseGuidance = [
  "Keep the visible answer concise and useful in a side panel.",
  "State one finding, support it with specific tool evidence when available, then ask one focused question.",
  "Do not provide a long system-design lecture or expose private reasoning.",
].join(" ");
