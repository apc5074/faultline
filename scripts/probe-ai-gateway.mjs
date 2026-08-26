import { readFileSync } from "node:fs";

const apiKey = readEnvironmentValue("AI_GATEWAY_API_KEY");
const model = readEnvironmentValue("FAULTLINE_AGENT_MODEL");

if (!apiKey || !model) {
  report("misconfigured");
  process.exitCode = 1;
} else {
  try {
    const response = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        max_completion_tokens: 4,
        messages: [{ content: "Reply only: ok", role: "user" }],
        model,
      }),
    });

    report(response.ok ? "online" : response.status === 401 || response.status === 403 ? "unauthorized" : "unavailable");
    process.exitCode = response.ok ? 0 : 1;
  } catch {
    report("unavailable");
    process.exitCode = 1;
  }
}

function readEnvironmentValue(name) {
  if (process.env[name]) {
    return process.env[name];
  }

  let source;

  try {
    source = readFileSync(".env", "utf8");
  } catch {
    return undefined;
  }

  const line = source
    .split(/\r?\n/)
    .find((candidate) => candidate.startsWith(`${name}=`));

  if (line) {
    return line.slice(name.length + 1);
  }

  const marker = `${name}=`;
  const start = source.indexOf(marker);

  if (start === -1) {
    return undefined;
  }

  const valueStart = start + marker.length;
  const nextMarker = [
    "AI_GATEWAY_API_KEY=",
    "DB_PASS=",
    "DIRECT_CONNECT=",
    "FAULTLINE_AGENT_MODEL=",
    "NEXT_PUBLIC_SUPABASE_",
    "SUPABASE_",
    "## ",
  ]
    .filter((candidate) => candidate !== marker)
    .map((candidate) => source.indexOf(candidate, valueStart))
    .filter((index) => index !== -1)
    .reduce((nearest, index) => Math.min(nearest, index), source.length);

  return source.slice(valueStart, nextMarker).trim() || undefined;
}

function report(status) {
  console.log(JSON.stringify({ service: "ai-gateway", status }));
}
