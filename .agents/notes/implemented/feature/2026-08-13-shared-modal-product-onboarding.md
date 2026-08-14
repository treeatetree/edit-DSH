# Agent Note: Shared-modal product onboarding

Status: implemented

English | [中文](2026-08-13-shared-modal-product-onboarding.zh.md)

## Problem

First-run onboarding mixed two interaction models: a viewport takeover for product context and a credential prompt that redirected users into Settings before they could enter a key. That made a short, ordered flow feel like two unrelated surfaces and left onboarding UI ownership split across packages. Restoring a shared modal must not add a second independent overlay or change the Host settings and credential boundaries.

## Decision

**One existing client Cordis plugin owns product onboarding.** `ui-settings-models` registers `deepseek-official` at order `0` in `settings.onboarding`. It does not register `welcome-notice`; [dropping the default welcome notice](2026-08-14-drop-default-welcome-notice.md) owns that absence. The shell continues to mount only the first incomplete entry, so dialogs cannot stack. No additional client package or plugin row is introduced.

**Both steps share one modal component.** `OnboardingModal` wraps the existing ui-primitives `Modal`, supplies the common title and content geometry, and owns `#root` inert for exactly the visible lifetime. Escape and mask clicks do not silently complete mandatory onboarding; each step exposes only its explicit actions. A step still loading private facts returns `null`, so it paints and blocks nothing.

**The welcome notice implementation remains in-package and is not a default occupancy.** Its exact copy and version live in `onboarding-copy.ts`. Loopback clients can still compare and write `ui-onboarding.welcomeNoticeVersion` through the existing settings API if that step is mounted. Default `apply` does not register it. No Host schema, API-proxy allowlist, or persistence implementation changes.

**The credential dialog reuses the existing editor and write boundary.** The Models join still decides whether any provider is usable. When the official DeepSeek reference is writable and missing, `ProviderEditor` renders in credential-only mode inside the shared modal. It validates the key and calls the existing `credentials.set`; it does not mutate provider settings. Save and continue waits for the write and refreshed readiness, while Configure later completes only the current coordinator pass.

## Alternatives considered

**Separate client plugins for the notice and credential steps.** Rejected because the product asks for one client Cordis plugin and the two surfaces share copy, ordering, modal chrome, and invalidation ownership.

**Move acknowledgement or credential logic into a new Host API.** Rejected because both backend contracts already express the required state and writes. A new endpoint would widen scope without changing user capability.

**Keep the credential step as navigation into Models.** Rejected because the key is the only required first-run field, and the existing editor can expose that write safely without sending the user through a second dialog.

**Keep the former full-viewport stage.** Rejected because the requested onboarding is a pair of dialogs over the current app, and the common ui-primitives modal already provides the appropriate portal, mask, and accessibility contract.

## Consequences

A fresh profile sees an inline DeepSeek key dialog only when no provider is usable. The internal-testing notice does not mount ([dropping the default welcome notice](2026-08-14-drop-default-welcome-notice.md)). Secrets remain write-only in `.credentials.yaml`, and already-ready or unsupported deployments render no onboarding chrome while readiness loads. The Models package still owns product-onboarding presentation as well as provider configuration. The shared modal remains the wrapper for the credential step after the historical [full-viewport beta notice removal](../simplification/2026-08-13-remove-first-run-beta-notice.md).
