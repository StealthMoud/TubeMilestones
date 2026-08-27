export interface LogEvent {
  requestId: string;
  functionName: string;
  stage: string;
  latencyMs?: number;
  userId?: string;
  errorCode?: string;
  connectionId?: string;
}

export function logEvent(event: LogEvent): void {
  // Call sites pass only identifiers and safe codes. Tokens and payloads are forbidden.
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), ...event }));
}
