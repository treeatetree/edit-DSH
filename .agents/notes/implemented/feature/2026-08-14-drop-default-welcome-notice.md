# Agent Note: Drop the default internal-testing notice

Status: implemented

English | [中文](2026-08-14-drop-default-welcome-notice.zh.md)

## Problem

`ui-settings-models` registered `welcome-notice` as the first `settings.onboarding` step. Loopback clients persist acknowledgement in `ui-onboarding.welcomeNoticeVersion`, but a remote or reverse-proxied browser uses process-local memory, so every reload remounts the 内测声明 dialog. That is the default experience of the public web deploy.

## Decision

Default `apply` registers only `deepseek-official` in `settings.onboarding`. `WelcomeNotice`, `welcome-store`, and `onboarding-copy.ts` stay in the package for unit tests and are not a slot occupancy. The Host `ui-onboarding` section and `welcomeNoticeVersion` field remain; nothing in the default client writes them.

This partially supersedes [shared-modal product onboarding](2026-08-13-shared-modal-product-onboarding.md): the shared modal and the credential step stay; the notice is no longer a default shipped step. The historical [full-viewport beta notice removal](../simplification/2026-08-13-remove-first-run-beta-notice.md) already dropped the takeover layout and telemetry copy.

## Alternatives considered

**Persist remote acknowledgement in `localStorage` so the notice appears once per browser.** Rejected because the user asked to stop the popup, not to remember it; a remote durable store would also widen the onboarding contract the shared-modal note kept on the Host settings API.

**Keep the step on loopback only.** Rejected because the same client bundle serves both, and a loopback-only occupancy still surprises anyone who opens the GUI without a usable provider after already seeing the notice on the remote deploy.

**Delete `WelcomeNotice` and the Host field.** Rejected as a larger cleanup than the product ask; in-package tests still pin the copy, store, and modal wrapper, and the durable field is harmless while unread.

## Consequences

A remote reload no longer opens 内测声明. First-run users with no usable provider still see the DeepSeek key dialog. Scenarios that used `welcomeNoticePending: true` to reach later chrome now boot directly into that chrome or the credential step.

## Testing

`ui-settings-models` apply tests expect a single `deepseek-official` occupancy and no `welcome-notice` id. `WelcomeNotice` unit tests still mount the component directly. Web e2e `onboarding-deepseek-config` asserts the notice is absent then completes the key write; `remote-welcome` asserts the notice never mounts on a non-loopback authority. The former `welcome.expected.md` golden is gone.
