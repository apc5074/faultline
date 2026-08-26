"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { LiveAgentContextFactory } from "@/lib/agent-context/create-agent-context";

const AgentContextFactoryContext = createContext<LiveAgentContextFactory | null>(null);

export function AgentContextFactoryProvider({
  factory,
  children,
}: {
  factory: LiveAgentContextFactory;
  children: ReactNode;
}) {
  return <AgentContextFactoryContext.Provider value={factory}>{children}</AgentContextFactoryContext.Provider>;
}

export function useAgentContextFactory(): LiveAgentContextFactory {
  const factory = useContext(AgentContextFactoryContext);
  if (!factory) {
    throw new Error("useAgentContextFactory must be used within AgentContextFactoryProvider.");
  }
  return factory;
}

export function useOptionalAgentContextFactory(): LiveAgentContextFactory | null {
  return useContext(AgentContextFactoryContext);
}
