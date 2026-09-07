# NEXUS AI-Assisted Development Rules for the Event

## Event compliance
Use AI as an implementation assistant only after the event begins.
All NEXUS application code must be written during the event unless organizers explicitly permit otherwise.

## Before generating code
- Read the relevant specification.
- Do not change the frozen incident contract without team agreement.
- Keep modules small.
- Prefer simple dependencies.
- Do not invent unsupported platform capabilities.
- Do not silently change architecture.

## During implementation
- Implement one stage at a time.
- Run the relevant test immediately.
- Review AI-generated diffs before accepting them.
- Do not refactor working networking code unnecessarily.
- Keep logs useful for demo/debugging.
- Preserve truthful status semantics.

## Transport truthfulness
- WebRTC = primary.
- Local LAN WebSocket = explicit event-time fallback when real devices can reach the signaling server.
- BroadcastChannel = development/application-logic testing only.
- Never call BroadcastChannel a real mesh/network in the presentation.

## Security/integrity baseline
Full end-to-end encryption is not an MVP requirement.
The MVP must still perform schema validation, malformed-payload rejection, incident ID/version validation, deduplication, TTL/hop validation, and safe handling of unexpected peer messages.

## AI should NOT
- Pretend a fallback is real mesh networking.
- Add paid services without approval.
- Silently change architecture.
- Introduce complex infrastructure to solve a small problem.
- Invent new field names when the contract already defines one.

## Prompt logging — mandatory
The event requires prompts and project details to be submitted within 24 hours.
Keep a timestamped log of every prompt actually sent to the AI tool, including material edits.

Recommended record:
```text
timestamp
stage
tool
prompt-file/version
actual prompt text or approved record
result/commit
```

Do not reconstruct the log from memory.
