import {
  adapters,
  ConfigStore,
  configFilePath,
  configDir,
  logDir,
  evaluateSuppression,
  fireNotification,
  loggerFromConfig,
  resolveProjectKey,
  projectDisplayName,
  stubNotifyAppend,
  type ToolName,
  ToolNameSchema,
} from '@agent-notifier/core';

async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk: Buffer | string) => {
      data += chunk.toString();
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

function tzGuess(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

export async function runHook(toolFlag: string): Promise<void> {
  const tool: ToolName = ToolNameSchema.parse(toolFlag);
  const raw = await readStdin();
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    process.exit(0);
  }

  const event = adapters[tool](payload);
  if (!event) process.exit(0);

  const tz = tzGuess();
  const store = new ConfigStore(configFilePath(), tz);
  const config = store.load();
  const projectKey = resolveProjectKey(event.cwd);
  event.project = projectDisplayName(projectKey);

  const decision = await evaluateSuppression(config, new Date(), event, projectKey, process.ppid);
  const logger = loggerFromConfig(config, logDir());
  logger.append({
    ts: new Date().toISOString(),
    tool: event.tool,
    kind: event.kind,
    project: event.project,
    sessionId: event.sessionId,
    fired: decision.fire,
    ...(decision.reason !== undefined && { suppressReason: decision.reason }),
    ...(decision.gateMode !== undefined && { gateMode: decision.gateMode }),
    ...(decision.gateDecision !== undefined && { gateDecision: decision.gateDecision }),
    ...(event.message !== undefined && { msg: event.message }),
  });

  if (!decision.fire) process.exit(0);

  if (process.env['AGENT_NOTIFIER_NOTIFY_IMPL'] === 'stub') {
    stubNotifyAppend(configDir(), event);
  } else {
    await fireNotification(event);
  }
}
